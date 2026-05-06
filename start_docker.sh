#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Usage:
#   ./start_docker.sh                          # 重启全部 app
#   ./start_docker.sh begreat_app              # 只重启 begreat_app（快）
#   ./start_docker.sh begreat_app mandis_app   # 重启指定多个
#   ./start_docker.sh --no-cache begreat_app   # 强制重新编译 + 重启
#
# 常用命令速查：
#   ./start_docker.sh begreat_app              # 只重启 begreat_app（快）
#   ./start_docker.sh --no-cache begreat_app   # 强制重新编译 + 重启
#   ./start_docker.sh                          # 重启全部 app

# ── 服务名 → 容器名映射（与 docker-compose.yml 保持一致）────────────────────
declare -A CONTAINER_NAMES=(
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
      echo "  ./start_docker.sh                          # 重启全部 app"
      echo "  ./start_docker.sh begreat_app              # 只重启 begreat_app（快）"
      echo "  ./start_docker.sh --no-cache begreat_app   # 强制重新编译 + 重启"
      echo "  ./start_docker.sh begreat_app mandis_app   # 重启指定多个"
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
  SERVICES=(begreat_app mandis_app)
fi

echo "--- 目标服务: ${SERVICES[*]} ---"

# ── 强制停止旧容器（Docker 层面保证同名容器唯一）────────────────────────────
# Ubuntu 24.04 + Docker 29.x + AppArmor 场景下 docker kill/stop/rm -f 均会 permission denied。
# 绕过方式：直接用宿主机 kill -9 发送信号，再等容器变为 exited，最后 docker rm 清理。
echo "--- 强制清理旧容器 ---"
for svc in "${SERVICES[@]}"; do
  cname="${CONTAINER_NAMES[$svc]}"
  if ! docker ps -aq --filter "name=^${cname}$" | grep -q .; then
    echo "  skip:  $cname (不存在)"
    continue
  fi
  # 获取容器主进程 PID（仅运行中才有非 0 PID）
  pid=$(docker inspect --format '{{.State.Pid}}' "$cname" 2>/dev/null || echo 0)
  if [[ "$pid" -gt 0 ]]; then
    echo "  kill -9 pid=$pid ($cname)"
    kill -9 "$pid" 2>/dev/null || true
    # 等待容器状态变为 exited（最多 5s）
    for i in {1..10}; do
      state=$(docker inspect --format '{{.State.Status}}' "$cname" 2>/dev/null || echo "gone")
      [[ "$state" != "running" ]] && break
      sleep 0.5
    done
  fi
  echo "  rm:    $cname"
  docker rm "$cname" 2>/dev/null || true
done

# ── 构建镜像 ──────────────────────────────────────────────────────────────────
echo "--- 构建新镜像 ${NO_CACHE:+(--no-cache)} ---"
# 两个 app 共用同一镜像，build begreat_app 即可刷新所有
docker compose build $NO_CACHE begreat_app

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
