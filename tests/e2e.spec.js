const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

test.describe('PeacocksStreams E2E', () => {

  test('home page loads with hero and content rows', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('#hero-title', { timeout: 15000 });
    const title = await page.textContent('#hero-title');
    expect(title.length).toBeGreaterThan(0);
    await page.waitForSelector('#top-ten-grid .top-ten-card', { timeout: 15000 });
    const topTenCards = await page.$$('#top-ten-grid .top-ten-card');
    expect(topTenCards.length).toBeGreaterThan(0);
    await page.waitForSelector('.content-section', { timeout: 10000 });
    const sections = await page.$$('.content-section');
    expect(sections.length).toBeGreaterThan(0);
  });

  test('search returns results', async ({ page }) => {
    await page.goto(BASE);
    const searchInput = page.locator('#search');
    await searchInput.fill('breaking bad');
    await page.waitForTimeout(500);
    const searchResults = page.locator('#search-results');
    await expect(searchResults).toBeVisible({ timeout: 10000 });
    const cards = searchResults.locator('.content-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('nav links work', async ({ page }) => {
    await page.goto(BASE);
    await page.click('text=Movies');
    await page.waitForTimeout(500);
    const hero = page.locator('#hero-title');
    await expect(hero).toBeVisible();

    await page.click('text=TV Shows');
    await page.waitForTimeout(500);
    await expect(hero).toBeVisible();
  });

  test('theme toggle cycles', async ({ page }) => {
    await page.goto(BASE);
    const html = page.locator('html');
    const initialTheme = await html.getAttribute('data-theme');
    await page.click('#theme-toggle');
    await page.waitForTimeout(300);
    const newTheme = await html.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });

  test('auth page loads', async ({ page }) => {
    await page.goto(BASE);
    await page.click('text=Sign In');
    await page.waitForSelector('#auth-title', { timeout: 5000 });
    const title = await page.textContent('#auth-title');
    expect(title).toBe('Sign In');
    await page.click('#auth-toggle');
    await page.waitForTimeout(300);
    const newTitle = await page.textContent('#auth-title');
    expect(newTitle).toBe('Register');
    const usernameField = page.locator('#auth-username');
    await expect(usernameField).toBeVisible();
  });

  test('click card opens player page', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.content-card', { timeout: 15000 });
    const card = page.locator('.content-card').first();
    await card.click();
    await page.waitForTimeout(3000);
    const player = page.locator('#page-player');
    const isActive = await player.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

  test('back button returns to browse', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.content-card', { timeout: 15000 });
    await page.locator('.content-card').first().click();
    await page.waitForTimeout(2000);
    await page.click('.back-btn');
    await page.waitForTimeout(500);
    const browse = page.locator('#page-browse');
    const isActive = await browse.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

  test('keyboard shortcut / focuses search', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1000);
    await page.keyboard.press('/');
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('search');
  });

  test('mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await page.waitForSelector('.nav-links', { timeout: 10000 });
    const navLinks = page.locator('.nav-links');
    await expect(navLinks).toBeVisible();
    await page.waitForSelector('#top-ten-grid .top-ten-card', { timeout: 15000 });
    const topTen = page.locator('#top-ten-grid');
    await expect(topTen).toBeVisible();
  });

  test('toast notification system works', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.showToast('Test notification', 'success'));
    await page.waitForSelector('.toast', { timeout: 3000 });
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveClass(/success/);
  });

  test('welcome overlay shows on first visit', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('ps_welcomed_v1'));
    await page.reload();
    const overlay = page.locator('#welcome-overlay');
    await expect(overlay).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/hide/);
  });

  test('back to top button appears on scroll', async ({ page }) => {
    await page.goto(BASE);
    const btn = page.locator('#back-to-top');
    await expect(btn).not.toHaveClass(/visible/);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);
    await expect(btn).toHaveClass(/visible/);
  });

  test('footer renders', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.site-footer', { timeout: 10000 });
    const footer = page.locator('.site-footer');
    await expect(footer).toBeVisible();
    const name = footer.locator('.footer-name');
    await expect(name).toHaveText('PeacocksStreams');
  });

  test('no ads or trackers loaded', async ({ page }) => {
    const adRequests = [];
    page.on('request', req => {
      const url = req.url();
      const adDomains = ['doubleclick', 'googlesyndication', 'adnxs', 'criteo', 'taboola', 'outbrain', 'adsense', 'adsterra', 'popads'];
      if (adDomains.some(d => url.includes(d))) {
        adRequests.push(url);
      }
    });
    await page.goto(BASE);
    await page.waitForTimeout(3000);
    expect(adRequests.length).toBe(0);
  });

  test('search filters modal works', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#search').fill('test');
    await page.waitForTimeout(500);
    const modal = page.locator('#filters-modal');
    await page.click('.search-filters-btn');
    await expect(modal).toBeVisible({ timeout: 3000 });
    await page.click('.filters-close');
    await expect(modal).not.toBeVisible();
  });

  test('keyboard shortcut Escape closes modals', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#search').fill('test');
    await page.waitForTimeout(500);
    await page.click('.search-filters-btn');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    const modal = page.locator('#filters-modal');
    await expect(modal).not.toBeVisible();
  });

  test('peacock icon and branding visible', async ({ page }) => {
    await page.goto(BASE);
    const logo = page.locator('.logo-text');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveText('PeacocksStreams');
    const navPeacock = page.locator('.peacock-icon');
    await expect(navPeacock).toBeVisible();
  });

  test('ad-free badge visible in nav', async ({ page }) => {
    await page.goto(BASE);
    const badge = page.locator('.ad-free-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Ad-Free');
  });

});
