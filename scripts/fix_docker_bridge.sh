#!/bin/bash
# 清理 Docker 僵尸网桥，解决 subnet 冲突导致宿主机无法访问容器的问题
# 症状：docker0 state DOWN, ping 容器 IP 100% loss, curl localhost:80 超时
# 根因：旧 Docker daemon 残留网桥与新网桥使用同一 subnet (172.29.0.0/16)

set -e

SUBNET='172.29.0.0/16'

echo '[fix_docker_bridge] Checking for stale bridges on ...'

# 找到所有 linkdown 状态的网桥路由
STALE_ROUTES=$(ip route | grep "${SUBNET}.*linkdown" | awk '{print $3}')

if [ -z "$STALE_ROUTES" ]; then
    echo '[fix_docker_bridge] No stale bridges found, OK.'
    exit 0
fi

for br in $STALE_ROUTES; do
    echo "[fix_docker_bridge] Removing stale bridge: $br"
    ip link del "$br" 2>/dev/null || true
done

echo '[fix_docker_bridge] Stale bridges cleaned.'
