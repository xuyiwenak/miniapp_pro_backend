#!/usr/bin/env bash
# 答题流程回归测试入口
#
# 用法：
#   ./scripts/test-assessment.sh                  # development 环境
#   ENV=production ./scripts/test-assessment.sh   # 生产环境
#   ./scripts/test-assessment.sh --keep           # 保留测试 session
#   ./scripts/test-assessment.sh --port 41002     # 指定端口
#   ./scripts/test-assessment.sh --no-preflight   # 跳过前置检查
#
# 退出码：
#   0  全部通过
#   1  有测试失败
#   2  环境检查失败（服务未启动 / 依赖缺失）

set -euo pipefail

# ── 颜色 ───────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗ $*${NC}" >&2; }
warn() { echo -e "  ${YELLOW}! $*${NC}"; }
info() { echo -e "  ${GRAY}→ $*${NC}"; }
head() { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

# ── 参数解析 ──────────────────────────────────────────────────────────────────
ENV="${ENV:-development}"
MINIAPP_PORT=41002
KEEP_FLAG=""
NO_PREFLIGHT=false
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)         MINIAPP_PORT="$2"; shift 2 ;;
    --keep)         KEEP_FLAG="--keep"; shift ;;
    --no-preflight) NO_PREFLIGHT=true; shift ;;
    *)              EXTRA_ARGS+=("$1"); shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# ── 前置检查 ──────────────────────────────────────────────────────────────────
preflight() {
  head "前置检查"
  local failed=0

  # ts-node
  if command -v ts-node &>/dev/null || "$BACKEND_DIR/node_modules/.bin/ts-node" --version &>/dev/null 2>&1; then
    ok "ts-node 可用"
  else
    fail "ts-node 未找到（npm i -g ts-node 或使用项目本地版本）"
    failed=1
  fi

  # MongoDB
  if mongosh --quiet --eval "db.runCommand({ping:1})" begreat_db &>/dev/null 2>&1 \
     || mongo   --quiet --eval "db.runCommand({ping:1})" begreat_db &>/dev/null 2>&1; then
    ok "MongoDB 在线"
  else
    fail "MongoDB 无法连接（请确认 mongod 正在运行）"
    failed=1
  fi

  # Redis
  if redis-cli -n 1 ping 2>/dev/null | grep -q "PONG"; then
    ok "Redis 在线"
  else
    fail "Redis 无法连接（请确认 redis-server 正在运行）"
    failed=1
  fi

  # begreat 服务端口
  if lsof -i :"$MINIAPP_PORT" -sTCP:LISTEN -t &>/dev/null 2>&1; then
    ok "begreat 服务在线（port ${MINIAPP_PORT}）"
  else
    fail "begreat 服务未监听 port $MINIAPP_PORT"
    echo -e "    ${GRAY}启动命令：ENV=${ENV} npx ts-node src/apps/begreat/front.ts${NC}"
    failed=1
  fi

  # 题库非空
  local q_count
  q_count=$(mongosh --quiet --eval \
    "db.getSiblingDB('begreat_db').questions.countDocuments({isActive:true})" 2>/dev/null \
    | tr -d '[:space:]' || echo "0")
  if [[ "$q_count" =~ ^[0-9]+$ ]] && [[ "$q_count" -ge 60 ]]; then
    ok "题库已就绪（${q_count} 题激活）"
  else
    fail "题库不足 60 题（当前 ${q_count:-0} 题）"
    echo -e "    ${GRAY}导入：ENV=${ENV} npx ts-node scripts/import_questions.ts scripts/questions_test.xlsx${NC}"
    failed=1
  fi

  # 常模已激活
  local norm_count
  norm_count=$(mongosh --quiet --eval \
    "db.getSiblingDB('begreat_db').norms.countDocuments({isActive:true,modelType:'BIG5'})" 2>/dev/null \
    | tr -d '[:space:]' || echo "0")
  if [[ "$norm_count" =~ ^[0-9]+$ ]] && [[ "$norm_count" -gt 0 ]]; then
    ok "常模已激活（${norm_count} 条 BIG5）"
  else
    fail "无激活常模 — assessment/start 将返回 500，测试无法进行"
    echo -e "    ${GRAY}导入：ENV=${ENV} npx ts-node scripts/import_norms.ts --activate${NC}"
    failed=1
  fi

  if [[ $failed -ne 0 ]]; then
    echo ""
    echo -e "${RED}前置检查未通过，终止测试。${NC}" >&2
    exit 2
  fi
}

# ── 运行测试 ──────────────────────────────────────────────────────────────────
run_tests() {
  head "运行回归测试"
  info "环境：${ENV}  端口：${MINIAPP_PORT}"

  local ts_node
  if command -v ts-node &>/dev/null; then
    ts_node="ts-node"
  else
    ts_node="$BACKEND_DIR/node_modules/.bin/ts-node"
  fi

  local start_time
  start_time=$(date +%s)

  set +e
  ENV="$ENV" "$ts_node" \
    "$SCRIPT_DIR/regression_assessment.ts" \
    --port "$MINIAPP_PORT" \
    $KEEP_FLAG \
    "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
  local exit_code=$?
  set -e

  local end_time
  end_time=$(date +%s)
  local elapsed=$(( end_time - start_time ))

  echo ""
  if [[ $exit_code -eq 0 ]]; then
    echo -e "${BOLD}${GREEN}全部测试通过 ✓  (${elapsed}s)${NC}"
  else
    echo -e "${BOLD}${RED}测试未全部通过 ✗  (${elapsed}s)${NC}" >&2
  fi

  return $exit_code
}

# ── 主入口 ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}════ BeGREAT 回归测试 ════${NC}"
echo -e "${GRAY}时间：$(date '+%Y-%m-%d %H:%M:%S')  环境：${ENV}${NC}"

if [[ "$NO_PREFLIGHT" == false ]]; then
  preflight
fi

run_tests
