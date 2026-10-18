#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "$(id -u)" == '0' ]] || { printf '%s\n' 'Run on the server as root' >&2; exit 1; }
for unit in smartcourse-certbot.service smartcourse-certbot.timer; do
  install -m 644 "$SOURCE_DIR/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
systemctl enable --now smartcourse-certbot.timer
systemctl list-timers smartcourse-certbot.timer --no-pager
