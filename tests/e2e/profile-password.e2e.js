const {
  test,
  expect,
  navigate,
  expectToast,
  logout,
  login,
  dismissOnboarding,
  setupSuperadmin,
  SUPERADMIN,
} = require('./fixtures');

const NEW_PASSWORD = 'changed-pass-456';

async function changePassword(page, { current, next, confirm = next }) {
  await navigate(page, 'ملفي الشخصي');
  await page.locator('input[name="current_password"]').fill(current);
  await page.locator('input[name="new_password"]').fill(next);
  await page.locator('input[name="confirm_new_password"]').fill(confirm);
  await page.getByRole('button', { name: 'تغيير كلمة المرور' }).click();
}

async function expectLoginRejected(page, credentials) {
  await login(page, credentials);
  await expect(page.locator('.alert-danger')).toContainText(
    'اسم المستخدم أو كلمة المرور غير صحيحة',
  );
  await expect(page.locator('.topbar')).toHaveCount(0);
}

async function expectLoginAccepted(page, credentials) {
  await login(page, credentials);
  await dismissOnboarding(page);
  await expect(page.locator('.topbar')).toBeVisible();
}

test.describe('profile password change', () => {
  test('new password replaces the old one', async ({ authedPage: page }) => {
    await changePassword(page, { current: SUPERADMIN.password, next: NEW_PASSWORD });
    await expectToast(page, 'success', 'تم تحديث كلمة المرور بنجاح.');
    await expect(page.locator('input[name="new_password"]')).toHaveValue('');

    await logout(page);
    await expectLoginRejected(page, SUPERADMIN);
    await expectLoginAccepted(page, { username: SUPERADMIN.username, password: NEW_PASSWORD });
  });

  test('a wrong current password is rejected and nothing changes', async ({ authedPage: page }) => {
    await changePassword(page, { current: 'not-my-password', next: NEW_PASSWORD });
    await expectToast(page, 'error', 'كلمة المرور الحالية غير صحيحة');

    await logout(page);
    await expectLoginAccepted(page, SUPERADMIN);
  });

  test('a mismatched confirmation is rejected and nothing changes', async ({
    authedPage: page,
  }) => {
    await changePassword(page, {
      current: SUPERADMIN.password,
      next: NEW_PASSWORD,
      confirm: 'something-else-789',
    });
    await expect(page.locator('.Toastify__toast--error')).toBeVisible();
    await expect(page.locator('.Toastify__toast--success')).toHaveCount(0);

    await logout(page);
    await expectLoginAccepted(page, SUPERADMIN);
  });
});

test.describe('forced password change', () => {
  // Accounts still on the legacy default password '123456' must change it at login.
  const LEGACY = { username: 'legacyadmin', password: '123456' };

  test('login with the legacy default password requires a new one', async ({ page }) => {
    await setupSuperadmin(page, LEGACY);

    await login(page, LEGACY);
    await expect(page.getByRole('heading', { name: 'تغيير كلمة المرور' })).toBeVisible();
    await expect(page.locator('.topbar')).toHaveCount(0);

    await page.locator('input[name="change-new-password"]').fill(NEW_PASSWORD);
    await page.locator('input[name="change-confirm-password"]').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
    await dismissOnboarding(page);
    await expect(page.locator('.topbar')).toBeVisible();

    await logout(page);
    await expectLoginRejected(page, LEGACY);
    await expectLoginAccepted(page, { username: LEGACY.username, password: NEW_PASSWORD });
  });
});
