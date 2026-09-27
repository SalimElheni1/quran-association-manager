const {
  test,
  expect,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  confirmDialog,
  logout,
  login,
  dismissOnboarding,
  createUser,
  sidebarLink,
  SUPERADMIN,
} = require('./fixtures');

const ADMIN_USER = {
  username: 'boardmember',
  password: 'board-pass-1',
  firstName: 'هالة',
  lastName: 'الإدارية',
  nationalId: '22345678',
  phone: '91234567',
};

const SUPERVISOR_USER = {
  username: 'supervisor',
  password: 'super-pass-1',
  firstName: 'نزار',
  lastName: 'المشرف',
  nationalId: '32345678',
  phone: '92234567',
};

async function loginAs(page, user) {
  await logout(page);
  await login(page, user);
  await dismissOnboarding(page);
  await expect(page.locator('.topbar')).toBeVisible();
}

function userRow(page, username) {
  return page.locator('tbody tr', { hasText: username });
}

test.describe('user administration', () => {
  test('editing a user updates the list', async ({ authedPage: page }) => {
    await createUser(page, ADMIN_USER, 'Administrator');

    await userRow(page, ADMIN_USER.username).getByRole('button', { name: 'تعديل' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('تعديل بيانات المستخدم');
    await expect(modal(page).locator('input[name="username"]')).toBeDisabled();
    await modal(page).locator('input[name="first_name"]').fill('سلمى');
    await modal(page).getByRole('button', { name: 'حفظ' }).click();

    await expectToast(page, 'success', 'تم تحديث بيانات المستخدم بنجاح!');
    await expectNoModal(page);
    await expect(userRow(page, ADMIN_USER.username)).toContainText('سلمى');
    await expect(userRow(page, ADMIN_USER.username)).not.toContainText(ADMIN_USER.firstName);
  });

  test('a deleted user is removed and can no longer log in', async ({ authedPage: page }) => {
    await createUser(page, ADMIN_USER, 'Administrator');

    await userRow(page, ADMIN_USER.username).getByRole('button', { name: 'حذف' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد الحذف');
    await confirmDialog(page, 'نعم، قم بالحذف');
    await expectToast(page, 'success', 'تم حذف المستخدم بنجاح.');
    await expect(userRow(page, ADMIN_USER.username)).toHaveCount(0);

    await logout(page);
    await login(page, ADMIN_USER);
    await expect(page.locator('.alert-danger')).toBeVisible();
    await expect(page.locator('.topbar')).toHaveCount(0);
  });

  test('Administrator manages people and classes but not finances or settings', async ({
    authedPage: page,
  }) => {
    await createUser(page, ADMIN_USER, 'Administrator');
    await loginAs(page, ADMIN_USER);

    for (const label of [
      'شؤون الطلاب',
      'شؤون المعلمين',
      'الفصول الدراسية',
      'الحضور والغياب',
      'إدارة المستخدمين',
    ]) {
      await expect(sidebarLink(page, label)).toBeVisible();
    }
    for (const label of ['الشؤون المالية', 'الإعدادات']) {
      await expect(sidebarLink(page, label)).toHaveCount(0);
    }

    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByRole('button', { name: 'إضافة طالب' })).toBeVisible();

    // Users page is view-only for administrators.
    await navigate(page, 'إدارة المستخدمين');
    await expect(userRow(page, ADMIN_USER.username)).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة مستخدم جديد' })).toHaveCount(0);
  });

  test('SessionSupervisor only reaches students, classes and attendance, read-only', async ({
    authedPage: page,
  }) => {
    await createUser(page, SUPERVISOR_USER, 'SessionSupervisor');
    await loginAs(page, SUPERVISOR_USER);

    for (const label of ['شؤون الطلاب', 'الفصول الدراسية', 'الحضور والغياب']) {
      await expect(sidebarLink(page, label)).toBeVisible();
    }
    for (const label of ['شؤون المعلمين', 'الشؤون المالية', 'إدارة المستخدمين', 'الإعدادات']) {
      await expect(sidebarLink(page, label)).toHaveCount(0);
    }

    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة طالب' })).toHaveCount(0);

    await navigate(page, 'الفصول الدراسية');
    await expect(page.getByPlaceholder('البحث باسم الفصل...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة فصل' })).toHaveCount(0);

    await navigate(page, 'الحضور والغياب');
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور والغياب' })).toBeVisible();
  });
});

test.describe('login lockout', () => {
  test('five failed attempts lock login, even with the right password', async ({
    authedPage: page,
  }) => {
    await logout(page);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(page, { username: SUPERADMIN.username, password: `wrong-${attempt}` });
      await expect(page.locator('.alert-danger')).toBeVisible();
    }

    await login(page, SUPERADMIN);
    await expect(page.locator('.alert-danger')).toContainText('تم قفل تسجيل الدخول مؤقتاً');
    await expect(page.locator('.topbar')).toHaveCount(0);
  });

  test('a successful login resets the failure count', async ({ authedPage: page }) => {
    await logout(page);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await login(page, { username: SUPERADMIN.username, password: `wrong-${attempt}` });
      await expect(page.locator('.alert-danger')).toBeVisible();
    }
    await login(page, SUPERADMIN);
    await expect(page.locator('.topbar')).toBeVisible();

    await logout(page);
    await login(page, { username: SUPERADMIN.username, password: 'wrong-again' });
    await expect(page.locator('.alert-danger')).not.toContainText('تم قفل تسجيل الدخول');
    await login(page, SUPERADMIN);
    await expect(page.locator('.topbar')).toBeVisible();
  });
});
