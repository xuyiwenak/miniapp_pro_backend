#!/bin/bash
set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 所有 app 容器（共用同一镜像，build 任意一个即可刷新）
ALL_APPS=(drawing_app begreat_app mandis_app)

# 解析参数：./start_docker.sh [容器名]
TARGET="${1:-}"

if [[ -n "$TARGET" ]]; then
  # ── 单容器模式 ──────────────────────────────────────────────
  VALID=false
  for svc in "${ALL_APPS[@]}"; do
    [[ "$svc" == "$TARGET" ]] && VALID=true && break
  done
  if [[ "$VALID" == false ]]; then
    echo "错误：未知容器 '$TARGET'，可选：${ALL_APPS[*]}"
    exit 1
  fi

  echo "--- 更新单个容器：$TARGET ---"
  docker compose stop "$TARGET"
  docker compose rm -f "$TARGET"
  docker compose build --no-cache "$TARGET"
  docker compose up -d --no-deps "$TARGET"

  echo "--- 重载 nginx ---"
  docker compose exec -T nginx nginx -s reload || true

  echo "--- 清理悬空镜像 ---"
  docker image prune -f

  echo "--- 容器状态 ---"
  docker ps

  echo "--- 跟踪 $TARGET 日志 (Ctrl+C 退出) ---"
  docker compose logs -f "$TARGET"

else
  # ── 全量模式（默认）────────────────────────────────────────
  echo "--- 停止并移除旧 app 容器 ---"
  docker compose stop "${ALL_APPS[@]}" 2>/dev/null || true
  docker compose rm -f "${ALL_APPS[@]}" 2>/dev/null || true

  echo "--- 构建新镜像（--no-cache 确保 TS 完整重新编译）---"
  docker compose build --no-cache drawing_app

  echo "--- 启动所有 app 容器 ---"
  docker compose up -d --no-deps "${ALL_APPS[@]}"

  echo "--- 重载 nginx ---"
  docker compose exec -T nginx nginx -s reload || true

  echo "--- 清理悬空镜像 ---"
  docker image prune -f

  echo "--- 容器状态 ---"
  docker ps

  echo "--- 跟踪所有 app 日志 (Ctrl+C 退出) ---"
  docker compose logs -f "${ALL_APPS[@]}"
fi
