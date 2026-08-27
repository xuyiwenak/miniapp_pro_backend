#!/usr/bin/env bash

set -euo pipefail

readonly BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ART_WEB_DIR="${MANDIS_WEB_DIR:-${BACKEND_DIR}/art_web}"
readonly DEPLOY_HOST="${MANDIS_WEB_DEPLOY_HOST:-bn}"
readonly REMOTE_DIST_DIR="${MANDIS_WEB_REMOTE_DIST_DIR:-/root/workspace/miniapp_pro_backend/art_web_dist}"
readonly DEPLOY_URL="${MANDIS_WEB_DEPLOY_URL:-https://www.starryspark.com.cn/art/}"

logStep() {
  local stepName="$1"
  printf '\n==> %s\n' "$stepName"
}

installDependencies() {
  if [[ ! -f "$ART_WEB_DIR/node_modules/.package-lock.json" ]] ||
    ! diff -q "$ART_WEB_DIR/package-lock.json" "$ART_WEB_DIR/node_modules/.package-lock.json" >/dev/null 2>&1; then
    logStep '1/5 安装 Mandis 网页端依赖'
    npm --prefix "$ART_WEB_DIR" ci --prefer-offline
    return
  fi
  logStep '1/5 依赖未变化，跳过安装'
}

buildFrontend() {
  logStep '2/5 构建 Mandis 网页端'
  npm --prefix "$ART_WEB_DIR" run build
  test -f "$ART_WEB_DIR/dist/index.html"
}

uploadStaticAssets() {
  logStep '3/5 上传 Mandis 网页端静态资源'
  ssh "$DEPLOY_HOST" "mkdir -p '$REMOTE_DIST_DIR'"
  rsync -az --exclude 'index.html' "$ART_WEB_DIR/dist/" "$DEPLOY_HOST:$REMOTE_DIST_DIR/"
}

publishIndex() {
  logStep '4/5 原子发布 Mandis 网页端入口'
  rsync -az "$ART_WEB_DIR/dist/index.html" "$DEPLOY_HOST:$REMOTE_DIST_DIR/.index.html.next"
  ssh "$DEPLOY_HOST" \
    "mv '$REMOTE_DIST_DIR/.index.html.next' '$REMOTE_DIST_DIR/index.html'"
}

verifyDeployment() {
  local localHash
  local remoteHash

  logStep '5/5 验证 Mandis 网页端'
  localHash="$(shasum -a 256 "$ART_WEB_DIR/dist/index.html" | awk '{print $1}')"
  remoteHash="$(ssh "$DEPLOY_HOST" "sha256sum '$REMOTE_DIST_DIR/index.html'" | awk '{print $1}')"
  if [[ "$localHash" != "$remoteHash" ]]; then
    printf '错误：Mandis 网页端线上入口与本地构建结果不一致。\n' >&2
    exit 1
  fi
  curl --fail --silent --show-error --location --output /dev/null "$DEPLOY_URL"
  printf 'Mandis 网页端部署完成：%s\n' "$DEPLOY_URL"
  printf '静态文件已生效，无需重启 Docker 或 reload Nginx。\n'
}

main() {
  installDependencies
  buildFrontend
  uploadStaticAssets
  publishIndex
  verifyDeployment
}

main "$@"
