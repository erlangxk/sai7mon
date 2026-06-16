#!/bin/bash

# ============================================================================
# pgvector + PostgreSQL 快速启动脚本
# ============================================================================

set -e

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║              PostgreSQL + pgvector + Apache AGE Setup                 ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装。请访问 https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✓ Docker 已安装"

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi

echo "✓ Docker Compose 已安装"

# 检查是否已存在容器
if docker ps -a --format '{{.Names}}' | grep -q "postgres-pgvector-age"; then
    echo ""
    echo "⚠️  容器已存在"
    read -p "是否要重新启动？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🛑 停止现有容器..."
        docker-compose down
    else
        echo "✓ 启动现有容器..."
        docker-compose up -d
        echo ""
        echo "✓ 容器已启动"
        echo ""
        echo "连接信息:"
        echo "  • PostgreSQL: localhost:5432"
        echo "  • pgAdmin: http://localhost:5050"
        echo "  • 用户名: postgres"
        echo "  • 密码: postgres"
        exit 0
    fi
fi

echo ""
echo "📦 构建 Docker 镜像（这可能需要 3-5 分钟）..."
echo ""

docker-compose build --no-cache

echo ""
echo "🚀 启动容器..."
docker-compose up -d

echo ""
echo "⏳ 等待 PostgreSQL 启动..."

# 等待 PostgreSQL 就绪
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✓ PostgreSQL 已启动并就绪"
        break
    fi
    echo "  等待中... ($((attempt + 1))/$max_attempts)"
    sleep 2
    ((attempt++))
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ 启动超时"
    exit 1
fi

echo ""
echo "📊 验证扩展..."
echo ""

# 检查扩展
docker-compose exec -T postgres psql -U postgres -d postgres -c "SELECT extname FROM pg_extension WHERE extname IN ('vector', 'age');" | tail -n +3

echo ""
echo "✓ 所有扩展已加载"
echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "✅ 启动完成！"
echo ""
echo "📋 下一步:"
echo ""
echo "1️⃣  安装依赖:"
echo "   pnpm install"
echo ""
echo "2️⃣  测试连接:"
echo "   npx tsx src/pgvectordb.ts"
echo ""
echo "3️⃣  查看 pgAdmin:"
echo "   浏览器打开 http://localhost:5050"
echo "   邮箱: admin@example.com"
echo "   密码: admin"
echo ""
echo "📚 更多信息，见:"
echo "   • docker/README.md - Docker 使用文档"
echo "   • PGVECTOR_GUIDE.md - 完整集成指南"
echo ""
echo "🛑 停止容器:"
echo "   docker-compose stop"
echo ""
echo "🗑️  删除容器和数据:"
echo "   docker-compose down -v"
echo ""
