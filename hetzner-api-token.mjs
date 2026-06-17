import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'msedge' });
  const page = await browser.newPage();

  console.log('Opening Hetzner console...');
  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle', timeout: 60000 });
  
  console.log('\n--- Log in to Hetzner in the browser ---');
  console.log('Once logged in, the script will guide you through creating an API token.\n');

  // Wait for user to log in
  await page.waitForURL('**/projects/**', { timeout: 300000 });
  console.log('Logged in!');

  // Navigate to API tokens
  await page.goto('https://console.hetzner.com/security/tokens', { waitUntil: 'networkidle', timeout: 30000 });
  
  console.log('Click "Create API Token" and create a token named "streamflow-deploy"');
  console.log('with Read & Write permissions.');
  console.log('Copy the token and paste it here when prompted.\n');

  // Wait for user to create and paste the token
  console.log('Waiting for you to create the token in the browser...');
  await page.waitForTimeout(120000);

  await browser.close();
}

main().catch(console.error);
