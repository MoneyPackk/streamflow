#!/usr/bin/env python3
import os
import sys
from pathlib import Path

import paramiko

HOST = "5.161.178.63"
KEY = str(Path.home() / ".ssh" / "hetzner_deploy")
DOMAIN = "moneypack.wtf"
EMAIL = "blazingscrubs@gmail.com"
APP_DIR = "/opt/streamflow"

TMDB = os.environ.get("TMDB_API_KEY", "")
JWT = os.environ.get("JWT_SECRET", "")


def run(ssh, cmd, timeout=600):
    print(">>>", cmd[:120])
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out.encode("ascii", errors="replace").decode())
    if err:
        print("ERR:", err.encode("ascii", errors="replace").decode())
    return code


def main():
    if not TMDB or not JWT:
        print("Missing TMDB_API_KEY or JWT_SECRET env vars")
        sys.exit(1)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", key_filename=KEY, timeout=30)

    run(ssh, f"cd {APP_DIR} && npm install --production", timeout=600)

    env_content = (
        f"JWT_SECRET={JWT}\n"
        f"TMDB_API_KEY={TMDB}\n"
        "PORT=3000\n"
        "NODE_ENV=production\n"
        f"ALLOWED_ORIGINS=https://{DOMAIN}\n"
    )
    sftp = ssh.open_sftp()
    with sftp.file(f"{APP_DIR}/.env", "w") as f:
        f.write(env_content)
    sftp.close()

    systemd = f"""[Unit]
Description=PeacocksStreams
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory={APP_DIR}
EnvironmentFile={APP_DIR}/.env
ExecStart=/usr/bin/node src/server/index.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
"""
    with ssh.open_sftp().file("/etc/systemd/system/streamflow.service", "w") as f:
        f.write(systemd)

    nginx = f"""server {{
    listen 80;
    server_name {DOMAIN} www.{DOMAIN};
    client_max_body_size 50m;

    location / {{
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }}
}}
"""
    with ssh.open_sftp().file("/etc/nginx/sites-available/streamflow", "w") as f:
        f.write(nginx)

    run(
        ssh,
        "ln -sf /etc/nginx/sites-available/streamflow /etc/nginx/sites-enabled/ && "
        "rm -f /etc/nginx/sites-enabled/default && nginx -t",
    )
    run(ssh, "systemctl daemon-reload && systemctl enable streamflow && systemctl restart streamflow")
    run(ssh, "systemctl reload nginx")
    run(
        ssh,
        f"certbot --nginx -d {DOMAIN} -d www.{DOMAIN} --non-interactive --agree-tos -m {EMAIL} "
        "|| echo CERTBOT_SKIPPED",
        timeout=300,
    )
    run(ssh, "sleep 2; curl -sf http://127.0.0.1:3000/api/health")
    run(ssh, "curl -sf http://127.0.0.1:3000/ | grep -o 'app.js?v=[0-9]*' | head -1")
    run(ssh, "systemctl is-active streamflow nginx")
    ssh.close()


if __name__ == "__main__":
    main()
