#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SRC="$REPO_ROOT/deploy/carboard-web.service"
SERVICE_DEST="/etc/systemd/system/carboard-web.service"

sudo cp "$SERVICE_SRC" "$SERVICE_DEST"
sudo systemctl daemon-reload
sudo systemctl enable carboard-web.service
sudo systemctl restart carboard-web.service
