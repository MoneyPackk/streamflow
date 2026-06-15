#!/bin/bash
set -e

echo "=== Updating packages ==="
apt-get update -qq && apt-get install -y -qq git ffmpeg nginx certbot python3-certbot-nginx nodejs npm

echo "=== Cloning StreamFlow ==="
rm -rf /opt/streamflow
git clone https://github.com/MoneyPackk/streamflow.git /opt/streamflow

echo "=== Installing dependencies ==="
cd /opt/streamflow && npm install --production

echo "=== Generating JWT secret ==="
echo '{"JWT_SECRET":"'$(openssl rand -hex 32)'"}' > /opt/streamflow/.env

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/streamflow.service <<'EOF'
[Unit]
Description=StreamFlow
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=/opt/streamflow
ExecStart=/usr/bin/node src/server/index.js
Restart=always
RestartSec=5
Environment=PORT=3000 NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF

echo "=== Starting StreamFlow service ==="
systemctl daemon-reload && systemctl enable --now streamflow

echo "=== Configuring nginx ==="
cat > /etc/nginx/sites-available/streamflow <<'NGINX'
server { listen 80; server_name _; client_max_body_size 10G; location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection 'upgrade'; proxy_set_header Host $host; proxy_cache_bypass $http_upgrade; } location /uploads/ { alias /opt/streamflow/public/uploads/; expires 30d; add_header Cache-Control "public, immutable"; } }
NGINX

ln -sf /etc/nginx/sites-available/streamflow /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== Checking status ==="
sleep 2
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000

echo ""
echo "=== Done! StreamFlow is running ==="
echo "Server: http://5.161.178.63"
echo "Domain: https://moneypack.is-a.dev"
