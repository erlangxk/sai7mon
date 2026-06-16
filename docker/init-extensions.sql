-- ============================================================================
-- PostgreSQL Extension 初始化脚本
-- 这个脚本在容器启动时自动运行
-- ============================================================================

-- 创建 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建 Apache AGE 扩展
CREATE EXTENSION IF NOT EXISTS age;

-- 设置 AGE 搜索路径
SET search_path = ag_catalog, "$user", public;

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
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ag_graph WHERE name = 'documents_graph') THEN
        PERFORM create_graph('documents_graph');
    END IF;
END
$$;

-- 创建图节点
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM ag_label l
        JOIN ag_graph g ON g.graphid = l.graph
        WHERE g.name = 'documents_graph' AND l.name = 'document' AND l.kind = 'v'
    ) THEN
        PERFORM create_vlabel('documents_graph', 'document');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM ag_label l
        JOIN ag_graph g ON g.graphid = l.graph
        WHERE g.name = 'documents_graph' AND l.name = 'relates_to' AND l.kind = 'e'
    ) THEN
        PERFORM create_elabel('documents_graph', 'relates_to');
    END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE postgres TO postgres;
