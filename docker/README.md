# PostgreSQL + pgvector + Apache AGE Docker 设置

这个 Docker 配置包含完整的向量数据库和图数据库功能。

## 🚀 快速开始

### 1. 启动容器

```bash
# 从项目根目录
docker-compose up -d

# 查看容器状态
docker-compose ps

# 查看日志（检查扩展是否加载成功）
docker-compose logs postgres
```

### 2. 连接到 PostgreSQL

```bash
# 使用 psql 连接
psql -h localhost -U postgres -d postgres

# 在容器内执行命令
docker-compose exec postgres psql -U postgres -d postgres
```

### 3. 验证扩展已安装

```bash
# 在 psql 中运行
\dx

# 应该看到:
# pgvector
# age
# plpgsql
```

## 🛠️ 常用命令

### 查看所有容器
```bash
docker-compose ps
```

### 停止容器
```bash
docker-compose down
```

### 停止并删除数据
```bash
docker-compose down -v
```

### 查看数据库日志
```bash
docker-compose logs -f postgres
```

### 进入 PostgreSQL 命令行
```bash
docker-compose exec postgres psql -U postgres
```

### 执行 SQL 文件
```bash
docker-compose exec postgres psql -U postgres < your_script.sql
```

## 📊 pgvector 使用示例

### 创建向量表

```sql
-- 创建表
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding vector(384)  -- 384 维向量 (all-minilm:22m)
);

-- 创建索引（使用 IVFFlat）
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops);

-- 创建索引（使用 HNSW）
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

### 插入向量

```sql
-- 插入数据
INSERT INTO documents (content, embedding) VALUES
('Hello world', '[0.1, 0.2, 0.3, ...]'::vector);

-- 相似度搜索（余弦相似度）
SELECT id, content, embedding <-> '[0.1, 0.2, 0.3, ...]'::vector AS distance
FROM documents
ORDER BY embedding <-> '[0.1, 0.2, 0.3, ...]'::vector
LIMIT 5;

-- 搜索相似度 > 0.8
SELECT id, content, 1 - (embedding <=> '[0.1, 0.2, 0.3, ...]'::vector) AS similarity
FROM documents
WHERE 1 - (embedding <=> '[0.1, 0.2, 0.3, ...]'::vector) > 0.8;
```

### 向量操作符

| 操作符 | 说明 |
|--------|------|
| `<->` | 欧几里得距离 |
| `<=>` | 余弦距离 |
| `<#>` | 负内积 |

## 🔗 Apache AGE (图数据库) 使用示例

### 创建图和查询

```sql
-- 创建图
SELECT * FROM ag_catalog.ag_create_graph('my_graph');

-- 创建顶点标签
SELECT * FROM ag_catalog.create_vlabel('my_graph', 'person');
SELECT * FROM ag_catalog.create_vlabel('my_graph', 'document');

-- 创建边标签
SELECT * FROM ag_catalog.create_elabel('my_graph', 'knows');
SELECT * FROM ag_catalog.create_elabel('my_graph', 'authored');

-- 插入顶点
SELECT * FROM cypher('my_graph', $$
  CREATE (n:person {name: 'Alice', age: 30})
  CREATE (m:person {name: 'Bob', age: 25})
  CREATE (d:document {title: 'AI Paper', year: 2024})
$$) AS (a agtype);

-- 创建关系
SELECT * FROM cypher('my_graph', $$
  MATCH (a:person {name: 'Alice'}), (b:person {name: 'Bob'})
  CREATE (a)-[:knows {since: 2020}]->(b)
$$) AS (a agtype);

-- 查询图
SELECT * FROM cypher('my_graph', $$
  MATCH (n:person)-[r:knows]->(m:person)
  RETURN n.name, r.since, m.name
$$) AS (person1 agtype, since agtype, person2 agtype);
```

## 🌐 pgAdmin Web 界面

访问 `http://localhost:5050`

- 邮箱: admin@example.com
- 密码: admin

### 添加服务器

1. 右键 Servers → Register → Server
2. Name: PostgreSQL
3. 连接标签：
   - Host: postgres
   - Port: 5432
   - Username: postgres
   - Password: postgres

## 📁 文件结构

```
docker/
├── Dockerfile              # PostgreSQL + pgvector + AGE 镜像
├── init-extensions.sql    # 初始化脚本
└── README.md              # 本文件

docker-compose.yml         # Docker Compose 配置
```

## ⚙️ 环境配置

### PostgreSQL 参数

在 `docker-compose.yml` 中修改：

```yaml
environment:
  POSTGRES_INITDB_ARGS: "-c max_connections=200 -c shared_buffers=256MB"
```

### 性能调优

```sql
-- 查看当前配置
SHOW max_connections;
SHOW shared_buffers;
SHOW work_mem;

-- 动态调整（需要重启）
ALTER SYSTEM SET max_connections = 300;
SELECT pg_reload_conf();
```

## 🐛 故障排查

### 问题：连接被拒绝

```bash
# 检查容器是否运行
docker-compose ps

# 查看日志
docker-compose logs postgres

# 检查端口
lsof -i :5432
```

### 问题：扩展未加载

```bash
# 进入容器
docker-compose exec postgres bash

# 检查 pgvector 是否安装
find / -name "vector.so"

# 检查 AGE 是否安装
find / -name "age.so"

# 查看 PostgreSQL 日志
tail -f /var/log/postgresql/postgresql.log
```

### 问题：性能差

```sql
-- 分析索引效率
EXPLAIN ANALYZE
SELECT * FROM documents
ORDER BY embedding <-> '[0.1, 0.2, ...]'::vector
LIMIT 5;

-- 重建索引
REINDEX INDEX documents_embedding_idx;
```

## 🔐 安全建议

生产环境：

```yaml
environment:
  POSTGRES_PASSWORD: ${DB_PASSWORD}  # 使用环境变量
  POSTGRES_USER: ${DB_USER}
```

```bash
# .env 文件
DB_PASSWORD=your_strong_password
DB_USER=app_user
```

## 📚 相关资源

- [pgvector 文档](https://github.com/pgvector/pgvector)
- [Apache AGE 文档](https://github.com/apache/age)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)
- [pgAdmin 文档](https://www.pgadmin.org/docs/)

## 🚀 下一步

1. 将这个 PostgreSQL 服务连接到你的 Effect-TS RAG 应用
2. 存储向量到 pgvector 表
3. 使用 PostgreSQL 作为向量数据库后端
4. 探索图查询功能

更多信息见 `../src/vector.ts` 中的 RAG 实现。
