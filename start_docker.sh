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

# ── 服务名 → 容器名映射（与 docker-compose.yml 保持一致）────────────────────
declare -A CONTAINER_NAMES=(
  [drawing_app]="miniapp-drawing"
  [begreat_app]="miniapp-begreat"
  [mandis_app]="miniapp-mandis"
)

# ── 解析参数 ──────────────────────────────────────────────────────────────────
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
    *)
      if [[ -z "${CONTAINER_NAMES[$arg]+_}" ]]; then
        echo "错误：未知服务 '$arg'，可选：${!CONTAINER_NAMES[*]}"
        exit 1
      fi
      SERVICES+=("$arg") ;;
  esac
done

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=(drawing_app begreat_app mandis_app)
fi

echo "--- 目标服务: ${SERVICES[*]} ---"

# ── 强制停止旧容器（Docker 层面保证同名容器唯一）────────────────────────────
# 直接按容器名 kill，不依赖 docker-compose 状态，确保旧实例必须退出
echo "--- 强制清理旧容器 ---"
for svc in "${SERVICES[@]}"; do
  cname="${CONTAINER_NAMES[$svc]}"
  if docker ps -q --filter "name=^${cname}$" | grep -q .; then
    echo "  kill: $cname (运行中)"
    docker kill "$cname"
  fi
  if docker ps -aq --filter "name=^${cname}$" | grep -q .; then
    echo "  rm:   $cname (已停止但未删除)"
    docker rm -f "$cname"
  fi
done

# ── 构建镜像 ──────────────────────────────────────────────────────────────────
echo "--- 构建新镜像 ${NO_CACHE:+(--no-cache)} ---"
# 三个 app 共用同一镜像，build drawing_app 即可刷新所有
docker compose build $NO_CACHE drawing_app

# ── 启动容器（--force-recreate 确保旧容器一定被替换）────────────────────────
echo "--- 启动容器 ---"
docker compose up -d --force-recreate --no-deps "${SERVICES[@]}"

# ── 收尾 ──────────────────────────────────────────────────────────────────────
echo "--- 重载 nginx ---"
docker compose exec -T nginx nginx -s reload || true

echo "--- 清理悬空镜像 ---"
docker image prune -f

echo "--- 容器状态 ---"
docker compose ps "${SERVICES[@]}"

echo ""
echo "--- 最近 50 行日志（跟踪请手动执行：docker compose logs -f ${SERVICES[*]}）---"
docker compose logs --tail=50 "${SERVICES[@]}"
