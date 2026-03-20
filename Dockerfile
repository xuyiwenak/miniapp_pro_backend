FROM node:25.8-alpine AS builder

WORKDIR /app

# 拷贝源码与依赖声明，在镜像内构建（不依赖本地 dist）
# 使用 package*.json 以兼容无 package-lock.json 的情况（项目 .gitignore 排除了 lock 文件）
COPY package*.json ./
COPY src ./src
COPY tsconfig.json ./
COPY tsrpc.config.ts ./
COPY json_to_schema.mjs ./

# 有 lock 文件用 npm ci，否则用 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi && npm run build

# 生产依赖（移除 devDependencies）
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm prune --production; fi

FROM node:25.8-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app /app

# 运行时需要的静态资源目录，挂载或镜像中提供皆可
VOLUME ["/app/static", "/app/logs"]

# 暴露：WebSocket + 主 HTTP + 小程序 REST（默认 miniapp = httpPort+1）
EXPOSE 40000 40001 40002

# 通过环境变量控制端口和配置路径，默认使用 dist 内置配置
ENV HTTP_PORT=40001 \
    MINIAPP_PORT=40002

# 默认入口：使用 dist/front.js 启动 TSRPC + miniapp 服务（如有 index.js，可在此调整）
CMD ["node", "dist/front.js"]

