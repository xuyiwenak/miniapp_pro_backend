#!/usr/bin/env bash
set -euo pipefail

# Nginx reads the renewed certificate directly through the existing bind mount.
readonly CERT_DIR='/etc/letsencrypt/live/smart.starryspark.com.cn'
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -checkhost smart.starryspark.com.cn
docker exec miniapp-nginx nginx -t
docker exec miniapp-nginx nginx -s reload
printf '%s\n' 'smartCourse certificate verified and Nginx gracefully reloaded'
