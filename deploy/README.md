# 生产部署

当前项目依赖完整 Node.js、SQLite 和本地上传目录，推荐部署到支持 Docker 的轻量云服务器；Cloudflare 只负责 DNS、代理和 HTTPS。

## 服务器上执行

```bash
git clone <你的代码仓库> pressure-interview-agent
cd pressure-interview-agent/deploy
cp .env.production.example .env.production
vim .env.production
docker compose up -d --build
curl http://127.0.0.1:4310/api/v1/health
```

不要把 `.env.production` 提交到 Git。SQLite 和上传文件保存在 Docker volume `offerpilot-data` 中。

## Cloudflare 连接

将域名 DNS 指向服务器，并开启代理；源站只监听 127.0.0.1:4310，后续可使用 Cloudflare Tunnel 或 Nginx/Caddy 接入 443。
