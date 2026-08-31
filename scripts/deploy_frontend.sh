#!/usr/bin/env bash

set -euo pipefail

readonly BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
readonly DEFAULT_COMMANDER_MESSAGE='chore(deploy): update commander'

showUsage() {
  printf '%s\n' '用法：'
  printf '%s\n' '  ./deploy.sh commander [commit message]'
  printf '%s\n' '  ./deploy.sh creator-web'
  printf '%s\n' '  ./deploy.sh student-h5'
  printf '%s\n' '  ./deploy.sh teacher-web'
  printf '%s\n' '  ./deploy.sh smart [--execute]'
  printf '\n%s\n' '发布单元：'
  printf '%s\n' '  commander   BeGreat + Mandis 共用管理后台'
  printf '%s\n' '  creator-web  Mandis 个人创作端'
  printf '%s\n' '  student-h5   学生课堂 H5'
  printf '%s\n' '  teacher-web  多教师课堂端'
  printf '%s\n' '  smart        按 Git 变更自动生成或执行最小发布计划'
}

deployCommander() {
  local commitMessage="${1:-$DEFAULT_COMMANDER_MESSAGE}"
  cd "$PROJECT_ROOT/commander"
  exec ./build.sh "$commitMessage"
}

deployMandisWeb() {
  local appName="$1"
  cd "$BACKEND_DIR"
  exec ./scripts/deploy_web.sh "$appName"
}

deploySmart() {
  cd "$BACKEND_DIR"
  exec ./scripts/deploy_smart.sh "${@:2}"
}

main() {
  local target="${1:-}"

  case "$target" in
    commander)
      deployCommander "${2:-}"
      ;;
    creator-web|student-h5|teacher-web)
      deployMandisWeb "$target"
      ;;
    smart)
      deploySmart "$@"
      ;;
    -h|--help|help|'')
      showUsage
      ;;
    *)
      printf '错误：未知发布目标 %s。\n\n' "$target" >&2
      showUsage >&2
      exit 1
      ;;
  esac
}

main "$@"
