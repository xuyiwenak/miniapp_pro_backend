#!/usr/bin/env bash
# 固定生产发布：构建 origin/release 的 linux/amd64 镜像并部署到 bn。
# 用法：./scripts/deploy_amd64_image.sh

set -euo pipefail

readonly PLATFORM='linux/amd64'
readonly IMAGE_NAME='art-backend'
readonly DEPLOY_HOST='bn'
readonly DEPLOY_PATH='/root/workspace/miniapp_pro_backend'
readonly DEPLOY_BRANCH='release'

buildContext=''
releaseCommit=''

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

requireCommand() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"
}

ensureCleanWorkingTree() {
  git diff --quiet || fail 'Working tree has unstaged changes; commit or stash before deployment'
  git diff --cached --quiet || fail 'Working tree has staged changes; commit before deployment'
}

prepareReleaseBuildContext() {
  git fetch origin "$DEPLOY_BRANCH"
  releaseCommit=$(git rev-parse "origin/$DEPLOY_BRANCH")
  buildContext=$(mktemp -d)
  git worktree add --detach "$buildContext" "$releaseCommit" >/dev/null
}

cleanupBuildContext() {
  [[ -n "$buildContext" ]] || return
  git worktree remove --force "$buildContext" >/dev/null 2>&1 || true
}

createImageReference() {
  printf '%s:%s\n' "$IMAGE_NAME" "${releaseCommit:0:12}"
}

buildImage() {
  local imageReference="$1"
  docker buildx build --platform "$PLATFORM" --load --tag "$imageReference" "$buildContext"
}

localImageExists() {
  docker image inspect "$1" >/dev/null 2>&1
}

remoteImageExists() {
  ssh "$DEPLOY_HOST" "docker image inspect '$1' >/dev/null 2>&1"
}

transferImage() {
  local imageReference="$1"
  docker image save "$imageReference" | gzip -1 | ssh "$DEPLOY_HOST" 'gzip -d | docker image load'
  remoteImageExists "$imageReference" || fail "Image verification failed on $DEPLOY_HOST"
}

prepareRemoteImage() {
  local imageReference="$1"
  if remoteImageExists "$imageReference"; then
    printf 'Image %s already exists on %s; skipping build and transfer.\n' "$imageReference" "$DEPLOY_HOST"
    return
  fi
  if localImageExists "$imageReference"; then
    printf 'Reusing local image %s.\n' "$imageReference"
  else
    buildImage "$imageReference"
  fi
  printf 'Sending compressed image stream to %s...\n' "$DEPLOY_HOST"
  transferImage "$imageReference"
}

restartServices() {
  local imageReference="$1"
  ssh "$DEPLOY_HOST" \
    "cd '$DEPLOY_PATH' && git pull --ff-only origin '$DEPLOY_BRANCH' && test \"\$(git rev-parse HEAD)\" = '$releaseCommit' && ART_BACKEND_IMAGE='$imageReference' docker compose up -d --no-build begreat_app mandis_app && docker compose ps begreat_app mandis_app"
}

main() {
  requireCommand docker
  requireCommand gzip
  requireCommand git
  requireCommand ssh
  ensureCleanWorkingTree
  prepareReleaseBuildContext
  trap cleanupBuildContext EXIT

  local imageReference
  imageReference=$(createImageReference)
  printf 'Preparing release commit %s as %s for %s...\n' "$releaseCommit" "$imageReference" "$PLATFORM"
  prepareRemoteImage "$imageReference"
  printf 'Restarting application services without a server-side build...\n'
  restartServices "$imageReference"
}

main "$@"
