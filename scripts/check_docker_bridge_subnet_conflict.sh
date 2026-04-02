#!/usr/bin/env bash
# 在 Linux 宿主机上检测：是否出现「同一 IPv4 前缀被多条路由指向不同 Docker 网桥」。
# 典型成因：多个 compose 项目或 docker network create 使用了重叠的 ipam.subnet，
# 导致两条 `172.x.0.0/16 dev br-...`，`ip route get` 命中不可预测，容器互连表现为 TCP 超时/拒连。
#
# 用法：在 art_backend 目录执行 ./scripts/check_docker_bridge_subnet_conflict.sh
# 可选环境变量：STRICT=1（默认）冲突时 exit 1；STRICT=0 仅打印警告。
#
set -euo pipefail

STRICT="${STRICT:-1}"

if ! command -v ip >/dev/null 2>&1; then
  echo "[check_docker_bridge_subnet_conflict] 未找到 ip 命令（常见于 macOS），跳过（请在 Linux 部署机/ECS 上执行）。"
  exit 0
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# 只关心「经 br-* 的网段路由」；同一 CIDR 出现两次且 dev 不同即冲突
# 形如：172.29.0.0/16 dev br-xxxx proto kernel scope link src 172.29.0.1
ip -4 route show table main 2>/dev/null | grep ' dev br-' | awk '{print $1 "\t" $3}' | sort -k1,1 -k2,2 >"$tmp"

conflict=0
prev_cidr=""
prev_dev=""
while IFS=$'\t' read -r cidr dev; do
  [[ -z "$cidr" || -z "$dev" ]] && continue
  if [[ -n "$prev_cidr" && "$cidr" == "$prev_cidr" && "$dev" != "$prev_dev" ]]; then
    echo "[check_docker_bridge_subnet_conflict] 检测到重复网段路由（同一 CIDR 指向不同网桥），容器互连可能异常：" >&2
    echo "  $cidr -> $prev_dev 与 $dev" >&2
    echo "  处理：删除不用的 Docker 网络（docker network prune）、或为各项目配置不同 DOCKER_SUBNET。" >&2
    conflict=1
    break
  fi
  prev_cidr="$cidr"
  prev_dev="$dev"
done <"$tmp"

if [[ "$conflict" -eq 1 ]]; then
  if [[ "$STRICT" == "1" ]]; then
    exit 1
  fi
  echo "[check_docker_bridge_subnet_conflict] STRICT=0，仅警告不退出。" >&2
fi

exit 0
