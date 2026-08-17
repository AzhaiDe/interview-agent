# 构建阶段
FROM node:22-alpine AS builder

WORKDIR /app

# 安装构建依赖（用于编译 better-sqlite3 等原生模块）
RUN apk add --no-cache python3 make g++

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 生产阶段
FROM node:22-alpine AS production

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=4310

# 复制构建产物和必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# 创建数据目录
RUN mkdir -p /app/data-v2/uploads

# 暴露端口
EXPOSE 4310

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4310/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "dist/server.js"]
