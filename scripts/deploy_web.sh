#!/usr/bin/env bash

set -euo pipefail

readonly BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly APP_NAME="${1:-}"
case "$APP_NAME" in
  creator-web)
    readonly APP_DIR_NAME='creator-web' REMOTE_DIR_NAME='creator_web_dist' DEPLOY_PATH='/art/' ;;
  student-h5)
    readonly APP_DIR_NAME='student-h5' REMOTE_DIR_NAME='student_h5_dist' DEPLOY_PATH='/classroom/' ;;
  teacher-web)
    readonly APP_DIR_NAME='teacher-web' REMOTE_DIR_NAME='teacher_web_dist' DEPLOY_PATH='/teacher/' ;;
  *) printf '用法：deploy_web.sh creator-web|student-h5|teacher-web\n' >&2; exit 1 ;;
esac
readonly ART_WEB_DIR="${MANDIS_WEB_DIR:-${BACKEND_DIR}/mandis_web/apps/${APP_DIR_NAME}}"
readonly DEPLOY_HOST="${MANDIS_WEB_DEPLOY_HOST:-bn}"
readonly REMOTE_DIST_DIR="${MANDIS_WEB_REMOTE_DIST_DIR:-/root/workspace/miniapp_pro_backend/${REMOTE_DIR_NAME}}"
readonly DEPLOY_URL="${MANDIS_WEB_DEPLOY_URL:-https://www.starryspark.com.cn${DEPLOY_PATH}}"

logStep() {
  local stepName="$1"
  printf '\n==> %s\n' "$stepName"
}

installDependencies() {
  local dependencyHash
  local installedHash=''
  local workspaceDir="$BACKEND_DIR/mandis_web"
  local stampFile="$workspaceDir/node_modules/.mandis-web-package-lock.sha256"

  dependencyHash="$(shasum -a 256 "$workspaceDir/package-lock.json" | awk '{print $1}')"
  if [[ -f "$stampFile" ]]; then
    installedHash="$(<"$stampFile")"
  fi
  if [[ "$dependencyHash" == "$installedHash" ]]; then
    logStep '1/5 依赖未变化，跳过安装'
    return
  fi
  logStep "1/5 安装 ${APP_NAME} 依赖"
  npm --prefix "$BACKEND_DIR/mandis_web" install --prefer-offline
  printf '%s\n' "$dependencyHash" > "$stampFile"
}

buildFrontend() {
  logStep "2/5 构建 ${APP_NAME}"
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
  printf '%s 部署完成：%s\n' "$APP_NAME" "$DEPLOY_URL"
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
