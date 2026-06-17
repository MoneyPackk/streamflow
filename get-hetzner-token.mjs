import { chromium } from 'playwright';

const CHROME_PATH = 'C:\\Users\\blazi\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: false,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  console.log('\n=== Step 1: Log into Hetzner ===');
  console.log('Browser will open to https://console.hetzner.com');
  console.log('Log in with your Hetzner credentials.');
  console.log('Waiting up to 5 minutes for login...\n');

  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle', timeout: 60000 });

  // Wait for URL to change from login to projects page
  await page.waitForFunction(() => {
    return window.location.href.includes('/projects');
  }, { timeout: 300000 });

  console.log('Logged in! Projects page loaded.\n');

  console.log('=== Step 2: Create API Token ===');
  console.log('Navigating to API Tokens page...\n');
  await page.goto('https://console.hetzner.com/security/tokens', { waitUntil: 'networkidle', timeout: 30000 });

  // Look for and click "Create API Token" button
  const createBtn = page.locator('button, a', { hasText: /create.*token|generate.*token|new.*token/i }).first();
  if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await createBtn.click();
    console.log('Clicked Create API Token button.\n');

    // Fill token name
    const nameInput = page.locator('input[name="name"], input[placeholder*="token"], input[id*="name"]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill('streamflow-deploy');
    }

    // Select Read & Write permissions
    const rwOption = page.locator('label, span, div', { hasText: /read.*write/i }).first();
    if (await rwOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await rwOption.click();
    }

    // Click Create/Generate button
    const generateBtn = page.locator('button', { hasText: /create|generate/i }).first();
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(3000);
    }
  }

  console.log('=== TOKEN CREATED ===');
  console.log('The API token is shown once on screen.');
  console.log('Copy it now - it will not be shown again.\n');

  // Keep browser open for 2 minutes to allow copying
  console.log('Browser will stay open for 120 seconds for you to copy the token...');
  console.log('After copying, come back here and paste the token.\n');

  // Wait and show the page content for token
  await page.waitForTimeout(120000);

  console.log('Done. Closing browser.\n');

  // Try to get the token from the page if it's still visible
  try {
    const tokenField = page.locator('input[type="text"], code, pre, .token-value').first();
    const visible = await tokenField.isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      const token = await tokenField.inputValue().catch(() => tokenField.textContent());
      if (token) {
        console.log('TOKEN FOUND:', token);
      }
    }
  } catch {}

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
