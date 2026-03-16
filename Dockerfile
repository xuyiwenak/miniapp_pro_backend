FROM node:25.8-alpine AS builder

WORKDIR /app

# 仅拷贝 dist 目录（当前仓库已包含构建产物）
COPY dist ./dist
COPY dist/package.json ./package.json
COPY dist/package-lock.json ./package-lock.json

RUN npm ci --omit=dev

FROM node:25.8-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app /app

# 运行时需要的静态资源目录，挂载或镜像中提供皆可
VOLUME ["/app/static", "/app/logs"]

# 暴露：主 HTTP 端口 + 小程序 REST 端口（默认 httpPort+1）
EXPOSE 40001 40002

# 通过环境变量控制端口和配置路径，默认使用 dist 内置配置
ENV HTTP_PORT=40001 \
    MINIAPP_PORT=40002

# 默认入口：使用 dist/front.js 启动 TSRPC + miniapp 服务（如有 index.js，可在此调整）
CMD ["node", "dist/front.js"]

