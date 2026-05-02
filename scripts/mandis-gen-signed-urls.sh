#!/usr/bin/env bash
# mandis-gen-signed-urls.sh — 生成 OSS 静态图片签名 URL，写入 mandis/config/ossImages.js
#
# Usage:
#   ./scripts/mandis-gen-signed-urls.sh
#
# 依赖: openssl, python3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_FILE="$REPO_ROOT/mandis/config/ossImages.js"
SYSCONFIG="$SCRIPT_DIR/../src/apps/mandis/sysconfig/production/server_auth_config.json"

TEN_YEARS=$((10 * 365 * 24 * 3600))
EXPIRES=$(( $(date +%s) + TEN_YEARS ))

# ── 读取 OSS 配置 ──────────────────────────────────────────────────────────────
OSS_AK=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['accessKeyId'])")
OSS_SK=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['accessKeySecret'])")
OSS_BUCKET=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['bucket'])")
OSS_REGION=$(python3 -c "import json; c=json.load(open('$SYSCONFIG')); print(c['oss']['region'])")
OSS_HOST="https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com"
OSS_PREFIX="mandis/mini_app_loading/images"

# ── 生成单个签名 URL ───────────────────────────────────────────────────────────
sign_url() {
  local object_key="$1"
  local string_to_sign
  string_to_sign="$(printf 'GET\n\n\n%s\n/%s/%s' "$EXPIRES" "$OSS_BUCKET" "$object_key")"
  local sig
  sig=$(echo -n "$string_to_sign" | openssl dgst -sha1 -hmac "$OSS_SK" -binary | base64)
  local encoded_sig
  encoded_sig=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$sig")
  echo "${OSS_HOST}/${object_key}?OSSAccessKeyId=${OSS_AK}&Expires=${EXPIRES}&Signature=${encoded_sig}"
}

# ── 图片列表（const名 文件名 对应） ────────────────────────────────────────────
CONST_NAMES=(
  OSS_IMG_BACKGROUND
  OSS_IMG_WORDS_WELCOME
  OSS_IMG_WORDS_UPLOAD
  OSS_IMG_ICON_UPLOAD
  OSS_IMG_ICON_ORIGINAL
  OSS_IMG_ICON_IMAGE
  OSS_IMG_ICON_SAFE
)
FILE_NAMES=(
  background.webp
  words_welcome.webp
  words_upload.webp
  icon-upload.webp
  icon-original.webp
  icon-image.webp
  icon-safe.webp
)

# ── 生成并写入文件 ─────────────────────────────────────────────────────────────
echo "Generating signed URLs (valid 10 years)..."
echo

TMP=$(mktemp)
{
  echo "// 自动生成 - OSS 静态图片签名 URL（有效期 10 年）"
  echo "// 重新生成：./art_backend/scripts/mandis-gen-signed-urls.sh"
  echo "// 生成时间：$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo ""
  for i in "${!CONST_NAMES[@]}"; do
    const="${CONST_NAMES[$i]}"
    file="${FILE_NAMES[$i]}"
    url=$(sign_url "${OSS_PREFIX}/${file}")
    echo "export const ${const} = '${url}';"
    echo "  ✓ ${const}" >&2
  done
  echo ""
} > "$TMP"

mv "$TMP" "$OUT_FILE"
echo
echo "✓ Written to mandis/config/ossImages.js"
