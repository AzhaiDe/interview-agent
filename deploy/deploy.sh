#!/bin/bash
set -e

echo "🚀 开始部署 OfferPilot..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. 检查环境变量
echo -e "${BLUE}[1/6]${NC} 检查环境变量..."
if [ ! -f .env.production ]; then
    echo -e "${RED}✗ 缺少 .env.production 文件${NC}"
    echo -e "${YELLOW}请先运行:${NC} cp .env.production.example .env.production"
    exit 1
fi
echo -e "${GREEN}✓${NC} 环境变量文件存在"

# 2. 检查必要配置
echo -e "${BLUE}[2/6]${NC} 检查必要配置..."
if grep -q "BAILIAN_API_KEY=replace-me" .env.production; then
    echo -e "${RED}✗ 请配置 BAILIAN_API_KEY${NC}"
    exit 1
fi
if grep -q "JWT_SECRET=offerpilot-production-secret" .env.production; then
    echo -e "${YELLOW}⚠ 建议更换 JWT_SECRET 为随机值${NC}"
fi
echo -e "${GREEN}✓${NC} 配置检查通过"

# 3. 构建镜像
echo -e "${BLUE}[3/6]${NC} 构建 Docker 镜像..."
docker compose build --no-cache
echo -e "${GREEN}✓${NC} 镜像构建完成"

# 4. 停止旧服务
echo -e "${BLUE}[4/6]${NC} 停止旧服务..."
docker compose down
echo -e "${GREEN}✓${NC} 旧服务已停止"

# 5. 启动新服务
echo -e "${BLUE}[5/6]${NC} 启动新服务..."
docker compose up -d
echo -e "${GREEN}✓${NC} 新服务已启动"

# 6. 等待服务启动并健康检查
echo -e "${BLUE}[6/6]${NC} 等待服务启动..."
sleep 15

echo -e "${BLUE}执行健康检查...${NC}"
MAX_RETRIES=10
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://127.0.0.1:4310/api/v1/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 部署成功！${NC}"
        echo ""
        echo -e "${GREEN}服务状态:${NC}"
        docker compose ps
        echo ""
        echo -e "${BLUE}访问地址:${NC}"
        echo "  前端: http://127.0.0.1"
        echo "  后端: http://127.0.0.1:4310"
        echo ""
        echo -e "${YELLOW}查看日志:${NC} docker compose logs -f"
        exit 0
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 3
done

echo ""
echo -e "${RED}✗ 健康检查失败${NC}"
echo -e "${YELLOW}后端日志:${NC}"
docker compose logs --tail=50 backend
exit 1
