const { test, expect, setupSuperadmin, login, dismissOnboarding, logout } = require('./fixtures');

test.describe('smoke', () => {
  test('first run: create superadmin, log in, reach the dashboard', async ({ page }) => {
    await setupSuperadmin(page);
    await login(page);
    await dismissOnboarding(page);

    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('main.content-area')).toBeVisible();
    await expect(page.locator('.onboarding-guide')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('#/');
  });

  test('authedPage fixture: logout returns to the login form', async ({ authedPage }) => {
    await logout(authedPage);
    await expect(authedPage.locator('#username')).toBeVisible();
  });

  test('logout in the first-run session shows the login form, not setup again', async ({
    page,
  }) => {
    test.fail(true, 'App bug: App.jsx never re-checks needsSetup after the superadmin is created');
    await setupSuperadmin(page);
    await login(page);
    await dismissOnboarding(page);
    await page.locator('button.logout-btn').click();
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible({
      timeout: 5000,
    });
  });
});
