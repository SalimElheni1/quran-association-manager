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

const NEW_PASSWORD = 'Qalam#Sousse-2026';

/**
 * Accounts made before the password policy may still use the legacy default '123456'. The app no
 * longer lets anyone set it, so the test stores that hash directly in the main process.
 */
async function setStoredPassword(electronApp, username, plain) {
  await electronApp.evaluate(
    async ({ app }, { user, password }) => {
      // Same module cache as the app, so this is the app's open database.
      const { createRequire } = process.getBuiltinModule('module');
      const load = createRequire(`${app.getAppPath()}/src/main/index.js`);
      const db = load('../db/db');
      const bcrypt = load('bcryptjs');
      const hash = await bcrypt.hash(password, 10);
      await db.runQuery('UPDATE users SET password = ? WHERE username = ?', [hash, user]);
    },
    { user: username, password: plain },
  );
}

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

  test('a weak new password is refused with the rule, and the old one still works', async ({
    authedPage: page,
  }) => {
    await changePassword(page, { current: SUPERADMIN.password, next: 'changed-pass-456' });
    await expectToast(page, 'error', 'يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم ورمز.');

    await logout(page);
    await expectLoginAccepted(page, SUPERADMIN);
  });

  test('a common password is refused by the main process', async ({ authedPage: page }) => {
    await changePassword(page, { current: SUPERADMIN.password, next: 'Password123!' });
    await expectToast(page, 'error', 'كلمة المرور شائعة جداً، اختر كلمة مرور أخرى.');

    await logout(page);
    await expectLoginRejected(page, { username: SUPERADMIN.username, password: 'Password123!' });
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

  test('login with the legacy default password requires a new one', async ({
    page,
    electronApp,
  }) => {
    await setupSuperadmin(page, { username: LEGACY.username, password: SUPERADMIN.password });
    await setStoredPassword(electronApp, LEGACY.username, LEGACY.password);

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

test.describe('profile details', () => {
  test('saving the profile with a birth date keeps the date', async ({ authedPage: page }) => {
    await navigate(page, 'ملفي الشخصي');
    await page.locator('input[name="date_of_birth"]').fill('1988-04-12');
    await page.locator('input[name="national_id"]').fill('52345678');
    await page.locator('input[name="phone_number"]').fill('94234567');
    await page.getByRole('button', { name: 'حفظ معلوماتي' }).click();
    await expectToast(page, 'success', 'تم تحديث الملف الشخصي بنجاح.');

    // Read back from the database on a fresh visit
    await navigate(page, 'الرئيسية');
    await navigate(page, 'ملفي الشخصي');
    await expect(page.locator('input[name="date_of_birth"]')).toHaveValue('1988-04-12');
    await expect(page.locator('input[name="national_id"]')).toHaveValue('52345678');
  });
});
