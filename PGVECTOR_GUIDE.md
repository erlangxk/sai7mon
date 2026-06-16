# 完整指南：PostgreSQL + pgvector 集成

将 RAG 向量存储从内存迁移到生产级的 pgvector 数据库。

## 📋 前置条件

- Docker 和 Docker Compose
- Node.js 18+
- pnpm（或 npm）

## 🚀 快速开始

### 1️⃣ 启动数据库

```bash
# 从项目根目录
cd /Users/simonking/fifty/sai7mon

# 启动 PostgreSQL + pgvector + AGE
docker-compose up -d

# 验证容器运行
docker-compose ps

# 查看数据库初始化日志
docker-compose logs postgres
```

### 2️⃣ 安装依赖

```bash
# 安装 pg 驱动
pnpm install pg

# 可选：安装类型定义
pnpm install -D @types/pg
```

### 3️⃣ 测试连接

```bash
# 创建测试脚本或运行现有测试
pnpm dev  # 然后选择 testDatabaseConnection

# 或直接运行
npx tsx src/pgvectordb.ts
```

## 📊 架构对比

### 之前（内存向量存储）

```
用户问题
  ↓
Ollama Embedding (内存向量)
  ↓
哈希映射搜索
  ↓
LLM 回答
```

**问题**：
- ❌ 数据丢失（重启消失）
- ❌ 可扩展性差（内存有限）
- ❌ 无法持久化
- ❌ 无并发控制

### 之后（pgvector）

```
用户问题
  ↓
Ollama Embedding
  ↓
PostgreSQL + pgvector 存储
  ↓
向量索引搜索（IVFFlat/HNSW）
  ↓
LLM 回答
```

**优势**：
- ✅ 数据持久化
- ✅ 无限可扩展
- ✅ 高效索引搜索
- ✅ ACID 事务
- ✅ 并发支持

## 🔌 集成到 RAG 管道

### 更新 vector.ts（将 RAG 连接到 pgvector）

创建新函数 `ragWithPgvector`：

```typescript
import { initializeDatabase, insertVectorDocument, searchVectorDocuments } from "./pgvectordb"

export const ragWithPgvector = Effect.fn("ragWithPgvector")(
  function* (userQuestion: string) {
    const model = yield* LanguageModel.LanguageModel
    
    // 初始化数据库
    const pool = yield* initializeDatabase
    
    // 步骤 1: 将已存储的文档向量化并保存到 pgvector
    yield* Effect.logInfo("📚 Loading documents from pgvector...")
    for (const doc of knowledgeBase) {
      const embedding = yield* ollamaEmbedding(doc.content)
      yield* insertVectorDocument(pool, doc.content, embedding)
    }
    
    // 步骤 2: 嵌入用户问题
    const queryEmbedding = yield* ollamaEmbedding(userQuestion)
    
    // 步骤 3: 从 pgvector 搜索相似文档
    const results = yield* searchVectorDocuments(pool, queryEmbedding, 3)
    
    // 步骤 4: 构建提示词
    const contextText = results
      .map(doc => `[相似度: ${(doc.similarity * 100).toFixed(1)}%] ${doc.content}`)
      .join("\n\n")
    
    // 步骤 5: 调用 LLM
    const response = yield* model.generateText({
      prompt: `Based on this context, answer: ${userQuestion}\n\nContext:\n${contextText}`
    })
    
    pool.end()
    
    return {
      question: userQuestion,
      answer: response.text,
      sources: results.map(r => r.id)
    }
  }
)
```

## 📈 数据库性能优化

### 1. 索引选择

```sql
-- IVFFlat 索引（更快的搜索，更大的内存）
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- HNSW 索引（比 IVFFlat 更快，但构建时间长）
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### 2. 查询优化

```sql
-- 使用 EXPLAIN 分析查询计划
EXPLAIN ANALYZE
SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
FROM documents
ORDER BY embedding <=> $1::vector
LIMIT 5;

-- 缓存查询结果（应用层）
CREATE MATERIALIZED VIEW popular_searches AS
  SELECT id, content, embedding, COUNT(*) as search_count
  FROM documents
  GROUP BY id, content, embedding;
```

### 3. 批量操作

```typescript
// 批量插入（而不是逐个插入）
const batchInsertVectors = Effect.fn("batchInsertVectors")(
  function* (pool: pg.Pool, documents: Array<{content: string, embedding: number[]}>) {
    const query = `
      INSERT INTO documents (content, embedding) VALUES
      ${documents.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::vector)`).join(",")}
    `
    
    const params = documents.flatMap(doc => [
      doc.content,
      `[${doc.embedding.join(",")}]`
    ])
    
    yield* executeQuery(pool, query, params)
  }
)
```

## 🔄 完整工作流示例

### 创建 RAG 应用程序

```typescript
import { Effect } from "effect"
import { 
  initializeDatabase, 
  insertVectorDocument, 
  searchVectorDocuments,
  getAllDocuments 
} from "./pgvectordb"
import { ollamaEmbedding } from "./vector"
import { LanguageModel } from "effect/unstable/ai"

export const completeRAGApp = Effect.gen(function* () {
  yield* Effect.logInfo("🚀 Starting Complete RAG Application")
  
  // 初始化
  const pool = yield* initializeDatabase
  const model = yield* LanguageModel.LanguageModel
  
  // 第一次运行：索引知识库
  yield* Effect.logInfo("\n1️⃣ Indexing knowledge base...")
  const documents = [
    "Effect-TS provides functional programming tools",
    "Streams in Effect handle async sequences",
    "Services use Context for dependency injection"
  ]
  
  for (const doc of documents) {
    const embedding = yield* ollamaEmbedding(doc)
    const result = yield* insertVectorDocument(pool, doc, embedding)
    yield* Effect.logInfo(`  ✓ Indexed: ${result.id}`)
  }
  
  // 用户查询
  const questions = [
    "What is Effect-TS?",
    "How do streams work?",
    "Tell me about dependency injection"
  ]
  
  for (const question of questions) {
    yield* Effect.log(`\n👤 Question: ${question}`)
    
    // 嵌入问题
    const queryEmbedding = yield* ollamaEmbedding(question)
    
    // 搜索
    const results = yield* searchVectorDocuments(pool, queryEmbedding, 2)
    
    // 上下文
    const context = results
      .map(r => `- ${r.content}`)
      .join("\n")
    
    // 生成答案
    const response = yield* model.generateText({
      prompt: `Context:\n${context}\n\nQuestion: ${question}`
    })
    
    yield* Effect.log(`🤖 Answer: ${response.text}`)
  }
  
  // 统计
  const allDocs = yield* getAllDocuments(pool)
  yield* Effect.log(`\n📊 Total documents: ${allDocs.length}`)
  
  pool.end()
})
```

## 🛡️ 常见问题

### Q1: 如何更新已有的向量？

```typescript
const updateVector = `
  UPDATE documents 
  SET embedding = $2::vector
  WHERE id = $1
`

yield* executeQuery(pool, updateVector, [docId, newEmbedding])
```

### Q2: 如何删除旧数据？

```typescript
const deleteOldDocs = `
  DELETE FROM documents 
  WHERE created_at < NOW() - INTERVAL '30 days'
`

yield* executeQuery(pool, deleteOldDocs)
```

### Q3: 支持多少条数据？

PostgreSQL + pgvector 支持：
- **小规模**: 1M+ 向量（内存索引）
- **中等规模**: 10M+ 向量（磁盘索引）
- **大规模**: 100M+ 向量（分片或专业向量库）

### Q4: 搜索速度多快？

基准测试（使用 ivfflat 索引）：
- 100K 向量：<10ms
- 1M 向量：20-50ms
- 10M 向量：100-200ms

## 📦 Docker 命令速查

```bash
# 启动
docker-compose up -d

# 停止
docker-compose stop

# 删除（包括数据）
docker-compose down -v

# 查看日志
docker-compose logs -f postgres

# 进入 psql
docker-compose exec postgres psql -U postgres

# 备份数据库
docker-compose exec postgres pg_dump -U postgres > backup.sql

# 恢复数据库
docker-compose exec postgres psql -U postgres < backup.sql
```

## 🔗 下一步

1. ✅ 启动 Docker 环境
2. ✅ 连接到数据库
3. ✅ 实现完整 RAG 管道
4. ✅ 性能监控和优化
5. ✅ 在生产环境中部署

参考文件：
- `docker/Dockerfile` - 容器定义
- `docker-compose.yml` - 服务编排
- `src/pgvectordb.ts` - 数据库操作
- `src/vector.ts` - RAG 管道

---

有问题？检查 `docker/README.md` 中的故障排查部分。
