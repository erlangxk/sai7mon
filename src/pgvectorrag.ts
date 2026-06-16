import { Effect } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import {
  initializeDatabase,
  insertVectorDocument,
  searchVectorDocuments,
  getAllDocuments,
  deleteAllDocuments,
} from "./pgvectordb";
import { ollamaEmbedding } from "./vector";

// ============================================================================
// 知识库
// ============================================================================

const knowledgeBase = [
  "Effect-TS is a TypeScript library for building concurrent, resilient, and testable effects using functional programming principles.",
  "Effect.gen allows writing imperative-style code with Effect using generators. The syntax yield* accesses results of effects.",
  "Services in Effect are created using Context.Service. They provide dependency injection and allow organizing code into modules.",
  "Error handling in Effect is type-safe. Define custom errors using Schema.TaggedErrorClass.",
  "Stream is used for processing sequences of values asynchronously with backpressure and error handling.",
  "pgvector is a PostgreSQL extension that enables storing and searching vector embeddings efficiently.",
  "RAG (Retrieval Augmented Generation) combines document retrieval with language models for accurate answers.",
];

// ============================================================================
// 完整的 RAG 程序（使用 pgvector 后端）
// ============================================================================

export const completeRAGWithPgvector = Effect.gen(function* () {
  yield* Effect.logInfo("════════════════════════════════════════════════════════════════");
  yield* Effect.logInfo("         Complete RAG with pgvector Backend");
  yield* Effect.logInfo("════════════════════════════════════════════════════════════════");

  const model = yield* LanguageModel.LanguageModel;
  const pool = yield* initializeDatabase;

  // 步骤 1: 初始化数据库
  yield* Effect.logInfo("\n📚 Step 1: Building vector database from knowledge base...");

  // 清除旧数据
  const deletedCount = yield* deleteAllDocuments(pool);
  yield* Effect.logInfo(`  Cleared ${deletedCount} old documents`);

  // 向量化并存储每个文档
  const documentIds: number[] = [];
  for (let i = 0; i < knowledgeBase.length; i++) {
    const doc = knowledgeBase[i];
    yield* Effect.logInfo(
      `  [${i + 1}/${knowledgeBase.length}] Embedding and storing...`,
    );

    const embedding = yield* ollamaEmbedding(doc);
    const result = yield* insertVectorDocument(pool, doc, embedding);
    documentIds.push(result.id);

    yield* Effect.logInfo(`    ✓ Stored as document ID ${result.id}`);
  }

  // 步骤 2: 处理用户查询
  yield* Effect.logInfo("\n🔍 Step 2: Processing user queries...");

  const queries = [
    "What is Effect-TS and how does it work?",
    "How do I handle errors in Effect?",
    "What is pgvector used for?",
    "Explain RAG (Retrieval Augmented Generation)",
  ];

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
    const userQuestion = queries[queryIndex];

    yield* Effect.logInfo(`\n─── Query ${queryIndex + 1}/${queries.length} ───`);
    yield* Effect.log(`👤 Question: "${userQuestion}"`);

    // 步骤 2a: 嵌入用户问题
    yield* Effect.logInfo("  Embedding question...");
    const queryEmbedding = yield* ollamaEmbedding(userQuestion);

    // 步骤 2b: 从 pgvector 搜索相似文档
    yield* Effect.logInfo("  Searching vector database...");
    const searchResults = yield* searchVectorDocuments(pool, queryEmbedding, 3);

    yield* Effect.logInfo(
      `  ✓ Found ${searchResults.length} relevant documents`,
    );

    if (searchResults.length === 0) {
      yield* Effect.log("🤖 No relevant documents found.");
      continue;
    }

    // 步骤 2c: 构建增强的提示词
    const contextText = searchResults
      .map(
        (doc, idx) =>
          `[${idx + 1}. Relevance: ${(doc.similarity * 100).toFixed(1)}%]\n${doc.content}`,
      )
      .join("\n\n");

    const augmentedPrompt = `You are an expert assistant. Answer the following question based ONLY on the provided context.

Context Documents:
${contextText}

Question: ${userQuestion}

Provide a clear, concise answer. If the context doesn't contain relevant information, say so.`;

    // 步骤 2d: 调用 LLM 生成答案
    yield* Effect.logInfo("  Generating answer with LLM...");
    const response = yield* model.generateText({
      prompt: augmentedPrompt,
    });

    // 显示结果
    yield* Effect.log(`\n🤖 Answer:\n${response.text}`);

    yield* Effect.log(
      `\n📚 Sources: ${searchResults.map((r) => `doc-${r.id} (${(r.similarity * 100).toFixed(0)}%)`).join(", ")}`,
    );
  }

  // 步骤 3: 统计信息
  yield* Effect.logInfo("\n📊 Step 3: Database statistics...");

  const allDocs = yield* getAllDocuments(pool);

  yield* Effect.log(`
Total Documents: ${allDocs.length}
Document IDs: ${allDocs.map((d) => d.id).join(", ")}
Vector Dimension: ${allDocs[0]?.embedding?.length || "N/A"}
  `);

  // 清理
  yield* Effect.logInfo("Closing database connection...");
  pool.end();

  yield* Effect.log("\n════════════════════════════════════════════════════════════════");
  yield* Effect.log("✅ RAG Pipeline Complete!");
  yield* Effect.log("════════════════════════════════════════════════════════════════\n");
});

// ============================================================================
// 性能演示
// ============================================================================

export const performanceDemo = Effect.gen(function* () {
  yield* Effect.logInfo("════════════════════════════════════════════════════════════════");
  yield* Effect.logInfo("               pgvector Performance Demo");
  yield* Effect.logInfo("════════════════════════════════════════════════════════════════");

  const pool = yield* initializeDatabase;

  // 测试不同数量的向量搜索性能
  const testCases = [10, 50, 100];

  for (const count of testCases) {
    yield* Effect.logInfo(`\n📊 Testing with ${count} documents...`);

    // 清除并插入文档
    yield* deleteAllDocuments(pool);

    const startInsert = Date.now();

    for (let i = 0; i < count; i++) {
      const text = `Document ${i}: ${knowledgeBase[i % knowledgeBase.length]}`;
      const embedding = yield* ollamaEmbedding(text);
      yield* insertVectorDocument(pool, text, embedding);
    }

    const insertTime = Date.now() - startInsert;
    yield* Effect.logInfo(`  Insert ${count} docs: ${insertTime}ms`);

    // 性能测试：搜索
    const queryEmbedding = yield* ollamaEmbedding("test query");

    const startSearch = Date.now();
    yield* searchVectorDocuments(pool, queryEmbedding, 5);
    const searchTime = Date.now() - startSearch;

    yield* Effect.logInfo(`  Search time: ${searchTime}ms`);
    yield* Effect.logInfo(
      `  Throughput: ${((count / insertTime) * 1000).toFixed(0)} docs/sec`,
    );
  }

  pool.end();

  yield* Effect.log("\n════════════════════════════════════════════════════════════════\n");
});

// ============================================================================
// 批量导入演示
// ============================================================================

export const bulkImportDemo = Effect.gen(function* () {
  yield* Effect.logInfo("════════════════════════════════════════════════════════════════");
  yield* Effect.logInfo("                Bulk Import Demo");
  yield* Effect.logInfo("════════════════════════════════════════════════════════════════");

  const pool = yield* initializeDatabase;

  // 清除数据
  yield* deleteAllDocuments(pool);

  yield* Effect.logInfo("\nImporting knowledge base...");

  // 批量导入
  for (const doc of knowledgeBase) {
    const embedding = yield* ollamaEmbedding(doc);
    const result = yield* insertVectorDocument(pool, doc, embedding);
    yield* Effect.logInfo(`✓ ${result.id}: ${doc.substring(0, 50)}...`);
  }

  // 显示统计
  const allDocs = yield* getAllDocuments(pool);

  yield* Effect.log(`
✅ Import complete!
   Total documents: ${allDocs.length}
   First document: ${allDocs[0]?.content.substring(0, 50)}...
  `);

  pool.end();

  yield* Effect.log("════════════════════════════════════════════════════════════════\n");
});

// ============================================================================
// 导出所有程序
// ============================================================================

export const programs = {
  completeRAG: completeRAGWithPgvector,
  performance: performanceDemo,
  bulkImport: bulkImportDemo,
};

// 主程序
export const program = Effect.gen(function* () {
  yield* Effect.logInfo(`
╔════════════════════════════════════════════════════════════════╗
║           pgvector RAG Integration Examples                   ║
╚════════════════════════════════════════════════════════════════╝

Available programs:
  1. completeRAG   - Full RAG pipeline with pgvector
  2. performance   - Performance testing
  3. bulkImport    - Bulk data import demonstration

Run with: npx tsx src/pgvectorrag.ts
  `);

  // 默认运行完整的 RAG 程序
  yield* completeRAGWithPgvector;
});
