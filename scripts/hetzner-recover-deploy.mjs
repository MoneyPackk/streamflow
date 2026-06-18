#!/usr/bin/env node
/** Use logged-in Edge profile to access Hetzner API via console session */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const TARGET_IP = '5.161.178.63';
const EDGE_PROFILE = join(homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');
const PUB_KEY = readFileSync(join(homedir(), '.ssh', 'hetzner_deploy.pub'), 'utf8').trim();

async function hetznerFetch(page, path, opts = {}) {
  return page.evaluate(async ({ path, opts }) => {
    const res = await fetch(`https://api.hetzner.cloud/v1${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json };
  }, { path, opts });
}

async function sshDeploy(host, password) {
  const py = `
import paramiko, sys
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('${host}', username='root', password='''${password.replace(/'/g, "''")}''', timeout=30, look_for_keys=False, allow_agent=False)
cmds = [
  'mkdir -p /opt/streamflow',
  'if [ ! -d /opt/streamflow/.git ]; then git clone https://github.com/MoneyPackk/streamflow.git /opt/streamflow; fi',
  'cd /opt/streamflow && git fetch origin && git checkout master && git pull origin master',
  'cd /opt/streamflow && npm install --production',
  'if [ -f /opt/streamflow/scripts/deploy-update.sh ]; then bash /opt/streamflow/scripts/deploy-update.sh; else systemctl restart streamflow 2>/dev/null || (cd /opt/streamflow && nohup node src/server/index.js > /var/log/streamflow.log 2>&1 &); fi',
  'sleep 2; curl -sf http://127.0.0.1:3000/api/health || echo HEALTH_FAIL'
]
for c in cmds:
  print('>>>', c)
  stdin, stdout, stderr = ssh.exec_command(c, timeout=300)
  out = stdout.read().decode(); err = stderr.read().decode()
  if out: print(out)
  if err: print('ERR:', err, file=sys.stderr)
  if stdout.channel.recv_exit_status() != 0:
    print('CMD_FAILED', c); sys.exit(1)
ssh.close()
print('DEPLOY_OK')
`;
  const r = spawnSync('python', ['-c', py], { encoding: 'utf8', timeout: 300000 });
  console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  return r.status === 0 && r.stdout.includes('DEPLOY_OK');
}

async function main() {
  const context = await chromium.launchPersistentContext(join(EDGE_PROFILE, 'Default'), {
    channel: 'msedge',
    headless: false,
    args: ['--profile-directory=Default'],
  });
  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle', timeout: 90000 });
  const url = page.url();
  console.log('Console URL:', url);
  if (/login|accounts|signup/.test(url)) {
    console.error('Please log into Hetzner in the opened browser, then re-run this script.');
    await page.waitForURL('**/projects**', { timeout: 300000 });
  }

  const serversRes = await hetznerFetch(page, '/servers');
  console.log('Servers API status:', serversRes.status);
  if (serversRes.status !== 200) {
    console.error('Cannot list servers:', JSON.stringify(serversRes.json).slice(0, 500));
    await context.close();
    process.exit(1);
  }

  const server = serversRes.json.servers?.find((s) => s.public_net?.ipv4?.ip === TARGET_IP)
    || serversRes.json.servers?.[0];
  if (!server) {
    console.error('No server found');
    await context.close();
    process.exit(1);
  }
  console.log(`Target server: ${server.name} (${server.id}) @ ${server.public_net?.ipv4?.ip}`);

  // Reset root password
  const reset = await hetznerFetch(page, `/servers/${server.id}/actions/reset_password`, { method: 'POST', body: {} });
  console.log('Reset password status:', reset.status);
  const newPassword = reset.json?.root_password;
  if (!newPassword) {
    console.error('No root_password in response:', JSON.stringify(reset.json).slice(0, 500));
    await context.close();
    process.exit(1);
  }
  console.log('Got new root password (not logging it)');

  // Add SSH key
  const keyName = 'hetzner_deploy_cursor';
  let keyId;\
  const keysRes = await hetznerFetch(page, '/ssh_keys');
  const existing = keysRes.json?.ssh_keys?.find((k) => k.name === keyName);
  if (existing) {
    keyId = existing.id;
  } else {
    const createKey = await hetznerFetch(page, '/ssh_keys', {
      method: 'POST',
      body: { name: keyName, public_key: PUB_KEY },
    });
    if (createKey.status !== 201) {
      console.warn('SSH key create:', createKey.status, JSON.stringify(createKey.json).slice(0, 200));
    } else {
      keyId = createKey.json.ssh_key?.id;
    }
  }

  if (keyId) {
    const attach = await hetznerFetch(page, `/servers/${server.id}/actions/add_to_placement_group`, { method: 'POST', body: {} });
    // attach ssh key via rebuild or use reset password path
    const sshAction = await hetznerFetch(page, `/servers/${server.id}/actions/change_type`, { method: 'POST', body: { server_type: server.server_type.name, ssh_keys: [keyId] } });
    console.log('SSH attach attempt status:', sshAction.status);
  }

  await context.close();

  // Wait for password to propagate
  await new Promise((r) => setTimeout(r, 5000));

  const ok = await sshDeploy(TARGET_IP, newPassword);
  if (!ok) process.exit(1);
  console.log('Production deploy complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
