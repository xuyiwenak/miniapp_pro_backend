#!/usr/bin/env bash
# mandis-upload-static.sh — 将 mandis/static/images/ 下的 WebP 上传到 OSS
#
# Usage:
#   ./scripts/mandis-upload-static.sh
#
# 依赖: curl, openssl, python3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANDIS_IMAGES_DIR="$REPO_ROOT/mandis/static/images"
SYSCONFIG="$SCRIPT_DIR/../src/apps/mandis/sysconfig/production/server_auth_config.json"

# ── 读取 OSS 配置 ──────────────────────────────────────────────────────────────
OSS_AK=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['accessKeyId'])")
OSS_SK=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['accessKeySecret'])")
OSS_BUCKET=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['bucket'])")
OSS_REGION=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['region'])")
OSS_HOST="${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com"
OSS_PREFIX="mandis/mini_app_loading/images"

# ── HMAC-SHA1 签名 ─────────────────────────────────────────────────────────────
hmac_sha1_base64() {
  echo -n "$2" | openssl dgst -sha1 -hmac "$1" -binary | base64
}

# ── 上传单个文件 ───────────────────────────────────────────────────────────────
upload_file() {
  local file_path="$1"
  local object_key="$2"
  local content_type="image/webp"

  local date
  date=$(date -u "+%a, %d %b %Y %H:%M:%S GMT")
  local md5
  md5=$(openssl md5 -binary "$file_path" | base64)

  local string_to_sign="PUT\n${md5}\n${content_type}\n${date}\n/${OSS_BUCKET}/${object_key}"
  local signature
  signature=$(hmac_sha1_base64 "$OSS_SK" "$(printf '%b' "$string_to_sign")")

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT \
    -H "Authorization: OSS ${OSS_AK}:${signature}" \
    -H "Content-Type: ${content_type}" \
    -H "Content-MD5: ${md5}" \
    -H "Date: ${date}" \
    -H "Host: ${OSS_HOST}" \
    --data-binary "@${file_path}" \
    "https://${OSS_HOST}/${object_key}")

  if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    echo "✓ $(basename "$file_path") → https://${OSS_HOST}/${object_key}"
  else
    echo "✗ $(basename "$file_path"): HTTP $http_code" >&2
    return 1
  fi
}

# ── 主流程 ─────────────────────────────────────────────────────────────────────
webp_files=("$MANDIS_IMAGES_DIR"/*.webp)

if [[ ! -e "${webp_files[0]}" ]]; then
  echo "No .webp files found in $MANDIS_IMAGES_DIR"
  exit 0
fi

echo "Uploading ${#webp_files[@]} WebP files to OSS..."
echo

for file in "${webp_files[@]}"; do
  upload_file "$file" "${OSS_PREFIX}/$(basename "$file")"
done

echo
echo "Done. OSS base URL:"
echo "https://${OSS_HOST}/${OSS_PREFIX}/"
