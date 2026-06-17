import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false, channel: 'msedge' });
const page = await browser.newPage();

// Go to Hetzner login
await page.goto('https://console.hetzner.com/login', { waitUntil: 'networkidle' });
console.log('Log in to Hetzner in the browser window that opened.');
console.log('I will wait and then navigate to API Tokens for you.');

// Wait for login by detecting URL change
await page.waitForURL('**/projects**', { timeout: 300000 });
console.log('Logged in. Navigating to API Tokens...');

// Try common API token URL patterns
try {
  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Click first project
  const projectLinks = page.locator('a[href*="/projects/"]');
  const count = await projectLinks.count();
  if (count > 0) {
    await projectLinks.first().click();
    await page.waitForTimeout(3000);
  }
  
  // Try API tokens URL
  const currentUrl = page.url();
  const apiUrl = currentUrl.endsWith('/') ? currentUrl + 'security/tokens' : currentUrl + '/security/tokens';
  await page.goto(apiUrl, { waitUntil: 'networkidle' }).catch(() => {});
  
  console.log('Browser is now on the API Tokens page (or as close as I could get).');
  console.log('Look for "Create Token" or "Generate Token" button.');
  console.log('Create a token named "streamflow-deploy" with Read & Write.');
  console.log('Copy the token and paste it here.');
} catch (e) {
  console.log('Navigated to Hetzner. Find Security > API Tokens in the sidebar.');
}

await page.waitForTimeout(120000);
await browser.close();
