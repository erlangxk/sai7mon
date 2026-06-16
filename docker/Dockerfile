# 使用 PostgreSQL 官方基础镜像
FROM postgres:16-bookworm

# 设置环境变量
ENV DEBIAN_FRONTEND=noninteractive

# 更新包管理器并安装依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    postgresql-server-dev-16 \
    git \
    curl \
    wget \
    pkg-config \
    libreadline-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# 安装 pgvector
# ============================================================================
RUN cd /tmp && \
    git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make && \
    make install && \
    rm -rf /tmp/pgvector

# ============================================================================
# 安装 Apache AGE (Graph Database Extension)
# ============================================================================
RUN cd /tmp && \
    git clone --branch v1.5.0 https://github.com/apache/age.git && \
    cd age && \
    make && \
    make install && \
    rm -rf /tmp/age

# 创建初始化脚本
COPY init-extensions.sql /docker-entrypoint-initdb.d/

# 暴露 PostgreSQL 端口
EXPOSE 5432

# 启动 PostgreSQL
CMD ["postgres"]
