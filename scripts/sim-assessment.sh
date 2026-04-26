#!/usr/bin/env bash
# 开发测试号模拟答题脚本
#
# 用固定 openId 走完完整评测流程，结果留库，在小程序直接看报告，无需手动点题。
#
# 用法：
#   ./scripts/sim-assessment.sh --openid <your_test_openid>
#   ./scripts/sim-assessment.sh --openid <id> --strategy all_max
#   ./scripts/sim-assessment.sh --openid <id> --gender female --age 28
#   ./scripts/sim-assessment.sh --openid <id> --type BFI2_FREE
#   ./scripts/sim-assessment.sh --openid <id> --port 41002 --env production
#
# 退出码：
#   0  执行成功
#   1  参数错误 / 脚本执行失败
#   2  前置检查失败（服务未启动 / 依赖缺失）

set -euo pipefail

# ── 颜色 ────────────────────────────────────────────────────────────────────────

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

# ── 帮助文档 ─────────────────────────────────────────────────────────────────────

usage() {
  echo -e "
${BOLD}${CYAN}sim-assessment.sh${NC} — 开发测试号模拟答题脚本

${BOLD}用法：${NC}
  ./scripts/sim-assessment.sh ${CYAN}--openid${NC} <openId> [选项...]

${BOLD}必填参数：${NC}
  ${CYAN}--openid${NC}  <id>        微信测试号 openId
                          （在开发者工具 AppData 或 /login/wx 日志中获取）

${BOLD}可选参数：${NC}
  ${CYAN}--strategy${NC} <策略>      答题策略，影响最终性格标签（默认：random）

                          ${BOLD}random${NC}   随机 1-5 分，每次结果不同
                          ${BOLD}all_max${NC}  全部 5 分 → 高开放性人格
                          ${BOLD}all_min${NC}  全部 1 分 → 低分人格
                          ${BOLD}all_mid${NC}  全部 3 分 → 中庸人格
                          ${BOLD}high_o${NC}   开放性题目给 5 分，其余随机

  ${CYAN}--gender${NC}   <male|female>  性别，影响常模计算（默认：male）
  ${CYAN}--age${NC}      <n>            年龄 18-75（默认：25）
  ${CYAN}--type${NC}     <类型>         测评类型（默认：BFI2）

                          ${BOLD}BFI2${NC}       完整版 60 题，结果落库，小程序可见
                          ${BOLD}BFI2_FREE${NC}  免费体验版 20 题，结果不落库

  ${CYAN}--port${NC}     <n>            miniapp 服务端口（默认：41002）
  ${CYAN}--env${NC}      <env>          运行环境，对应 sysconfig 目录（默认：development）
  ${CYAN}--token${NC}    <token>        复用已有 token，跳过 Redis 写入
  ${CYAN}--no-preflight${NC}            跳过前置环境检查（服务 / Redis 可达性）
  ${CYAN}-h, --help${NC}               显示此帮助信息

${BOLD}示例：${NC}
  # 最常用：随机答题，看小程序结果
  ./scripts/sim-assessment.sh --openid oABC123xyz

  # 指定策略，快速生成高开放性报告
  ./scripts/sim-assessment.sh --openid oABC123xyz --strategy all_max

  # 模拟 28 岁女性，BFI2 完整版
  ./scripts/sim-assessment.sh --openid oABC123xyz --gender female --age 28

  # 免费体验版（20 题，结果不落库）
  ./scripts/sim-assessment.sh --openid oABC123xyz --type BFI2_FREE

  # 跳过前置检查直接跑（服务已知在线时更快）
  ./scripts/sim-assessment.sh --openid oABC123xyz --no-preflight

${BOLD}获取测试号 openId：${NC}
  方式一：微信开发者工具 → 模拟器 → AppData → 找 openid 字段
  方式二：查看后端日志，搜 POST /login/wx 的返回值
  方式三：${GRAY}mongosh begreat_db --eval 'db.assessmentsessions.findOne({},{openId:1})'${NC}
"
}

# ── 参数解析 ─────────────────────────────────────────────────────────────────────

OPEN_ID=""
STRATEGY="random"
GENDER="male"
AGE=25
TYPE="BFI2"
PORT=41002
ENV="${ENV:-development}"
TOKEN_ARG=""
NO_PREFLIGHT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --openid|-openid)       OPEN_ID="$2";   shift 2 ;;
    --strategy|-strategy)   STRATEGY="$2";  shift 2 ;;
    --gender|-gender)       GENDER="$2";    shift 2 ;;
    --age|-age)             AGE="$2";       shift 2 ;;
    --type|-type)           TYPE="$2";      shift 2 ;;
    --port|-port)           PORT="$2";      shift 2 ;;
    --env|-env)             ENV="$2";       shift 2 ;;
    --token|-token)         TOKEN_ARG="$2"; shift 2 ;;
    --no-preflight)         NO_PREFLIGHT=true; shift ;;
    -h|--help)              usage; exit 0 ;;
    *)
      fail "未知参数：$1"
      echo -e "  运行 ${CYAN}./scripts/sim-assessment.sh --help${NC} 查看用法"
      exit 1
      ;;
  esac
done

# ── 参数校验 ─────────────────────────────────────────────────────────────────────

VALIDATE_FAILED=false

if [[ -z "$OPEN_ID" ]]; then
  fail "--openid 为必填参数"
  VALIDATE_FAILED=true
fi

case "$STRATEGY" in
  random|all_max|all_min|all_mid|high_o) ;;
  *)
    fail "--strategy 无效：'${STRATEGY}'，合法值：random | all_max | all_min | all_mid | high_o"
    VALIDATE_FAILED=true
    ;;
esac

case "$GENDER" in
  male|female) ;;
  m) GENDER="male" ;;
  f) GENDER="female" ;;
  *)
    fail "--gender 无效：'${GENDER}'，合法值：male | female"
    VALIDATE_FAILED=true
    ;;
esac

if ! [[ "$AGE" =~ ^[0-9]+$ ]] || [[ "$AGE" -lt 18 ]] || [[ "$AGE" -gt 75 ]]; then
  fail "--age 无效：'${AGE}'，需为 18-75 之间的整数"
  VALIDATE_FAILED=true
fi

case "$TYPE" in
  BFI2|BFI2_FREE) ;;
  *)
    fail "--type 无效：'${TYPE}'，合法值：BFI2 | BFI2_FREE"
    VALIDATE_FAILED=true
    ;;
esac

if [[ "$VALIDATE_FAILED" == true ]]; then
  echo -e "\n  运行 ${CYAN}./scripts/sim-assessment.sh --help${NC} 查看完整用法"
  exit 1
fi

# ── 前置检查 ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

preflight() {
  head "前置检查"
  local failed=0

  # ts-node
  if command -v ts-node &>/dev/null || "$BACKEND_DIR/node_modules/.bin/ts-node" --version &>/dev/null 2>&1; then
    ok "ts-node 可用"
  else
    fail "ts-node 未找到"
    echo -e "    ${GRAY}修复：cd art_backend && npm install${NC}"
    failed=1
  fi

  # Redis
  local redis_db
  redis_db=$(node -e "const c=require('${BACKEND_DIR}/src/apps/begreat/sysconfig/${ENV}/db_config.json');console.log(c.redis_global.db??0)" 2>/dev/null || echo "1")
  if redis-cli -n "$redis_db" ping 2>/dev/null | grep -q "PONG"; then
    ok "Redis 在线（db ${redis_db}）"
  else
    fail "Redis 无法连接"
    echo -e "    ${GRAY}修复：redis-server --daemonize yes${NC}"
    failed=1
  fi

  # begreat miniapp 服务
  if lsof -i :"$PORT" -sTCP:LISTEN -t &>/dev/null 2>&1; then
    ok "begreat miniapp 服务在线（port ${PORT}）"
  else
    fail "begreat 服务未监听 port ${PORT}"
    echo -e "    ${GRAY}启动：ENV=${ENV} npx ts-node src/apps/begreat/front.ts${NC}"
    failed=1
  fi

  # 题库
  local q_count
  q_count=$(mongosh --quiet --eval \
    "db.getSiblingDB('begreat_db').questions.countDocuments({isActive:true})" 2>/dev/null \
    | tr -d '[:space:]' || echo "0")
  local min_q=60
  [[ "$TYPE" == "BFI2_FREE" ]] && min_q=20
  if [[ "$q_count" =~ ^[0-9]+$ ]] && [[ "$q_count" -ge "$min_q" ]]; then
    ok "题库就绪（${q_count} 题激活）"
  else
    fail "题库不足（当前 ${q_count:-0} 题，需要 ≥${min_q}）"
    echo -e "    ${GRAY}导入：ENV=${ENV} npx ts-node scripts/seed_begreat.ts${NC}"
    failed=1
  fi

  if [[ $failed -ne 0 ]]; then
    echo ""
    echo -e "${RED}前置检查未通过，终止执行。${NC}" >&2
    exit 2
  fi
}

# ── 执行 ─────────────────────────────────────────────────────────────────────────

echo -e "\n${BOLD}${CYAN}════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   BeGREAT 开发测试号模拟答题${NC}"
echo -e "${BOLD}${CYAN}════════════════════════════════════════${NC}"
echo -e "${GRAY}时间：$(date '+%Y-%m-%d %H:%M:%S')  环境：${ENV}${NC}"

[[ "$NO_PREFLIGHT" == false ]] && preflight

head "执行模拟答题"
info "openId: ${OPEN_ID}  strategy: ${STRATEGY}  gender: ${GENDER}  age: ${AGE}  type: ${TYPE}"

local_ts_node() {
  if command -v ts-node &>/dev/null; then
    echo "ts-node"
  else
    echo "$BACKEND_DIR/node_modules/.bin/ts-node"
  fi
}

TS_NODE="$(local_ts_node)"

# 构造传给 TS 脚本的参数
TS_ARGS=(
  --openid  "$OPEN_ID"
  --strategy "$STRATEGY"
  --gender  "$GENDER"
  --age     "$AGE"
  --type    "$TYPE"
  --port    "$PORT"
)
[[ -n "$TOKEN_ARG" ]] && TS_ARGS+=(--token "$TOKEN_ARG")

set +e
ENV="$ENV" "$TS_NODE" "$SCRIPT_DIR/sim_assessment.ts" "${TS_ARGS[@]}"
EXIT_CODE=$?
set -e

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${BOLD}${GREEN}完成 ✓${NC}  用测试号登录小程序即可查看结果"
else
  echo -e "${BOLD}${RED}执行失败 ✗  请检查上方错误信息${NC}" >&2
fi

exit $EXIT_CODE
