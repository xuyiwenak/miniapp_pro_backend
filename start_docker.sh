#!/bin/bash
set -e
# 与 docker-compose.yml 同目录（art_backend 项目根）
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Linux 宿主机：检测是否已有「同 CIDR、多 br-*」路由冲突（多 compose 共用 subnet 时易发）
if [[ -x ./scripts/check_docker_bridge_subnet_conflict.sh ]]; then
  ./scripts/check_docker_bridge_subnet_conflict.sh || exit 1
fi

echo "--- 仅构建并重启 backend_app（mongo / redis / nginx 不重建、不停止）---"
# --no-deps：不启动/重建依赖服务；依赖需已在运行，否则 backend 会连库失败
docker compose build backend_app
docker compose up -d --no-deps backend_app

echo "--- 清理悬空镜像 ---"
docker image prune -f

echo "--- 容器状态 ---"
docker ps

echo "--- 跟踪 backend_app 日志 (Ctrl+C 退出) ---"
docker compose logs -f backend_app
