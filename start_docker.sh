#!/bin/bash
set -e
# 与 docker-compose.yml 同目录（art_backend 项目根）
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "--- 停止并移除旧 app 容器（避免残留）---"
docker compose stop drawing_app begreat_app 2>/dev/null || true
docker compose rm -f drawing_app begreat_app 2>/dev/null || true

echo "--- 构建新镜像（--no-cache 确保 TS 完整重新编译）---"
# 只需 build drawing_app，begreat_app 复用同一镜像
docker compose build --no-cache drawing_app

echo "--- 启动两个 app 容器 ---"
# --no-deps：不启动/重建依赖服务；mongo/redis 需已在运行
docker compose up -d --no-deps drawing_app begreat_app

echo "--- 重载 nginx（刷新 DNS 缓存，避免 502）---"
docker compose exec -T nginx nginx -s reload || true

echo "--- 清理悬空镜像 ---"
docker image prune -f

echo "--- 容器状态 ---"
docker ps

echo "--- 跟踪两个 app 日志 (Ctrl+C 退出) ---"
docker compose logs -f drawing_app begreat_app
