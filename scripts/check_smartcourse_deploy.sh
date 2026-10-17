#!/usr/bin/env bash
# Read-only prerequisite checks. Never print the server environment file.
set -euo pipefail
deployHost="${ART_BACKEND_DEPLOY_HOST:-bn}"
deployPath="${ART_BACKEND_DEPLOY_PATH:-/root/workspace/miniapp_pro_backend}"
ssh "$deployHost" bash -s -- "$deployPath" <<'REMOTE'
set -euo pipefail
configFile="$1/config/.smartCourse.env"
certDir='/etc/letsencrypt/live/smart.starryspark.com.cn'
test -s "$configFile" || { echo '缺少 config/.smartCourse.env，请先配置 smartCourse 服务端凭据'; exit 1; }
for name in SMARTCOURSE_DB_USER SMARTCOURSE_DB_PASSWORD SMARTCOURSE_BAILIAN_APP_ID; do
  grep -Eq "^${name}=.+" "$configFile" || { echo "缺少配置项：$name"; exit 1; }
done
test -s "$certDir/privkey.pem" || { echo 'smartCourse HTTPS 私钥尚未准备'; exit 1; }
openssl x509 -in "$certDir/fullchain.pem" -noout -checkhost smart.starryspark.com.cn
openssl x509 -in "$certDir/fullchain.pem" -noout -checkend 86400
echo 'smartCourse 配置项与证书预检查通过（实际凭据有效性仍由联调验证）'
REMOTE
