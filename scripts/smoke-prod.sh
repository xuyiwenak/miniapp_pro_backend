#!/usr/bin/env bash
# 线上环境冒烟：验证 HTTPS、Nginx 静态、小程序 REST 关键路径。
# 用法:
#   ./scripts/smoke-prod.sh
#   SMOKE_BASE_URL=https://autorecordarchery.xyz ./scripts/smoke-prod.sh
# CI: 在发布或定时任务中执行，失败则非零退出。

set -euo pipefail

BASE="${SMOKE_BASE_URL:-https://autorecordarchery.xyz}"
BASE="${BASE%/}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() {
  echo -e "${RED}[FAIL]${NC} $*" >&2
  exit 1
}

ok() {
  echo -e "${GREEN}[OK]${NC} $*"
}

curl_json() {
  local url=$1
  local label=$2
  local body
  if ! body=$(curl -sfS --connect-timeout 10 --max-time 30 \
    -H 'Accept: application/json' \
    -H 'User-Agent: art-backend-smoke/1.0' \
    "$url"); then
    fail "$label: HTTP 请求失败 ($url)"
  fi
  if ! echo "$body" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
    fail "$label: 响应未包含 success:true ($url)"
  fi
  if ! echo "$body" | grep -q '"code"[[:space:]]*:[[:space:]]*200'; then
    fail "$label: 响应未包含 code:200 ($url)"
  fi
  ok "$label"
}

echo "=== Smoke: $BASE ==="

# 1) TLS + 任意路径可达（未匹配路由时仍为 HTTP 200 + JSON body）
root_code="000"
root_code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 20 "$BASE/" 2>/dev/null) || root_code="000"
if [[ "$root_code" != "200" ]]; then
  fail "根路径 HTTP ${root_code:-000}（预期 200，与 miniapp 未匹配路由行为一致）"
fi
ok "GET / HTTP $root_code"

# 2) 首页公开接口（依赖 DB 时 /cards 仍会回退静态数据）
curl_json "$BASE/home/cards" "GET /home/cards"
curl_json "$BASE/home/swipers" "GET /home/swipers"

# 3) 静态资源（Nginx alias /static 或后端 express.static）
static_code="000"
static_code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 20 \
  "$BASE/static/home/swiper0.png" 2>/dev/null) || static_code="000"
if [[ "$static_code" != "200" ]]; then
  fail "静态资源 GET /static/home/swiper0.png HTTP ${static_code:-000}"
fi
ok "GET /static/home/swiper0.png HTTP $static_code"

echo ""
echo -e "${GREEN}All smoke checks passed.${NC}"
