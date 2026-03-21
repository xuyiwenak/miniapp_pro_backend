# --- 第一阶段：构建阶段 ---
# 使用带前缀的本地镜像，防止 Docker 联网校验 Manifest
FROM m.daocloud.io/docker.io/library/node:25.8-alpine AS builder

WORKDIR /app

# 设置 npm 国内镜像源（阿里云），大幅提升安装速度
RUN npm config set registry https://registry.npmmirror.com

# 拷贝依赖定义
COPY package*.json ./

# 有 lock 文件用 npm ci，否则用 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 拷贝源码并构建
COPY src ./src
COPY tsconfig.json ./
COPY tsrpc.config.ts ./
COPY json_to_schema.mjs ./

RUN npm run build \
  && test -f dist/sysconfig/production/log_config.json \
  && test -f dist/sysconfig/development/log_config.json

# 移除开发依赖，仅保留生产环境需要的包
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm prune --production; fi


# --- 第二阶段：运行阶段 ---
# 注意：这里也必须改用带前缀的本地镜像，否则 build 依然会超时报错
FROM m.daocloud.io/docker.io/library/node:25.8-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# 从 builder 阶段拷贝构建产物
COPY --from=builder /app /app

# 再次从源码拷入 JSON，确保配置完整
COPY --from=builder /app/src/sysconfig/production/*.json /app/dist/sysconfig/production/
COPY --from=builder /app/src/sysconfig/development/*.json /app/dist/sysconfig/development/

# 挂载卷
VOLUME ["/app/static", "/app/logs"]

# 暴露端口
EXPOSE 40000 40001 40002

# 环境变量
ENV SYSCONFIG_ROOT=/app/config \
    HTTP_PORT=40001 \
    MINIAPP_PORT=40002

# 启动命令
CMD ["node", "dist/front.js"]