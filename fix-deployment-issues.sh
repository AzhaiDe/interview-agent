#!/bin/bash
set -e

echo "🔧 自动修复部署问题..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 修复 HOST 绑定
echo -e "${YELLOW}[1/5]${NC} 修复 HOST 绑定地址..."
if grep -q 'host: process.env.HOST || "127.0.0.1"' src/config.ts; then
    sed -i.bak 's/host: process\.env\.HOST || "127\.0\.0\.1"/host: process.env.HOST || "0.0.0.0"/' src/config.ts
    echo -e "${GREEN}✓${NC} HOST 绑定已修复为 0.0.0.0"
else
    echo -e "${GREEN}✓${NC} HOST 绑定已经是正确的配置"
fi

# 2. 提示手动修复 CORS
echo ""
echo -e "${YELLOW}[2/5]${NC} CORS 配置需要手动修复..."
echo -e "${YELLOW}请编辑 src/server.ts，将第 27 行：${NC}"
echo "  await app.register(cors, { origin: true, credentials: true });"
echo -e "${YELLOW}替换为：${NC}"
echo "  const corsOrigins = process.env.CORS_ORIGIN"
echo "    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())"
echo "    : ['http://localhost', 'http://localhost:80'];"
echo "  await app.register(cors, { origin: corsOrigins, credentials: true });"
echo ""
read -p "是否现在编辑？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ${EDITOR:-vim} src/server.ts
fi

# 3. 生成 JWT Secret
echo ""
echo -e "${YELLOW}[3/5]${NC} 生成 JWT Secret..."
JWT_SECRET=$(openssl rand -base64 32)
echo -e "${GREEN}生成的 JWT_SECRET:${NC} $JWT_SECRET"
echo ""
echo -e "${YELLOW}请更新 .env 文件中的 JWT_SECRET:${NC}"
echo "JWT_SECRET=$JWT_SECRET"
echo ""
read -p "是否自动更新 .env 文件？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f .env ]; then
        sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
        echo -e "${GREEN}✓${NC} .env 文件已更新"
    else
        echo -e "${RED}✗${NC} .env 文件不存在，请先创建"
    fi
fi

# 4. 统一数据库路径
echo ""
echo -e "${YELLOW}[4/5]${NC} 统一数据库路径..."
# 修复 Dockerfile
if grep -q "mkdir -p /app/data$" Dockerfile; then
    sed -i.bak 's|mkdir -p /app/data$|mkdir -p /app/data-v2/uploads|' Dockerfile
    echo -e "${GREEN}✓${NC} Dockerfile 路径已统一"
else
    echo -e "${GREEN}✓${NC} Dockerfile 路径已经是正确的配置"
fi

# 修复 .env.example
if grep -q "DATABASE_PATH=/app/data/db.sqlite" .env.example; then
    sed -i.bak 's|DATABASE_PATH=/app/data/db.sqlite|DATABASE_PATH=/app/data-v2/offerpilot.sqlite|' .env.example
    sed -i.bak 's|UPLOAD_DIR=/app/data/uploads|UPLOAD_DIR=/app/data-v2/uploads|' .env.example
    echo -e "${GREEN}✓${NC} .env.example 路径已统一"
else
    echo -e "${GREEN}✓${NC} .env.example 路径已经是正确的配置"
fi

# 5. 创建缺失的配置文件
echo ""
echo -e "${YELLOW}[5/5]${NC} 创建缺失的配置文件..."

# 创建 nginx-ssl.conf
if [ ! -f nginx-ssl.conf ]; then
    cat > nginx-ssl.conf << 'EOF'
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # 缓存策略
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # HTML 不缓存
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # API 代理
    location /api/ {
        proxy_pass http://backend:4310;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # SPA 路由支持
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 健康检查端点
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
EOF
    echo -e "${GREEN}✓${NC} nginx-ssl.conf 已创建"
else
    echo -e "${GREEN}✓${NC} nginx-ssl.conf 已存在"
fi

# 创建前端 .env.production
if [ ! -f frontend/.env.production ]; then
    cat > frontend/.env.production << 'EOF'
VITE_API_BASE_URL=/api/v1
EOF
    echo -e "${GREEN}✓${NC} frontend/.env.production 已创建"
else
    echo -e "${GREEN}✓${NC} frontend/.env.production 已存在"
fi

# 创建部署脚本
if [ ! -f deploy/deploy.sh ]; then
    cat > deploy/deploy.sh << 'EOF'
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
EOF
    chmod +x deploy/deploy.sh
    echo -e "${GREEN}✓${NC} deploy/deploy.sh 已创建"
else
    echo -e "${GREEN}✓${NC} deploy/deploy.sh 已存在"
fi

# 创建备份脚本
if [ ! -f deploy/backup.sh ]; then
    cat > deploy/backup.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/backup/offerpilot"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="offerpilot-backend-1"

echo "💾 开始备份 OfferPilot 数据..."
echo ""

# 创建备份目录
mkdir -p $BACKUP_DIR

# 检查容器是否运行
if ! docker ps | grep -q $CONTAINER_NAME; then
    echo "❌ 容器 $CONTAINER_NAME 未运行"
    exit 1
fi

# 备份数据库
echo "[1/3] 备份数据库..."
docker exec $CONTAINER_NAME cp /app/data-v2/offerpilot.sqlite /app/data-v2/offerpilot.sqlite.backup
docker cp $CONTAINER_NAME:/app/data-v2/offerpilot.sqlite.backup $BACKUP_DIR/db_$DATE.sqlite
echo "✓ 数据库备份完成: db_$DATE.sqlite"

# 备份上传文件
echo "[2/3] 备份上传文件..."
docker cp $CONTAINER_NAME:/app/data-v2/uploads $BACKUP_DIR/uploads_$DATE
echo "✓ 上传文件备份完成: uploads_$DATE"

# 清理旧备份（保留 7 天）
echo "[3/3] 清理旧备份..."
DELETED_DB=$(find $BACKUP_DIR -name "db_*.sqlite" -mtime +7 | wc -l)
DELETED_UPLOADS=$(find $BACKUP_DIR -name "uploads_*" -mtime +7 -type d | wc -l)
find $BACKUP_DIR -name "db_*.sqlite" -mtime +7 -delete
find $BACKUP_DIR -name "uploads_*" -mtime +7 -exec rm -rf {} +
echo "✓ 已清理 $DELETED_DB 个旧数据库备份"
echo "✓ 已清理 $DELETED_UPLOADS 个旧上传文件备份"

# 显示备份信息
echo ""
echo "✅ 备份完成！"
echo "备份位置: $BACKUP_DIR"
echo "备份时间: $DATE"
echo ""
echo "备份文件:"
ls -lh $BACKUP_DIR/*_$DATE* | awk '{print "  " $9 " (" $5 ")"}'

# 计算总备份大小
TOTAL_SIZE=$(du -sh $BACKUP_DIR | awk '{print $1}')
echo ""
echo "总备份大小: $TOTAL_SIZE"
EOF
    chmod +x deploy/backup.sh
    echo -e "${GREEN}✓${NC} deploy/backup.sh 已创建"
else
    echo -e "${GREEN}✓${NC} deploy/backup.sh 已存在"
fi

# 完成总结
echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "${GREEN}✅ 自动修复完成！${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo -e "${YELLOW}已完成:${NC}"
echo "  ✓ HOST 绑定地址修复"
echo "  ✓ 数据库路径统一"
echo "  ✓ nginx-ssl.conf 创建"
echo "  ✓ 前端 .env.production 创建"
echo "  ✓ deploy.sh 部署脚本创建"
echo "  ✓ backup.sh 备份脚本创建"
echo ""
echo -e "${YELLOW}待完成:${NC}"
echo "  ⚠ 手动修复 src/server.ts 中的 CORS 配置"
echo "  ⚠ 更新 .env 文件中的 JWT_SECRET"
echo "  ⚠ 配置 BAILIAN_API_KEY"
echo ""
echo -e "${YELLOW}下一步:${NC}"
echo "  1. cd deploy"
echo "  2. cp .env.production.example .env.production"
echo "  3. vim .env.production  # 配置 API 密钥和 JWT"
echo "  4. ./deploy.sh  # 执行部署"
echo ""
