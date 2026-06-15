#!/bin/bash
set -euo pipefail

echo "=== StreamFlow Deploy ==="

# Config - edit these
DOMAIN="${1:-localhost}"
ADMIN_EMAIL="${2:-admin@streamflow.app}"

echo "Domain: $DOMAIN"
echo "Email: $ADMIN_EMAIL"

# Install deps
apt-get update -qq
apt-get install -y -qq curl ffmpeg nginx certbot python3-certbot-nginx nodejs npm git

# Clone the project
cd /opt
git clone https://github.com/moneypack/streamflow.git
cd streamflow

# Install Node deps & build
npm install --production

# Create systemd service
cat > /etc/systemd/system/streamflow.service <<EOF
[Unit]
Description=StreamFlow Streaming Platform
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/streamflow
ExecStart=/usr/bin/node src/server/index.js
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NODE_ENV=production
Environment=JWT_SECRET=$(openssl rand -hex 32)

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable streamflow
systemctl start streamflow

# Nginx reverse proxy
cat > /etc/nginx/sites-available/streamflow <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 10G;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /uploads/ {
        alias /opt/streamflow/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/streamflow /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL via Let's Encrypt
if [ "$DOMAIN" != "localhost" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" || echo "SSL failed (domains may not resolve yet)"
fi

echo ""
echo "=== DEPLOY COMPLETE ==="
echo "Site: http://$DOMAIN"
echo "API:  http://$DOMAIN/api"
echo ""
echo "Register at /register then upload videos at /upload"
echo "Update your is-a.dev A record to: $(curl -s ifconfig.me)"
