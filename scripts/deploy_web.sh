#!/bin/bash
# 构建 art_web 前端并部署到 nginx
# 用法：在 art_backend 项目根目录执行
#   bash scripts/deploy_web.sh [art_web路径]
#
# 默认 art_web 路径：与 art_backend 同级目录 ../art_web
# ECS 示例：bash scripts/deploy_web.sh /root/workspace/art_web

set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ART_WEB_DIR="${1:-../art_web}"

if [ ! -d "$ART_WEB_DIR" ]; then
  echo "❌ art_web 目录不存在：$ART_WEB_DIR"
  echo "   用法：bash scripts/deploy_web.sh <art_web路径>"
  exit 1
fi

echo "--- 构建 art_web 前端 ---"
cd "$ART_WEB_DIR"
if diff -q package-lock.json node_modules/.package-lock.json > /dev/null 2>&1; then
  echo "依赖无变化，跳过 npm install"
else
  npm ci --prefer-offline
fi
npm run build

echo "--- 同步 dist 到 art_backend/art_web_dist ---"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null || pwd)"
# 找回 art_backend 目录
cd -  # 回到 art_backend 根
mkdir -p art_web_dist
rsync -a --delete "$ART_WEB_DIR/dist/" art_web_dist/

echo "--- 重载 nginx（无需重建镜像）---"
docker compose restart nginx

echo "--- nginx 状态 ---"
docker ps --filter name=miniapp-nginx

echo ""
echo "✅ 部署完成！访问地址："
echo "   https://autorecordarchery.xyz/app/admin/login"
