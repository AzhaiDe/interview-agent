#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_PORT="${PUBLIC_PORT:-4311}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-$PROJECT_DIR/tools/cloudflared}"

if [[ ! -x "$CLOUDFLARED_BIN" ]]; then
  CLOUDFLARED_BIN="$(command -v cloudflared || true)"
fi

if [[ -z "$CLOUDFLARED_BIN" || ! -x "$CLOUDFLARED_BIN" ]]; then
  echo "未找到 cloudflared。请先执行 README 中的安装步骤。"
  exit 1
fi

cleanup() {
  if [[ "${APP_STARTED:-false}" == "true" ]] && [[ -n "${APP_PID:-}" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"
APP_STARTED=false
if curl -fsS "http://127.0.0.1:${PUBLIC_PORT}/" >/dev/null; then
  echo "检测到公网演示服务已在运行：http://127.0.0.1:${PUBLIC_PORT}（将直接复用）"
else
  echo "启动公网演示服务：http://127.0.0.1:${PUBLIC_PORT}"
  PUBLIC_DEMO=true PORT="${PUBLIC_PORT}" npm run dev &
  APP_PID=$!
  APP_STARTED=true
  for attempt in {1..30}; do
    if curl -fsS "http://127.0.0.1:${PUBLIC_PORT}/" >/dev/null; then
      break
    fi
    sleep 1
  done
fi

if ! curl -fsS "http://127.0.0.1:${PUBLIC_PORT}/" >/dev/null; then
  echo "本地服务启动失败。"
  exit 1
fi

echo "正在创建 Cloudflare 临时公网链接；按 Ctrl+C 可同时关闭服务和隧道。"
echo "注意：链接是临时的，Mac 休眠、关机或脚本退出后会失效。"
"$CLOUDFLARED_BIN" tunnel --url "http://127.0.0.1:${PUBLIC_PORT}"
