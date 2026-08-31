#!/usr/bin/env bash

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DEPLOY_HOST="${ART_BACKEND_DEPLOY_HOST:-bn}"
readonly DEPLOY_PATH="${ART_BACKEND_DEPLOY_PATH:-/root/workspace/miniapp_pro_backend}"
readonly DEPLOY_BRANCH='release'

baseRef='origin/release'
executeDeployment=false
backendImageChanged=false
begreatConfigChanged=false
mandisConfigChanged=false
nginxChanged=false
composeChanged=false
hostFilesChanged=false
changedFiles=()
frontendTargets=()

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

showUsage() {
  cat <<'EOF'
用法：
  ./scripts/deploy_smart.sh [--base <git-ref>]
  ./scripts/deploy_smart.sh --execute [--base <git-ref>]

默认只输出发布计划；--execute 才执行发布。
默认比较 origin/release、HEAD、暂存区、工作区和未跟踪文件。
EOF
}

parseArguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --base)
        [[ $# -ge 2 ]] || fail '--base 缺少 Git ref'
        baseRef="$2"
        shift 2
        ;;
      --execute) executeDeployment=true; shift ;;
      -h|--help) showUsage; exit 0 ;;
      *) fail "未知参数：$1" ;;
    esac
  done
}

addFrontendTarget() {
  local target="$1"
  local existingTarget
  if [[ ${#frontendTargets[@]} -gt 0 ]]; then
    for existingTarget in "${frontendTargets[@]}"; do
      [[ "$existingTarget" == "$target" ]] && return
    done
  fi
  frontendTargets+=("$target")
}

addAllFrontends() {
  addFrontendTarget 'creator-web'
  addFrontendTarget 'student-h5'
  addFrontendTarget 'teacher-web'
}

collectChangedFiles() {
  git rev-parse --verify "$baseRef^{commit}" >/dev/null 2>&1 || fail "Git ref 不存在：$baseRef"
  while IFS= read -r filePath; do
    [[ -n "$filePath" ]] && changedFiles+=("$filePath")
  done < <(
    {
      git diff --name-only "$baseRef"...HEAD
      git diff --name-only
      git diff --cached --name-only
      git ls-files --others --exclude-standard
    } | sort -u
  )
}

classifyFile() {
  local filePath="$1"
  case "$filePath" in
    AGENTS.md|*/AGENTS.md) ;;
    mandis_web/apps/creator-web/*) addFrontendTarget 'creator-web' ;;
    mandis_web/apps/student-h5/*) addFrontendTarget 'student-h5' ;;
    mandis_web/apps/teacher-web/*) addFrontendTarget 'teacher-web' ;;
    mandis_web/packages/common/*|mandis_web/package.json|mandis_web/package-lock.json) addAllFrontends ;;
    src/apps/begreat/sysconfig/*) begreatConfigChanged=true ;;
    src/apps/mandis/sysconfig/*) mandisConfigChanged=true ;;
    src/*|tpl/*|package.json|package-lock.json|Dockerfile|.dockerignore) backendImageChanged=true ;;
    tsconfig*.json|tsrpc.config.ts|json_to_schema.mjs) backendImageChanged=true ;;
    nginx/*) nginxChanged=true ;;
    docker-compose.yml) composeChanged=true ;;
    static/*) hostFilesChanged=true ;;
  esac
}

classifyChanges() {
  local filePath
  [[ ${#changedFiles[@]} -gt 0 ]] || return 0
  for filePath in "${changedFiles[@]}"; do
    classifyFile "$filePath"
  done
}

needsServerSync() {
  [[ "$backendImageChanged" == true || "$begreatConfigChanged" == true ||
    "$mandisConfigChanged" == true || "$nginxChanged" == true ||
    "$composeChanged" == true || "$hostFilesChanged" == true ]]
}

printPlan() {
  printf '比较基准：%s\n' "$baseRef"
  printf '检测到 %s 个变更文件。\n' "${#changedFiles[@]}"
  local target
  if [[ ${#frontendTargets[@]} -gt 0 ]]; then
    for target in "${frontendTargets[@]}"; do
      printf '  [静态前端] %s：构建并 rsync，不重启 Docker\n' "$target"
    done
  fi
  [[ "$backendImageChanged" == true ]] && printf '%s\n' '  [后端镜像] 构建、传输并重启应用容器'
  [[ "$begreatConfigChanged" == true ]] && printf '%s\n' '  [配置] 同步 Git 并重启 begreat_app'
  [[ "$mandisConfigChanged" == true ]] && printf '%s\n' '  [配置] 同步 Git 并重启 mandis_app'
  [[ "$nginxChanged" == true ]] && printf '%s\n' '  [Nginx] 同步 Git、检查配置并 reload'
  [[ "$composeChanged" == true ]] && printf '%s\n' '  [Compose] 同步 Git并按现有后端镜像更新服务'
  [[ "$hostFilesChanged" == true ]] && printf '%s\n' '  [宿主机文件] 仅同步 Git，bind mount 自动生效'
  [[ ${#frontendTargets[@]} -eq 0 ]] && ! needsServerSync && printf '%s\n' '  无需发布运行时内容。'
  return 0
}

ensureCleanWorkingTree() {
  git diff --quiet || fail '服务器发布要求工作区干净，请先提交改动'
  git diff --cached --quiet || fail '服务器发布要求暂存区干净，请先提交改动'
}

releaseAndSyncServer() {
  ensureCleanWorkingTree
  "$REPO_ROOT/scripts/release.sh" --yes
  ssh "$DEPLOY_HOST" \
    "cd '$DEPLOY_PATH' && git pull --ff-only origin '$DEPLOY_BRANCH'"
}

applyComposeChanges() {
  local remoteCommand="cd '$DEPLOY_PATH' && "
  remoteCommand+="currentImage=\$(docker inspect -f '{{.Config.Image}}' miniapp-mandis) && "
  remoteCommand+='ART_BACKEND_IMAGE="$currentImage" docker compose up -d --no-build'
  ssh "$DEPLOY_HOST" "$remoteCommand"
}

applyServerChanges() {
  needsServerSync || return 0
  releaseAndSyncServer
  if [[ "$backendImageChanged" == true ]]; then
    "$REPO_ROOT/scripts/deploy_amd64_image.sh"
  fi
  [[ "$composeChanged" == true ]] && applyComposeChanges
  if [[ "$backendImageChanged" != true && "$begreatConfigChanged" == true ]]; then
    ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && docker compose restart begreat_app"
  fi
  if [[ "$backendImageChanged" != true && "$mandisConfigChanged" == true ]]; then
    ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && docker compose restart mandis_app"
  fi
  if [[ "$nginxChanged" == true ]]; then
    ssh "$DEPLOY_HOST" "docker exec miniapp-nginx nginx -t && docker exec miniapp-nginx nginx -s reload"
  fi
}

executePlan() {
  local target
  if needsServerSync; then
    ensureCleanWorkingTree
  fi
  if [[ ${#frontendTargets[@]} -gt 0 ]]; then
    for target in "${frontendTargets[@]}"; do
      "$REPO_ROOT/scripts/deploy_web.sh" "$target"
    done
  fi
  applyServerChanges
}

main() {
  parseArguments "$@"
  cd "$REPO_ROOT"
  collectChangedFiles
  classifyChanges
  printPlan
  [[ "$executeDeployment" == true ]] || return 0
  executePlan
}

main "$@"
