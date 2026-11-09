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
  password: 'Sami#Ledger-2026',
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

  test('FinanceManager gets finances and attendance, and reads students, teachers and classes', async ({
    authedPage: page,
  }) => {
    await createUser(page, FINANCE_USER, 'FinanceManager');
    await logout(page);
    await login(page, FINANCE_USER);
    await dismissOnboarding(page);
    await expect(page.locator('.topbar')).toBeVisible();

    for (const label of [
      'الرئيسية',
      'شؤون الطلاب',
      'شؤون المعلمين',
      'الفصول الدراسية',
      'الحضور والغياب',
      'الشؤون المالية',
      'ملفي الشخصي',
    ]) {
      await expect(sidebarLink(page, label)).toBeVisible();
    }
    for (const label of ['إدارة المستخدمين', 'الإعدادات']) {
      await expect(sidebarLink(page, label)).toHaveCount(0);
    }

    await navigate(page, 'الشؤون المالية');
    await page.getByRole('tab', { name: 'المداخيل', exact: true }).click();
    await expect(
      page.locator('.tab-pane.active').getByRole('button', { name: 'إضافة مدخول' }),
    ).toBeVisible();
    // The inventory is read-only for them: the main process lets only Superadmin/Administrator
    // change items.
    await page.getByRole('tab', { name: 'الجرد', exact: true }).click();
    await expect(
      page.locator('.tab-pane.active').getByRole('heading', { name: 'الجرد' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة صنف جديد' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'إضافة تبرع عيني' })).toHaveCount(0);

    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة طالب' })).toHaveCount(0);

    await navigate(page, 'شؤون المعلمين');
    await expect(page.getByRole('heading', { name: 'شؤون المعلمين' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة معلم' })).toHaveCount(0);

    await navigate(page, 'الفصول الدراسية');
    await expect(page.getByPlaceholder('البحث باسم الفصل...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة فصل' })).toHaveCount(0);

    await navigate(page, 'الحضور والغياب');
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور والغياب' })).toBeVisible();
  });

  test('FinanceManager is blocked from routes outside their role', async ({ authedPage: page }) => {
    await createUser(page, FINANCE_USER, 'FinanceManager');
    await logout(page);
    await login(page, FINANCE_USER);
    await dismissOnboarding(page);

    for (const route of ['/users', '/settings']) {
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
