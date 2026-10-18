#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SOURCE_DIR/../certbot/install.sh"
