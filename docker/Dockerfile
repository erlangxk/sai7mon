# ============================================================================
# Builder stage: compile pgvector + Apache AGE against PostgreSQL 18
# ============================================================================
FROM postgres:18-bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    postgresql-server-dev-18 \
    ca-certificates \
    curl \
    flex \
    bison \
    pkg-config \
    libreadline-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN cd /tmp && \
    curl -fsSL https://github.com/pgvector/pgvector/archive/refs/tags/v0.8.2.tar.gz -o pgvector-v0.8.2.tar.gz && \
    tar -xzf pgvector-v0.8.2.tar.gz && \
    cd pgvector-0.8.2 && \
    make && \
    make install && \
    rm -rf /tmp/pgvector-0.8.2 /tmp/pgvector-v0.8.2.tar.gz

RUN cd /tmp && \
    curl -fsSL https://github.com/apache/age/releases/download/PG18%2Fv1.7.0-rc0/apache-age-1.7.0-src.tar.gz -o apache-age-1.7.0-src.tar.gz && \
    tar -xzf apache-age-1.7.0-src.tar.gz && \
    cd apache-age-1.7.0 && \
    make && \
    make install && \
    rm -rf /tmp/apache-age-1.7.0 /tmp/apache-age-1.7.0-src.tar.gz

# ============================================================================
# Runtime stage: only postgres runtime + compiled extension artifacts
# ============================================================================
FROM postgres:18-bookworm

COPY --from=builder /usr/lib/postgresql/18/lib/*.so /usr/lib/postgresql/18/lib/
COPY --from=builder /usr/lib/postgresql/18/lib/bitcode /usr/lib/postgresql/18/lib/bitcode
COPY --from=builder /usr/share/postgresql/18/extension /usr/share/postgresql/18/extension

# 创建初始化脚本
COPY docker/init-extensions.sql /docker-entrypoint-initdb.d/

# 暴露 PostgreSQL 端口
EXPOSE 5432

# 启动 PostgreSQL
CMD ["postgres"]
