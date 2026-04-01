#!/bin/bash
set -e
# 与 docker-compose.yml 同目录（art_backend 项目根）
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "--- 仅构建并重启 backend_app（mongo / redis / nginx 不重建、不停止）---"
# --no-deps：不启动/重建依赖服务；依赖需已在运行，否则 backend 会连库失败
# --no-cache：强制完整重建，避免 Docker 缓存导致 TS 编译产物未更新
docker compose build --no-cache backend_app
docker compose up -d --no-deps backend_app

echo "--- 清理悬空镜像 ---"
docker image prune -f

echo "--- 容器状态 ---"
docker ps

echo "--- 跟踪 backend_app 日志 (Ctrl+C 退出) ---"
docker compose logs -f backend_app
