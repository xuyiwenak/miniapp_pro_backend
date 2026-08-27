#!/usr/bin/env bash

set -euo pipefail

readonly BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
readonly DEFAULT_COMMANDER_MESSAGE='chore(deploy): update commander'

showUsage() {
  printf '%s\n' '用法：'
  printf '%s\n' '  ./deploy.sh commander [commit message]'
  printf '%s\n' '  ./deploy.sh mandis-web'
  printf '\n%s\n' '发布单元：'
  printf '%s\n' '  commander   BeGreat + Mandis 共用管理后台'
  printf '%s\n' '  mandis-web  Mandis 用户网页端'
}

deployCommander() {
  local commitMessage="${1:-$DEFAULT_COMMANDER_MESSAGE}"
  cd "$PROJECT_ROOT/commander"
  exec ./build.sh "$commitMessage"
}

deployMandisWeb() {
  cd "$BACKEND_DIR"
  exec ./scripts/deploy_web.sh
}

main() {
  local target="${1:-}"

  case "$target" in
    commander)
      deployCommander "${2:-}"
      ;;
    mandis-web)
      deployMandisWeb
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
