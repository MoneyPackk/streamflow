#!/usr/bin/env python3
import os
import sys
import time
from pathlib import Path

import paramiko

HOST = "5.161.178.63"
PASSWORD = os.environ.get("STREAMFLOW_ROOT_PW", "")
PUB = Path.home().joinpath(".ssh", "hetzner_deploy.pub").read_text().strip()
PUB_TOKEN = PUB.split()[1]


def connect():
    for attempt in range(10):
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(
                HOST,
                username="root",
                password=PASSWORD,
                timeout=30,
                look_for_keys=False,
                allow_agent=False,
            )
            return ssh
        except Exception as exc:
            print(f"attempt {attempt + 1} failed: {exc}")
            time.sleep(5)
    raise SystemExit("SSH connect failed")


def run(ssh, cmd, timeout=300):
    print(">>>", cmd)
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print("ERR:", err)
    print("exit", code)
    return code, out, err


def main():
    if not PASSWORD:
        print("Set STREAMFLOW_ROOT_PW")
        sys.exit(1)

    ssh = connect()

    run(
        ssh,
        "mkdir -p /root/.ssh && chmod 700 /root/.ssh && "
        f"grep -qF '{PUB_TOKEN}' /root/.ssh/authorized_keys 2>/dev/null || "
        f"echo '{PUB}' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys",
    )

    run(ssh, "hostname; uname -a")
    run(ssh, "systemctl is-active streamflow 2>/dev/null || echo inactive")
    run(ssh, "test -d /opt/streamflow && ls -la /opt/streamflow | head -8 || echo NO_REPO")

    if run(ssh, "test -f /opt/streamflow/scripts/deploy-update.sh")[0] == 0:
        run(ssh, "bash /opt/streamflow/scripts/deploy-update.sh", timeout=300)
    else:
        run(
            ssh,
            "curl -sL https://raw.githubusercontent.com/MoneyPackk/streamflow/master/deploy.sh | "
            "bash -s moneypack.wtf blazingscrubs@gmail.com",
            timeout=600,
        )

    run(ssh, "sleep 2; curl -sf http://127.0.0.1:3000/api/health")
    run(ssh, "curl -sf http://127.0.0.1:3000/ | grep -o 'app.js?v=[0-9]*' | head -1")
    run(ssh, "systemctl status streamflow --no-pager -l | head -20")
    run(ssh, "nginx -t 2>&1; systemctl is-active nginx")
    ssh.close()


if __name__ == "__main__":
    main()
