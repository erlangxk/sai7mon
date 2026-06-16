import { Effect } from "effect";
import * as pg from "pg";

// ============================================================================
// PostgreSQL + pgvector 连接配置
// ============================================================================

const DB_CONFIG = {
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "postgres",
};

/**
 * 创建 PostgreSQL 连接池
 */
export const createPool = (): pg.Pool => {
  return new pg.Pool(DB_CONFIG);
};

/**
 * 初始化数据库连接
 */
export const initializeDatabase = Effect.fn("initializeDatabase")(
  function* () {
    const pool = createPool();

    yield* Effect.logInfo("Connecting to PostgreSQL...");
    yield* Effect.logInfo(`Host: ${DB_CONFIG.host}:${DB_CONFIG.port}`);

    // 测试连接
    try {
      const client = yield* Effect.tryPromise({
        try: () => pool.connect(),
        catch: (error) =>
          new Error(
            `Failed to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
          ),
      });

      // 检查扩展
      const result = yield* Effect.tryPromise({
        try: () =>
          client.query(`
            SELECT extname FROM pg_extension 
            WHERE extname IN ('vector', 'age')
          `),
        catch: (error) => new Error(`Failed to query extensions: ${error}`),
      });

      const extensions = (result as any).rows.map((row: any) => row.extname);
      yield* Effect.logInfo(`✓ Connected successfully`);
      yield* Effect.logInfo(
        `✓ Extensions loaded: ${extensions.length > 0 ? extensions.join(", ") : "None"}`,
      );

      client.release();

      return pool;
    } catch (error) {
      yield* Effect.fail(
        error instanceof Error
          ? error
          : new Error("Unknown error during initialization"),
      );
    }
  },
);

/**
 * 执行 SQL 查询
 */
export const executeQuery = Effect.fn("executeQuery")(
  function* (pool: pg.Pool, query: string, params: any[] = []) {
    const client = yield* Effect.tryPromise({
      try: () => pool.connect(),
      catch: (error) => new Error(`Connection failed: ${error}`),
    });

    try {
      const result = yield* Effect.tryPromise({
        try: () => client.query(query, params),
        catch: (error) =>
          new Error(
            `Query failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
      });

      return result;
    } finally {
      client.release();
    }
  },
);

// ============================================================================
// pgvector 操作
// ============================================================================

export interface VectorDocument {
  id: number;
  content: string;
  embedding: number[];
  created_at: string;
}

/**
 * 将文档向量插入数据库
 */
export const insertVectorDocument = Effect.fn("insertVectorDocument")(
  function* (
    pool: pg.Pool,
    content: string,
    embedding: number[],
  ) {
    const embeddingString = `[${embedding.join(",")}]`;

    const query = `
      INSERT INTO documents (content, embedding)
      VALUES ($1, $2::vector)
      RETURNING id, content, embedding, created_at;
    `;

    const result = yield* executeQuery(pool, query, [
      content,
      embeddingString,
    ]);

    const row = (result as any).rows[0];
    return {
      id: row.id,
      content: row.content,
      embedding: row.embedding,
      created_at: row.created_at,
    } as VectorDocument;
  },
);

/**
 * 向量相似度搜索
 */
export const searchVectorDocuments = Effect.fn("searchVectorDocuments")(
  function* (pool: pg.Pool, queryEmbedding: number[], topK: number = 5) {
    const embeddingString = `[${queryEmbedding.join(",")}]`;

    const query = `
      SELECT 
        id, 
        content, 
        embedding,
        created_at,
        1 - (embedding <=> $1::vector) AS similarity
      FROM documents
      ORDER BY embedding <=> $1::vector
      LIMIT $2;
    `;

    const result = yield* executeQuery(pool, query, [
      embeddingString,
      topK,
    ]);

    return (result as any).rows.map(
      (row: any) => ({
        id: row.id,
        content: row.content,
        embedding: row.embedding,
        created_at: row.created_at,
        similarity: row.similarity,
      }),
    );
  },
);

/**
 * 向量相似度搜索（使用余弦距离）
 */
export const cosineSimilaritySearch = Effect.fn("cosineSimilaritySearch")(
  function* (pool: pg.Pool, queryEmbedding: number[], threshold: number = 0.7) {
    const embeddingString = `[${queryEmbedding.join(",")}]`;

    const query = `
      SELECT 
        id, 
        content, 
        embedding,
        created_at,
        1 - (embedding <=> $1::vector) AS similarity
      FROM documents
      WHERE 1 - (embedding <=> $1::vector) > $2
      ORDER BY embedding <=> $1::vector;
    `;

    const result = yield* executeQuery(pool, query, [
      embeddingString,
      threshold,
    ]);

    return (result as any).rows.map(
      (row: any) => ({
        id: row.id,
        content: row.content,
        embedding: row.embedding,
        created_at: row.created_at,
        similarity: row.similarity,
      }),
    );
  },
);

/**
 * 获取所有文档
 */
export const getAllDocuments = Effect.fn("getAllDocuments")(
  function* (pool: pg.Pool) {
    const query = `SELECT id, content, embedding, created_at FROM documents ORDER BY created_at DESC`;

    const result = yield* executeQuery(pool, query);

    return (result as any).rows.map(
      (row: any) => ({
        id: row.id,
        content: row.content,
        embedding: row.embedding,
        created_at: row.created_at,
      }),
    );
  },
);

/**
 * 删除所有文档
 */
export const deleteAllDocuments = Effect.fn("deleteAllDocuments")(
  function* (pool: pg.Pool) {
    const query = `DELETE FROM documents`;
    const result = yield* executeQuery(pool, query);
    return (result as any).rowCount;
  },
);

// ============================================================================
// Apache AGE 图操作
// ============================================================================

/**
 * 创建图并初始化节点标签
 */
export const createGraph = Effect.fn("createGraph")(
  function* (pool: pg.Pool, graphName: string) {
    const queries = [
      `SELECT * FROM ag_catalog.ag_create_graph('${graphName}')`,
      `SELECT * FROM ag_catalog.create_vlabel('${graphName}', 'document')`,
      `SELECT * FROM ag_catalog.create_vlabel('${graphName}', 'keyword')`,
      `SELECT * FROM ag_catalog.create_elabel('${graphName}', 'relates_to')`,
    ];

    for (const query of queries) {
      yield* executeQuery(pool, query);
    }

    yield* Effect.logInfo(`✓ Graph '${graphName}' created successfully`);
  },
);

/**
 * 在图中创建文档节点
 */
export const createDocumentNode = Effect.fn("createDocumentNode")(
  function* (
    pool: pg.Pool,
    graphName: string,
    documentId: number,
    title: string,
  ) {
    const query = `
      SELECT * FROM cypher('${graphName}', $$
        CREATE (d:document {id: ${documentId}, title: '${title}'})
        RETURN d
      $$) AS (result agtype);
    `;

    yield* executeQuery(pool, query);
  },
);

/**
 * 在图中创建关系
 */
export const createRelationship = Effect.fn("createRelationship")(
  function* (
    pool: pg.Pool,
    graphName: string,
    fromId: number,
    toId: number,
    relationshipType: string = "relates_to",
  ) {
    const query = `
      SELECT * FROM cypher('${graphName}', $$
        MATCH (d1:document {id: ${fromId}}), (d2:document {id: ${toId}})
        CREATE (d1)-[:${relationshipType}]->(d2)
        RETURN d1, d2
      $$) AS (from agtype, to agtype);
    `;

    yield* executeQuery(pool, query);
  },
);

// ============================================================================
// 测试程序
// ============================================================================

export const testDatabaseConnection = Effect.gen(function* () {
  yield* Effect.logInfo("=".repeat(70));
  yield* Effect.logInfo("PostgreSQL + pgvector + Apache AGE Test");
  yield* Effect.logInfo("=".repeat(70));

  const pool = yield* initializeDatabase;

  yield* Effect.logInfo("\n📊 Inserting sample documents with vectors...");

  // 插入示例文档
  const doc1 = yield* insertVectorDocument(
    pool,
    "Effect-TS is a TypeScript library",
    Array(384)
      .fill(0)
      .map(() => Math.random() * 0.1),
  );

  const doc2 = yield* insertVectorDocument(
    pool,
    "PostgreSQL is a powerful database",
    Array(384)
      .fill(0)
      .map(() => Math.random() * 0.1),
  );

  yield* Effect.logInfo(`✓ Inserted document 1: ${doc1.id}`);
  yield* Effect.logInfo(`✓ Inserted document 2: ${doc2.id}`);

  yield* Effect.logInfo("\n🔍 Searching for similar documents...");

  const queryEmbedding = Array(384)
    .fill(0)
    .map(() => Math.random() * 0.1);

  const results = yield* searchVectorDocuments(pool, queryEmbedding, 5);

  yield* Effect.logInfo(`✓ Found ${results.length} similar documents:`);
  for (const result of results) {
    yield* Effect.logInfo(
      `  - ${result.id}: ${result.content.substring(0, 50)}... (similarity: ${(result.similarity * 100).toFixed(2)}%)`,
    );
  }

  yield* Effect.logInfo("\n📈 Retrieving all documents...");

  const allDocs = yield* getAllDocuments(pool);

  yield* Effect.logInfo(`✓ Total documents: ${allDocs.length}`);

  yield* Effect.logInfo("=".repeat(70));

  pool.end();
});
