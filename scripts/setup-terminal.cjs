const { Client } = require('ssh2');
const c = new Client();

const script = `
# Install ttyd if needed
curl -sL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd
chmod +x /usr/local/bin/ttyd

# Create user
id peacock || useradd -m -s /bin/bash peacock
echo peacock:peacock8080 | chpasswd

# Stop any existing ttyd, restart
systemctl stop peacock-terminal 2>/dev/null
killall ttyd 2>/dev/null
nohup /usr/local/bin/ttyd -i lo -p 8080 -c peacock:peacock8080 bash > /dev/null 2>&1 &

# Generate self-signed cert for nginx
mkdir -p /etc/ssl/certs /etc/ssl/private
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/self.key \
  -out /etc/ssl/certs/self.crt \
  -subj "/CN=5.161.178.63" 2>/dev/null

# Configure nginx to proxy terminal through HTTPS
cat > /etc/nginx/sites-available/default << 'NGX'
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name _;
    ssl_certificate /etc/ssl/certs/self.crt;
    ssl_certificate_key /etc/ssl/private/self.key;
    client_max_body_size 10G;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    location /terminal/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGX

ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/streamflow

# Set up streamflow service properly
cat > /etc/systemd/system/streamflow.service << 'SVCEOF'
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
SVCEOF

systemctl daemon-reload
systemctl enable --now streamflow

nginx -t && systemctl reload nginx

sleep 3
echo "=== STATUS ==="
echo "StreamFlow: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"
echo "ttyd: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080)"
echo "DONE"
`;

c.on('ready', () => {
  c.exec(script, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => { console.log(out); c.end(); });
  });
});
c.on('error', e => console.error('SSH ERROR:', e.message));
c.connect({ host: '5.161.178.63', username: 'root', password: '4kaeAVmcfens', readyTimeout: 30000 });
