#!/bin/bash
# Run on the production server after initial deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/streamflow}"
BRANCH="${BRANCH:-master}"

echo "=== PeacocksStreams deploy update ==="
cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "ERROR: $APP_DIR is not a git repo. Run deploy.sh first."
  exit 1
fi

echo "=== Pulling latest ($BRANCH) ==="
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "=== Installing dependencies ==="
npm install --production

echo "=== Restarting service ==="
if systemctl is-active --quiet streamflow; then
  systemctl restart streamflow
elif command -v pm2 >/dev/null; then
  pm2 restart streamflow || pm2 start src/server/index.js --name streamflow
else
  echo "WARN: no systemd/pm2 — start node manually"
fi

sleep 2
echo "=== Health check ==="
curl -sf "http://127.0.0.1:${PORT:-3000}/api/health" | head -c 200
echo ""
echo "=== Done ==="
