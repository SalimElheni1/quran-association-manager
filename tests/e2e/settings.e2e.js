const {
  test,
  expect,
  navigate,
  expectToast,
  logout,
  login,
  dismissOnboarding,
  SUPERADMIN,
} = require('./fixtures');

test.describe('الإعدادات - settings', () => {
  test('save association fields (local branch name + president name) persists after navigation', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await navigate(page, 'الإعدادات');

    const localBranchNameInput = page.locator('input[name="local_branch_name"]');
    const presidentNameInput = page.locator('input[name="president_full_name"]');
    const saveButton = page.getByRole('button', { name: 'حفظ جميع التغييرات' });

    const uniqueBranch = `فرع تجريبي ${Date.now()}`;
    const uniquePresident = `رئيس تجريبي ${Date.now()}`;

    await localBranchNameInput.fill(uniqueBranch);
    await presidentNameInput.fill(uniquePresident);
    await saveButton.click();

    await expectToast(page, 'success', 'تم تحديث الإعدادات بنجاح.');

    await navigate(page, 'الرئيسية');
    await navigate(page, 'الإعدادات');

    await expect(localBranchNameInput).toHaveValue(uniqueBranch);
    await expect(presidentNameInput).toHaveValue(uniquePresident);
  });

  test('sidebar branch-name updates after logout/login cycle', async ({ authedPage }) => {
    const page = authedPage;
    await navigate(page, 'الإعدادات');

    const localBranchNameInput = page.locator('input[name="local_branch_name"]');
    const saveButton = page.getByRole('button', { name: 'حفظ جميع التغييرات' });

    const uniqueBranch = `فرع محدث ${Date.now()}`;
    await localBranchNameInput.fill(uniqueBranch);
    await saveButton.click();
    await expectToast(page, 'success', 'تم تحديث الإعدادات بنجاح.');

    await logout(page);
    await login(page, SUPERADMIN);
    await dismissOnboarding(page);

    await expect(page.locator('.sidebar .branch-name')).toHaveText(uniqueBranch);
  });

  test('logout shows login form and hides sidebar/topbar; relogin works', async ({
    authedPage,
  }) => {
    const page = authedPage;

    await logout(page);

    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();

    await login(page, SUPERADMIN);
    await dismissOnboarding(page);

    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toHaveCount(0);
  });
});
