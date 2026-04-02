#!/bin/bash
set -e
# 与 docker-compose.yml 同目录（art_backend 项目根）
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "--- 停止并移除旧 backend_app 容器（避免残留）---"
docker compose stop backend_app 2>/dev/null || true
docker compose rm -f backend_app 2>/dev/null || true

echo "--- 构建新镜像（--no-cache 确保 TS 完整重新编译）---"
# --no-cache：强制完整重建，避免 Docker 缓存导致 TS 编译产物未更新
docker compose build --no-cache backend_app

echo "--- 启动新容器 ---"
# --no-deps：不启动/重建依赖服务；依赖需已在运行，否则 backend 会连库失败
docker compose up -d --no-deps backend_app

echo "--- 重载 nginx（刷新 DNS 缓存，避免 502）---"
docker compose exec -T nginx nginx -s reload || true

echo "--- 清理悬空镜像 ---"
docker image prune -f

echo "--- 容器状态 ---"
docker ps

echo "--- 跟踪 backend_app 日志 (Ctrl+C 退出) ---"
docker compose logs -f backend_app
