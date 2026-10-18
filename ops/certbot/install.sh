#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BACKUP_DIR="/var/lib/certbot/managed-backups/$(date -u +%Y%m%dT%H%M%SZ)"
readonly DROP_IN='/etc/systemd/system/certbot.service.d/50-managed-certificates.conf'
readonly HOOK='/etc/letsencrypt/renewal-hooks/deploy/sync-nginx-certs.sh'

[[ "$(id -u)" == '0' ]] || { printf '%s\n' 'Run on the server as root' >&2; exit 1; }
if systemctl is-active --quiet smartcourse-certbot.service || systemctl is-active --quiet certbot.service; then
  printf '%s\n' 'Wait for the running certificate renewal to finish' >&2
  exit 1
fi
install -d -m 700 "$BACKUP_DIR"
[[ ! -f "$HOOK" ]] || cp -p "$HOOK" "$BACKUP_DIR/sync-nginx-certs.sh"
[[ ! -f "$DROP_IN" ]] || cp -p "$DROP_IN" "$BACKUP_DIR/certbot-service.conf"
python3 "$SOURCE_DIR/manage.py" archive-inactive-manual "$BACKUP_DIR/renewal"
install -d -m 755 /etc/systemd/system/certbot.service.d /etc/letsencrypt/renewal-hooks/deploy
install -m 644 "$SOURCE_DIR/certbot-service.conf" "$DROP_IN"
install -m 755 "$SOURCE_DIR/sync-nginx-certs.sh" "$HOOK"
if systemctl cat smartcourse-certbot.timer >/dev/null 2>&1; then
  systemctl disable --now smartcourse-certbot.timer
fi
systemctl daemon-reload
systemctl reset-failed certbot.service
systemctl enable --now certbot.timer
python3 "$SOURCE_DIR/manage.py" sync
python3 "$SOURCE_DIR/manage.py" audit
systemctl list-timers certbot.timer --no-pager
printf 'Prior configuration backed up at %s\n' "$BACKUP_DIR"
