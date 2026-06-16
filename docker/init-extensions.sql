-- ============================================================================
-- PostgreSQL Extension 初始化脚本
-- 这个脚本在容器启动时自动运行
-- ============================================================================

-- 创建 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建 Apache AGE 扩展
CREATE EXTENSION IF NOT EXISTS age;

-- 设置 AGE 搜索路径
SELECT * from ag_catalog.ag_graph;

-- 为演示创建示例表
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(384),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高向量搜索性能
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- 为演示创建 AGE 图
SELECT * FROM ag_create_graph('documents_graph');

-- 创建图节点
SELECT ag_catalog.create_vlabel('documents_graph', 'document');
SELECT ag_catalog.create_elabel('documents_graph', 'relates_to');

GRANT ALL PRIVILEGES ON DATABASE postgres TO postgres;
