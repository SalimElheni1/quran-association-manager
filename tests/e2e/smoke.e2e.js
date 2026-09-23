const { test, expect, setupSuperadmin, login } = require('./fixtures');

test.describe('smoke', () => {
  test('first run: create superadmin, log in, reach the dashboard', async ({ page }) => {
    await setupSuperadmin(page);
    await login(page);

    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('main.content-area')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#/');
  });
});
