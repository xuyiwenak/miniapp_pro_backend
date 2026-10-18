#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/python3 /root/workspace/miniapp_pro_backend/ops/certbot/manage.py sync
