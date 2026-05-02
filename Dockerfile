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
COPY tpl ./tpl
COPY tsconfig.json ./
COPY tsrpc.config.ts ./
COPY json_to_schema.mjs ./
# 管理后台静态页面（运行时由 Express 直接服务）
COPY admin-panel ./admin-panel

RUN npm run build \
  && test -f dist/apps/drawing/sysconfig/production/log_config.json \
  && test -f dist/apps/begreat/sysconfig/production/log_config.json \
  && test -f dist/apps/mandis/sysconfig/production/log_config.json \
  && test -f dist/apps/mandis/front.js

# 移除开发依赖，仅保留生产环境需要的包
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm prune --production; fi


# --- 第二阶段：运行阶段 ---
# 注意：这里也必须改用带前缀的本地镜像，否则 build 依然会超时报错
FROM m.daocloud.io/docker.io/library/node:25.8-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# 安装 docker CLI，用于系统监控 API 和容器管理
RUN apk add --no-cache docker-cli

# 从 builder 阶段拷贝构建产物（含 dist/ 和 node_modules/）
COPY --from=builder /app /app

# 挂载卷
VOLUME ["/app/static", "/app/logs"]

# 暴露两个 app 的所有端口（compose 按需映射即可）
EXPOSE 40000 40001 40002 41001 41002

# 默认启动 drawing；begreat 容器在 compose 里用 command 覆盖
ENV SYSCONFIG_ROOT=/app/config
CMD ["node", "dist/apps/drawing/front.js"]