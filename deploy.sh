#!/bin/bash
# Initial production setup — Ubuntu 24.04 on Hetzner
# Usage: bash deploy.sh moneypack.wtf your@email.com
set -euo pipefail

DOMAIN="${1:-moneypack.wtf}"
EMAIL="${2:-admin@${DOMAIN}}"
APP_DIR="/opt/streamflow"
REPO="https://github.com/MoneyPackk/streamflow.git"

echo "=== Updating packages ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl nginx certbot python3-certbot-nginx build-essential python3

# Node 20 via NodeSource
if ! command -v node >/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "=== Clone or update app ==="
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull origin master
else
  rm -rf "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "=== Install dependencies ==="
npm install --production

echo "=== Environment ==="
if [ ! -f "$APP_DIR/.env" ]; then
  JWT=$(openssl rand -hex 32)
  cat > "$APP_DIR/.env" <<EOF
JWT_SECRET=${JWT}
TMDB_API_KEY=REPLACE_WITH_YOUR_TMDB_V4_TOKEN
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://${DOMAIN}
EOF
  echo "Created $APP_DIR/.env — ADD YOUR TMDB_API_KEY before going live!"
else
  echo "Keeping existing .env"
fi

echo "=== systemd service ==="
cat > /etc/systemd/system/streamflow.service <<EOF
[Unit]
Description=PeacocksStreams
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node src/server/index.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable streamflow
systemctl restart streamflow

echo "=== nginx ==="
cat > /etc/nginx/sites-available/streamflow <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/streamflow /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== SSL (certbot) ==="
certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" || echo "SSL skipped — configure DNS first"

echo "=== Monitor cron (hourly) ==="
chmod +x "$APP_DIR/scripts/monitor.mjs" 2>/dev/null || true
(crontab -l 2>/dev/null | grep -v peacocks-monitor; echo "0 * * * * cd ${APP_DIR} && node scripts/monitor.mjs >> /var/log/peacocks-monitor.log 2>&1") | crontab -

sleep 2
curl -sf "http://127.0.0.1:3000/api/health" && echo ""

echo ""
echo "=== PeacocksStreams deployed ==="
echo "URL:  https://${DOMAIN}"
echo "Pull updates: bash ${APP_DIR}/scripts/deploy-update.sh"
