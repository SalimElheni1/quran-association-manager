const {
  test,
  expect,
  navigate,
  logout,
  login,
  dismissOnboarding,
  createUser,
  sidebarLink,
} = require('./fixtures');

const FINANCE_USER = {
  username: 'financeuser',
  password: 'finance-pass-1',
  firstName: 'سامي',
  lastName: 'المالي',
  nationalId: '12345678',
  phone: '98765432',
};

const ALL_MODULE_LINKS = [
  'شؤون الطلاب',
  'شؤون المعلمين',
  'الفصول الدراسية',
  'الحضور والغياب',
  'الشؤون المالية',
  'إدارة المستخدمين',
  'الإعدادات',
];

test.describe('users and roles', () => {
  test('superadmin creates a FinanceManager user', async ({ authedPage: page }) => {
    await createUser(page, FINANCE_USER, 'FinanceManager');

    const row = page.locator('tbody tr', { hasText: FINANCE_USER.username });
    await expect(row).toBeVisible();
    await expect(row).toContainText('مسؤول مالي');
    await expect(row).not.toContainText('الهيئة المديرة');
  });

  test('superadmin sees every module in the sidebar', async ({ authedPage: page }) => {
    for (const label of ALL_MODULE_LINKS) {
      await expect(sidebarLink(page, label)).toBeVisible();
    }
  });

  test('FinanceManager only gets financials and read-only students', async ({
    authedPage: page,
  }) => {
    await createUser(page, FINANCE_USER, 'FinanceManager');
    await logout(page);
    await login(page, FINANCE_USER);
    await dismissOnboarding(page);
    await expect(page.locator('.topbar')).toBeVisible();

    for (const label of ['الرئيسية', 'شؤون الطلاب', 'الشؤون المالية', 'ملفي الشخصي']) {
      await expect(sidebarLink(page, label)).toBeVisible();
    }
    for (const label of [
      'شؤون المعلمين',
      'الفصول الدراسية',
      'الحضور والغياب',
      'إدارة المستخدمين',
      'الإعدادات',
    ]) {
      await expect(sidebarLink(page, label)).toHaveCount(0);
    }

    await navigate(page, 'الشؤون المالية');
    await page.getByRole('tab', { name: 'المداخيل', exact: true }).click();
    await expect(
      page.locator('.tab-pane.active').getByRole('button', { name: 'إضافة مدخول' }),
    ).toBeVisible();

    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة طالب' })).toHaveCount(0);
  });

  test('FinanceManager is blocked from routes outside their role', async ({ authedPage: page }) => {
    await createUser(page, FINANCE_USER, 'FinanceManager');
    await logout(page);
    await login(page, FINANCE_USER);
    await dismissOnboarding(page);

    for (const route of ['/users', '/settings', '/teachers']) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route);
      await expect(page.getByText('غير مصرح لك بالوصول')).toBeVisible();
    }
  });

  test('a user cannot log in with a wrong password', async ({ authedPage: page }) => {
    await createUser(page, FINANCE_USER, 'FinanceManager');
    await logout(page);
    await login(page, { username: FINANCE_USER.username, password: 'wrong-password' });

    await expect(page.locator('.alert-danger')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await expect(page.locator('.topbar')).toHaveCount(0);
  });
});
