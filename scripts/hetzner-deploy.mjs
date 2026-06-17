#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const TARGET_IP = '5.161.178.63';
const PUB_KEY = readFileSync(join(homedir(), '.ssh', 'hetzner_deploy.pub'), 'utf8').trim();

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const apiCalls = [];

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('api.hetzner.cloud')) return;
    try {
      const body = await res.json();
      apiCalls.push({ url, status: res.status(), body });
    } catch {
      apiCalls.push({ url, status: res.status() });
    }
  });

  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle', timeout: 60000 });
  if (/login|accounts/.test(page.url())) {
    console.error('NOT_LOGGED_IN');
    process.exit(2);
  }

  await page.waitForTimeout(4000);

  // Dump server-related API responses
  const serverCalls = apiCalls.filter((c) => c.url.includes('/servers'));
  if (serverCalls.length) {
    for (const c of serverCalls) {
      console.log('API', c.url, c.status);
      if (c.body?.servers) {
        for (const s of c.body.servers) {
          console.log(`SERVER id=${s.id} name=${s.name} ip=${s.public_net?.ipv4?.ip}`);
        }
      }
    }
  }

  // Navigate to servers list explicitly
  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const bodyText = await page.locator('body').innerText();
  if (bodyText.includes(TARGET_IP)) {
    console.log('Found target IP on page');
  }

  const links = await page.locator(`a:has-text("${TARGET_IP}")`).all();
  console.log('Links to IP:', links.length);

  // Print recent API calls summary
  const unique = [...new Set(apiCalls.map((c) => c.url.split('?')[0]))];
  console.log('API endpoints hit:', unique.slice(0, 20).join('\n'));

  // Look for bearer token in localStorage/sessionStorage
  const storage = await page.evaluate(() => ({
    keys: Object.keys(localStorage),
    tokenKey: Object.keys(localStorage).find((k) => /token|auth|hcloud/i.test(k)),
    sample: Object.fromEntries(
      Object.keys(localStorage).slice(0, 10).map((k) => [k, localStorage.getItem(k)?.slice(0, 80)])
    ),
  }));
  console.log('STORAGE_KEYS:', storage.keys.join(', '));
  if (storage.tokenKey) console.log('TOKEN_KEY:', storage.tokenKey);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
