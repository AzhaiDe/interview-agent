FROM mirror.ccs.tencentyun.com/library/node:22-bookworm-slim AS build

WORKDIR /app

RUN sed -i \
    -e 's|deb.debian.org/debian-security|mirrors.cloud.tencent.com/debian-security|g' \
    -e 's|deb.debian.org/debian|mirrors.cloud.tencent.com/debian|g' \
    /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY prompts ./prompts
COPY knowledge-base ./knowledge-base
COPY public ./public
RUN npm run build && npm prune --omit=dev

FROM mirror.ccs.tencentyun.com/library/node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4310 \
    DATA_DIR=/app/data-v2 \
    DATABASE_PATH=/app/data-v2/offerpilot.sqlite \
    UPLOAD_DIR=/app/data-v2/uploads

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/knowledge-base ./knowledge-base
RUN mkdir -p /app/data-v2/uploads && chown -R node:node /app
USER node
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4310/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
