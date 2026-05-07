# --- 第一阶段：构建阶段 ---
# 使用带前缀的本地镜像，防止 Docker 联网校验 Manifest
FROM m.daocloud.io/docker.io/library/node:25.8-alpine AS builder

WORKDIR /app

# 设置 npm 国内镜像源（阿里云），大幅提升安装速度
RUN npm config set registry https://registry.npmmirror.com

# 拷贝依赖定义（只拷贝 package 文件，最大化缓存利用）
COPY package*.json ./

# 使用 BuildKit 缓存挂载加速依赖安装
# --mount=type=cache 会在多次构建间复用 npm 缓存，避免重复下载
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 拷贝源码并构建
COPY src ./src
COPY tpl ./tpl
COPY tsconfig.json ./
COPY tsrpc.config.ts ./
COPY json_to_schema.mjs ./

RUN npm run build \
  && test -f dist/apps/begreat/sysconfig/production/log_config.json \
  && test -f dist/apps/mandis/sysconfig/production/log_config.json \
  && test -f dist/apps/begreat/front.js \
  && test -f dist/apps/mandis/front.js

# 移除开发依赖，仅保留生产环境需要的包
# HUSKY=0 跳过 prepare 脚本（husky 是 devDep，--omit=dev 后不存在）
RUN HUSKY=0 npm ci --omit=dev 2>/dev/null || npm prune --production


# --- 第二阶段：运行阶段 ---
# 注意：这里也必须改用带前缀的本地镜像，否则 build 依然会超时报错
FROM m.daocloud.io/docker.io/library/node:25.8-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# 设置 Alpine 国内镜像源（阿里云），大幅提升 apk 安装速度
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装 docker CLI，用于系统监控 API 和容器管理
# 使用 BuildKit 缓存挂载加速包下载
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache docker-cli

# 从 builder 阶段拷贝构建产物（含 dist/ 和 node_modules/）
COPY --from=builder /app /app

# 挂载卷
VOLUME ["/app/static", "/app/logs"]

# 暴露所有 app 的端口（compose 按需映射即可）
EXPOSE 41001 41002 42000 42001 42002

# 默认启动 begreat；mandis 容器在 compose 里用 command 覆盖
ENV SYSCONFIG_ROOT=/app/config
CMD ["node", "dist/apps/begreat/front.js"]
