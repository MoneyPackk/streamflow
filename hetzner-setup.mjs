import { chromium } from 'playwright';

const EMAIL = 'blazingscrubs@gmail.com';
const NAME = 'Money Pack';

async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'msedge' });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  console.log('1. Opening Hetzner Cloud...');
  await page.goto('https://console.hetzner.com', { waitUntil: 'networkidle' });

  // Click signup/register
  const signupBtn = page.locator('a[href*="signup"], a[href*="register"], text=Sign up, text=Register').first();
  if (await signupBtn.isVisible()) await signupBtn.click();
  
  console.log('2. Waiting for you to complete signup...');
  console.log(`   Email: ${EMAIL}`);
  console.log(`   Name: ${NAME}`);
  console.log('   Fill in the form and verify email when prompted.');
  console.log('   The browser is open - I will wait for you.\n');

  // Wait for user to reach the Hetzner console (dashboard indicates logged in)
  await page.waitForURL('**/console/**', { timeout: 300000 });
  console.log('3. Logged in! Navigating to API tokens...');
  
  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle' });
  
  // Create default project if needed
  const newProjectBtn = page.locator('text=New Project, text=Create Project').first();
  if (await newProjectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newProjectBtn.click();
    await page.fill('input[name="name"], input[placeholder*="project"]', 'streamflow');
    await page.locator('button:has-text("Create"), button:has-text("Continue")').first().click();
    await page.waitForTimeout(2000);
  }

  console.log('4. Creating API token...');
  await page.goto('https://console.hetzner.com/projects', { waitUntil: 'networkidle' });
  
  // Click into the project
  const projectLink = page.locator('a:has-text("streamflow"), a:has-text("default")').first();
  await projectLink.click();
  await page.waitForTimeout(3000);

  // Navigate to Security > API Tokens
  await page.goto('https://console.hetzner.com/projects/streamflow/security/tokens', { waitUntil: 'networkidle' }).catch(async () => {
    // Fallback: navigate via sidebar
    await page.locator('text=Security, text=API').first().click().catch(() => {});
    await page.waitForTimeout(2000);
  });

  // Create token
  const createTokenBtn = page.locator('text=Create Token, text=Generate Token, text=Add Token').first();
  if (await createTokenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createTokenBtn.click();
    await page.fill('input[name="name"], input[placeholder*="token"], input[placeholder*="Token"]', 'streamflow-deploy');
    // Select read & write
    const rwOption = page.locator('text=Read & Write, label:has-text("Write")').first();
    if (await rwOption.isVisible({ timeout: 2000 }).catch(() => false)) await rwOption.click();
    await page.locator('button:has-text("Create"), button:has-text("Generate")').first().click();
    await page.waitForTimeout(2000);

    console.log('5. TOKEN CREATED - Copy it and paste it here:');
    console.log('');
    console.log('   The token will be shown once on screen. Copy it now.');
    console.log('');
    await page.waitForTimeout(60000); // Give time to copy
  } else {
    console.log('4. Navigate to Security > API Tokens manually in the browser.');
    console.log('   Create a token named "streamflow-deploy" with Read & Write permissions.');
    console.log('   Paste the token here when you have it.');
  }

  console.log('6. Done. Close the browser when ready.');
  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch(console.error);
