#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Usage:
#   ./start_docker.sh                          # 重启全部三个 app
#   ./start_docker.sh begreat_app              # 只重启 begreat_app（快）
#   ./start_docker.sh drawing_app mandis_app   # 重启指定多个
#   ./start_docker.sh --no-cache begreat_app   # 强制重新编译 + 重启
#
# 常用命令速查：
#   ./start_docker.sh begreat_app              # 只重启 begreat_app（快）
#   ./start_docker.sh --no-cache begreat_app   # 强制重新编译 + 重启
#   ./start_docker.sh                          # 重启全部三个

NO_CACHE=""
SERVICES=()

for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    -h|--help)
      echo "用法："
      echo "  ./start_docker.sh                          # 重启全部三个"
      echo "  ./start_docker.sh begreat_app              # 只重启 begreat_app（快）"
      echo "  ./start_docker.sh --no-cache begreat_app   # 强制重新编译 + 重启"
      echo "  ./start_docker.sh drawing_app mandis_app   # 重启指定多个"
      exit 0 ;;
    *) SERVICES+=("$arg") ;;
  esac
done

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=(drawing_app begreat_app mandis_app)
fi

echo "--- 目标服务: ${SERVICES[*]} ---"

echo "--- 停止并移除旧容器（5s 超时）---"
docker compose stop --timeout 5 "${SERVICES[@]}" 2>&1 || true
docker compose rm -f "${SERVICES[@]}" 2>&1 || true

echo "--- 构建新镜像 ${NO_CACHE:+(--no-cache)} ---"
# drawing_app / begreat_app / mandis_app 共用同一镜像，build 第一个即可
docker compose build $NO_CACHE drawing_app

echo "--- 启动容器 ---"
docker compose up -d --no-deps "${SERVICES[@]}"

echo "--- 重载 nginx ---"
docker compose exec -T nginx nginx -s reload || true

echo "--- 清理悬空镜像 ---"
docker image prune -f

echo "--- 容器状态 ---"
docker compose ps "${SERVICES[@]}"

echo ""
echo "--- 最近 50 行日志（跟踪请手动执行：docker compose logs -f ${SERVICES[*]}）---"
docker compose logs --tail=50 "${SERVICES[@]}"
