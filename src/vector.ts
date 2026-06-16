import { Effect, Schema } from "effect";
import { LanguageModel } from "effect/unstable/ai";

// ============================================================================
// 1. KNOWLEDGE BASE - 存储你的知识
// ============================================================================

interface Document {
  id: string;
  content: string;
  metadata: Record<string, string>;
}

const knowledgeBase: Document[] = [
  {
    id: "doc-1",
    content:
      "Effect-TS is a TypeScript library for building concurrent, resilient, and testable effects using functional programming principles. It provides tools for error handling, resource management, and composable async operations.",
    metadata: { topic: "effect-basics", type: "library" },
  },
  {
    id: "doc-2",
    content:
      "Effect.gen is a key feature that allows writing imperative-style code with Effect using generators. The syntax yield* is used to access results of effects, making async code readable and maintainable.",
    metadata: { topic: "effect-syntax", type: "tutorial" },
  },
  {
    id: "doc-3",
    content:
      "Services in Effect are created using Context.Service. They provide dependency injection and allow organizing code into modules. Services can be composed with Layers to create complex application architectures.",
    metadata: { topic: "services", type: "architecture" },
  },
  {
    id: "doc-4",
    content:
      "Error handling in Effect is type-safe. You can define custom errors using Schema.TaggedErrorClass. Use Effect.catch and Effect.catchTag to handle errors declaratively.",
    metadata: { topic: "error-handling", type: "best-practice" },
  },
  {
    id: "doc-5",
    content:
      "Stream is used for processing sequences of values asynchronously. It supports backpressure, error handling, and can be transformed with operators like map, filter, and reduce.",
    metadata: { topic: "streams", type: "data-processing" },
  },
];

// ============================================================================
// 2. OLLAMA EMBEDDING - 使用开源模型向量化
// ============================================================================

/**
 * Ollama API 配置
 * 确保 Ollama 服务正在运行: ollama serve
 * 使用的模型需要先下载: ollama pull nomic-embed-text
 */
const OLLAMA_CONFIG = {
  baseUrl: "http://localhost:11434",
  model: "nomic-embed-text", // 推荐: nomic-embed-text, all-minilm:22m, all-mpnet-base-v2
};

/**
 * 使用 Ollama 进行文本向量化
 * 调用本地运行的 Ollama 服务
 */
const ollamaEmbedding = Effect.fn("ollamaEmbedding")(
  function* (text: string) {
    try {
      yield* Effect.logDebug(
        `Embedding text (${text.length} chars) using ${OLLAMA_CONFIG.model}...`,
      );

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${OLLAMA_CONFIG.baseUrl}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: OLLAMA_CONFIG.model,
              prompt: text,
            }),
          }).then((res) => res.json() as Promise<{ embedding: number[] }>),
        catch: (error) =>
          new Error(
            `Ollama embedding failed: ${error instanceof Error ? error.message : String(error)}. Is Ollama running on ${OLLAMA_CONFIG.baseUrl}?`,
          ),
      });

      if (!response.embedding || !Array.isArray(response.embedding)) {
        return yield* Effect.fail(
          new Error("Invalid embedding response from Ollama"),
        );
      }

      return response.embedding;
    } catch (error) {
      return yield* Effect.fail(
        error instanceof Error
          ? error
          : new Error(String(error)),
      );
    }
  },
);

/**
 * 回退方案：简单的哈希向量化（当 Ollama 不可用时）
 * 用于演示和测试
 */
const fallbackEmbedding = (text: string): number[] => {
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(256).fill(0);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash = hash & hash;
    }
    const index = Math.abs(hash) % 256;
    vector[index] += 1 / words.length;
  }

  return vector;
};

// ============================================================================
// 3. VECTOR STORE - 向量数据库（支持 Ollama 异步嵌入）
// ============================================================================

interface VectorStore {
  documents: Document[];
  vectors: number[][];
}

/**
 * 构建向量存储（异步版本，使用 Ollama）
 * 会尝试使用 Ollama，如果失败则回退到简单哈希
 */
const buildVectorStore = Effect.fn("buildVectorStore")(
  function* (docs: Document[]) {
    const vectors: number[][] = [];

    yield* Effect.logInfo(
      `Building vector store for ${docs.length} documents using Ollama...`,
    );

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      yield* Effect.logInfo(`  [${i + 1}/${docs.length}] Processing ${doc.id}...`);

      // 尝试使用 Ollama，失败时回退到简单哈希
      const vector = yield* ollamaEmbedding(doc.content).pipe(
        Effect.catchTag("Error", (_error) => {
          yield* Effect.logWarn(
            `Failed to embed with Ollama, using fallback for ${doc.id}`,
          );
          return Effect.succeed(fallbackEmbedding(doc.content));
        }),
        Effect.catchAll((_error) => {
          yield* Effect.logWarn(
            `Failed to embed with Ollama, using fallback for ${doc.id}`,
          );
          return Effect.succeed(fallbackEmbedding(doc.content));
        }),
      );

      vectors.push(vector);
    }

    yield* Effect.logInfo(`✓ Vector store ready with ${vectors.length} vectors`);

    return {
      documents: docs,
      vectors,
    };
  },
);
};

/**
 * 计算两个向量的余弦相似度
 * 范围: -1 到 1 (1 = 最相似)
 */
const cosineSimilarity = (a: number[], b: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
};

/**
 * 在向量库中搜索最相似的文档
 */
const searchVectorStore = (
  store: VectorStore,
  query: string,
  topK: number = 3,
): Document[] => {
  const queryVector = simpleEmbedding(query);

  // 计算查询与所有文档的相似度
  const similarities = store.vectors.map((vector, index) => ({
    score: cosineSimilarity(queryVector, vector),
    doc: store.documents[index],
  }));

  // 按相似度排序并返回前 K 个
  return similarities
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.doc);
};

// ============================================================================
// 4. RAG 流程: 检索 + 增强 + 生成
// ============================================================================

const RAGExample = Schema.Struct({
  question: Schema.String,
  answer: Schema.String,
  sources: Schema.Array(Schema.String),
});

export const ragPipeline = Effect.fn("ragPipeline")(
  function* (userQuestion: string) {
    const model = yield* LanguageModel.LanguageModel;

    // 步骤 1: 构建向量存储（使用 Ollama 异步嵌入）
    const vectorStore = yield* buildVectorStore(knowledgeBase);

    // 步骤 2: 检索相关文档
    yield* Effect.logInfo(`\n🔍 Searching for relevant documents...`);
    const relevantDocs = searchVectorStore(vectorStore, userQuestion, 3);

    yield* Effect.logInfo(`✓ Found ${relevantDocs.length} relevant documents:`);
    for (const doc of relevantDocs) {
      yield* Effect.logInfo(`  - ${doc.id}: ${doc.content.substring(0, 60)}...`);
    }

    // 步骤 3: 构建增强的提示词
    const contextText = relevantDocs
      .map((doc) => `[${doc.id}] ${doc.content}`)
      .join("\n\n");

    const augmentedPrompt = `You are an expert in Effect-TS. Answer the following question based ONLY on the provided context.

Context:
${contextText}

Question: ${userQuestion}

Provide a clear, helpful answer based on the context. If the context doesn't contain relevant information, say so.`;

    // 步骤 4: 调用 LLM 生成答案
    yield* Effect.logInfo(`\n🤖 Calling LLM with context...`);
    const response = yield* model.generateText({
      prompt: augmentedPrompt,
    });

    yield* Effect.logInfo(`✓ LLM response received`);

    return {
      question: userQuestion,
      answer: response.text,
      sources: relevantDocs.map((doc) => doc.id),
    };
  },
);

// ============================================================================
// 5. 程序示例
// ============================================================================

export const simpleRAGProgram = Effect.gen(function* () {
  yield* Effect.logInfo("=".repeat(70));
  yield* Effect.logInfo("RAG (Retrieval Augmented Generation) Example");
  yield* Effect.logInfo("=".repeat(70));

  const question = "How do I define services in Effect?";

  const result = yield* ragPipeline(question);

  yield* Effect.log(`\n${"=".repeat(70)}`);
  yield* Effect.log(`Question: ${result.question}`);
  yield* Effect.log(`${"=".repeat(70)}`);
  yield* Effect.log(`Answer:\n${result.answer}`);
  yield* Effect.log(`${"=".repeat(70)}`);
  yield* Effect.log(`Sources: ${result.sources.join(", ")}`);
  yield* Effect.log(`${"=".repeat(70)}`);
});

// ============================================================================
// 6. 教学示例：不同查询展示向量检索的工作原理
// ============================================================================

export const demonstrateRetrieval = Effect.gen(function* () {
  yield* Effect.logInfo("=".repeat(70));
  yield* Effect.logInfo("Vector Retrieval Demonstration");
  yield* Effect.logInfo("=".repeat(70));

  const vectorStore = yield* buildVectorStore(knowledgeBase);

  const queries = [
    "What is Effect-TS?",
    "How to handle errors?",
    "What are generators?",
    "Tell me about data processing",
  ];

  for (const query of queries) {
    yield* Effect.log(`\n📝 Query: "${query}"`);
    const results = searchVectorStore(vectorStore, query, 2);

    for (let i = 0; i < results.length; i++) {
      yield* Effect.log(
        `  ${i + 1}. [${results[i].id}] ${results[i].content.substring(0, 70)}...`,
      );
    }
  }
});

// ============================================================================
// 7. 完整的多轮 RAG 对话
// ============================================================================

export const multiTurnRAG = Effect.gen(function* () {
  yield* Effect.logInfo("=".repeat(70));
  yield* Effect.logInfo("Multi-turn RAG Conversation");
  yield* Effect.logInfo("=".repeat(70));

  const model = yield* LanguageModel.LanguageModel;
  const vectorStore = yield* buildVectorStore(knowledgeBase);

  const questions = [
    "What is Effect-TS used for?",
    "How do services work?",
    "What about error handling?",
  ];

  for (const question of questions) {
    yield* Effect.log(`\n👤 User: ${question}`);

    // 检索相关文档
    const relevantDocs = searchVectorStore(vectorStore, question, 2);
    const contextText = relevantDocs
      .map((doc) => `[${doc.metadata.topic}] ${doc.content}`)
      .join("\n\n");

    // 生成答案
    const response = yield* model.generateText({
      prompt: `Based on this context, answer the question concisely:

Context:
${contextText}

Question: ${question}`,
    });

    yield* Effect.log(`\n🤖 Assistant: ${response.text}`);
    yield* Effect.log(`\n📚 Sources: ${relevantDocs.map((d) => d.metadata.topic).join(", ")}`);
  }
});

// ============================================================================
// 8. 核心概念总结
// ============================================================================

export const conceptsExplained = Effect.gen(function* () {
  const concepts = `
╔════════════════════════════════════════════════════════════════════════════╗
║                    RAG (检索增强生成) 核心概念                              ║
╚════════════════════════════════════════════════════════════════════════════╝

📌 问题: 为什么需要 RAG?
   - LLM 知识截断 (知识不是最新的)
   - 幻觉问题 (模型可能编造答案)
   - 需要使用专有知识/文档

🔄 RAG 流程 (4 个步骤):

  1️⃣  向量化 (Embedding)
      文本 → 向量 (数字表示)
      例: "Effect-TS is great" → [0.1, 0.5, 0.3, ...]
      
  2️⃣  存储 (Vector Store)
      将所有文档向量化后存储
      可以是: 内存数组、Pinecone、Weaviate、Qdrant等

  3️⃣  检索 (Retrieval)
      用户问题也转换为向量
      搜索最相似的文档 (使用余弦相似度)
      选出前 K 个最相关的文档

  4️⃣  增强提示词 (Augmentation)
      将检索到的文档内容插入到提示词中
      发送给 LLM: "基于这些文档，回答问题..."

📊 示例流程:

  输入: "What is Effect-TS?"
    ↓
  Embedding: [0.2, 0.8, 0.1, ..., 0.5]
    ↓
  Vector Search: 查找最相似的 3 个文档
    ↓
  检索结果:
    • doc-1: "Effect-TS is a TypeScript library..."
    • doc-2: "Effect.gen allows writing imperative-style..."
    • doc-5: "Stream is used for processing sequences..."
    ↓
  构建提示词:
    "Context: [doc-1 content]...[doc-2 content]...[doc-5 content]...
     Question: What is Effect-TS?"
    ↓
  LLM 生成答案 (基于检索到的知识)
    ↓
  输出: "Effect-TS is a TypeScript library for building..."
       Sources: doc-1, doc-2

🎯 关键指标:

  • 相似度分数 (0-1): 
    - 0.9-1.0: 非常相关
    - 0.7-0.9: 相关
    - 0.5-0.7: 有些相关
    - < 0.5: 不相关

  • Top-K: 检索前 K 个最相似的文档
    (通常 K=3-5 可以平衡质量和成本)

💡 生产环节注意:

  ✓ 使用专业 Embedding 模型 (不要用简单哈希!)
  ✓ 选择合适的向量数据库
  ✓ 定期更新知识库
  ✓ 监控检索质量和相关性
  ✓ 考虑文档分块策略

════════════════════════════════════════════════════════════════════════════`;

  yield* Effect.log(concepts);
});

// ============================================================================
// 9. OLLAMA 配置和使用指南
// ============================================================================

/**
 * Ollama 快速入门指南
 */
export const ollamaSetupGuide = Effect.gen(function* () {
  const guide = `
╔════════════════════════════════════════════════════════════════════════════╗
║                     Ollama Embedding 快速入门                             ║
╚════════════════════════════════════════════════════════════════════════════╝

📥 第1步: 下载并安装 Ollama
   访问: https://ollama.ai
   或使用 Homebrew (macOS):
   $ brew install ollama

🚀 第2步: 启动 Ollama 服务
   $ ollama serve
   (默认监听 http://localhost:11434)

📥 第3步: 下载 Embedding 模型

   推荐选项:
   
   1. nomic-embed-text (推荐) ⭐⭐⭐⭐⭐
      $ ollama pull nomic-embed-text
      - 大小: 274MB
      - 维度: 768
      - 速度: 快
      - 质量: 最好
   
   2. all-minilm:22m (轻量级) ⭐⭐⭐⭐
      $ ollama pull all-minilm:22m
      - 大小: 62MB
      - 维度: 384
      - 速度: 最快
      - 适合资源受限的环境

   3. all-mpnet-base-v2 (高质量)
      $ ollama pull all-mpnet-base-v2
      - 大小: 420MB
      - 维度: 768
      - 速度: 中等
      - 质量: 非常高

   4. bge-small-zh (中文优化)
      $ ollama pull bge-small-zh
      - 专门优化中文 embedding

📊 第4步: 验证安装

   $ curl -X POST http://localhost:11434/api/embeddings \\
     -H "Content-Type: application/json" \\
     -d '{"model":"nomic-embed-text","prompt":"hello world"}'
   
   成功响应:
   {"embedding":[0.1,0.2,0.3,...]}

⚙️  第5步: 配置代码

   在 vector.ts 中修改配置:
   
   const OLLAMA_CONFIG = {
     baseUrl: "http://localhost:11434",
     model: "nomic-embed-text",  // 改为你下载的模型
   };

🎯 第6步: 运行 RAG 程序

   $ npx tsx src/helloworld.ts  # 选择 simpleRAGProgram

📋 模型对比表

   ┌────────────────────┬────────┬────┬───────┬────────┐
   │ 模型               │ 大小   │维度│ 速度  │ 质量   │
   ├────────────────────┼────────┼────┼───────┼────────┤
   │ nomic-embed-text   │ 274MB  │768 │ ⭐⭐⭐ │⭐⭐⭐⭐⭐│
   │ all-minilm:22m     │ 62MB   │384 │ ⭐⭐⭐⭐│⭐⭐⭐⭐ │
   │ all-mpnet-base-v2  │ 420MB  │768 │ ⭐⭐⭐ │⭐⭐⭐⭐⭐│
   │ bge-small-zh       │ 190MB  │512 │ ⭐⭐⭐ │⭐⭐⭐⭐ │
   └────────────────────┴────────┴────┴───────┴────────┘

🔧 故障排查

   ❌ 错误: "Is Ollama running on http://localhost:11434?"
   ✓ 解决: 确保 ollama serve 正在运行

   ❌ 错误: "Model not found: nomic-embed-text"
   ✓ 解决: 运行 ollama pull nomic-embed-text

   ❌ 错误: 速度很慢
   ✓ 解决: 
     - 使用更小的模型 (all-minilm:22m)
     - 增加 GPU 支持 (如果可用)

💡 性能优化建议

   1. 批量 embedding:
      - 不要逐一 embedding，改为批量处理
      - 使用 Effect.all 或 Effect.forEach

   2. 缓存 embeddings:
      - 将计算过的向量存储到数据库
      - 避免重复计算

   3. GPU 加速:
      - Ollama 自动使用 GPU (如果可用)
      - 检查: ollama serve (启动时会显示)

════════════════════════════════════════════════════════════════════════════`;

  yield* Effect.log(guide);
});

/**
 * 测试 Ollama 连接
 */
export const testOllamaConnection = Effect.fn("testOllamaConnection")(
  function* () {
    yield* Effect.logInfo("Testing Ollama connection...");
    yield* Effect.logInfo(`Connecting to: ${OLLAMA_CONFIG.baseUrl}`);
    yield* Effect.logInfo(`Model: ${OLLAMA_CONFIG.model}`);

    // 测试简单的 embedding
    const testText = "Hello, Ollama!";
    const result = yield* ollamaEmbedding(testText).pipe(
      Effect.map((vector) => ({
        success: true,
        textLength: testText.length,
        vectorDimension: vector.length,
        sample: vector.slice(0, 5),
      })),
      Effect.catchAll((error) => {
        return Effect.succeed({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );

    if (result.success) {
      yield* Effect.log(
        `✓ Ollama connection successful!\n  Vector dimension: ${result.vectorDimension}\n  Sample: [${(result as any).sample.map((n: number) => n.toFixed(3)).join(", ")}...]`,
      );
    } else {
      yield* Effect.log(
        `✗ Failed to connect to Ollama: ${(result as any).error}`,
      );
    }

    return result;
  },
);
