import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false, channel: 'msedge' });
const page = await browser.newPage();
await page.goto('https://console.hetzner.com', { waitUntil: 'networkidle' });
console.log('Browser open. Navigate to Security > API Tokens in the left sidebar after logging in.');
console.log('Create a token with Read & Write and paste it back to the AI.');
await page.waitForTimeout(120000);
await browser.close();
