const fs = require('fs');
const {
  test,
  expect,
  launchApp,
  setupSuperadmin,
  login,
  dismissOnboarding,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  SUPERADMIN,
} = require('./fixtures');

const TRANSFER_KEY = 'branch-transfer-key-2026';

function activePane(page) {
  return page.locator('.tab-pane.active');
}

// Clicking an already-selected Bootstrap tab hangs on Playwright's stability
// check; only click unselected tabs.
async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function addStudent(page, name) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(d.toISOString().slice(0, 10));
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function rotateKey(page, password) {
  await navigate(page, 'الإعدادات');
  await openTab(page, 'النسخ الاحتياطي');
  await activePane(page).getByRole('button', { name: 'تغيير مفتاح التشفير' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد تغيير مفتاح التشفير');
  await modal(page).locator('input[placeholder="أدخل كلمة المرور الخاصة بك"]').fill(password);
  await modal(page).getByRole('button', { name: 'تأكيد' }).click();
  await expectNoModal(page);
}

async function saveTransferKey(page) {
  await navigate(page, 'الإعدادات');
  await openTab(page, 'النسخ الاحتياطي');
  await activePane(page).locator('input[name="association_transfer_key"]').fill(TRANSFER_KEY);
  await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
  await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
}

test.describe('database key rotation (SEC-017)', () => {
  test('is refused while no transfer key is saved', async ({ authedPage: page }) => {
    await rotateKey(page, SUPERADMIN.password);

    await expectToast(page, 'error', 'يجب تعيين رمز النقل الموحد للمؤسسة');
    await expect(page.locator('.topbar')).toBeVisible();
  });

  // Manages its own launches: the rotated key must also open the database after a restart.
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured fixtures arg
  test('re-encrypts the data, logs everyone out, and the app reopens it', async ({}) => {
    const student = 'سلمى بنت الطاهر الجبالي';
    const { app, userDataDir } = await launchApp();
    let app2;
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      await setupSuperadmin(page);
      await login(page);
      await dismissOnboarding(page);
      await addStudent(page, student);
      await saveTransferKey(page);
      const keyFile = fs
        .readdirSync(userDataDir)
        .find((name) => name.startsWith('db-secure-config'));
      const keyBefore = fs.readFileSync(`${userDataDir}/${keyFile}`, 'utf8');

      await rotateKey(page, SUPERADMIN.password);

      // Every session ends: the window is back on the login form.
      await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
      expect(fs.readFileSync(`${userDataDir}/${keyFile}`, 'utf8')).not.toBe(keyBefore);
      await login(page);
      await navigate(page, 'شؤون الطلاب');
      await expect(page.locator('tbody tr', { hasText: student })).toBeVisible();
      await app.close();

      ({ app: app2 } = await launchApp({ userDataDir }));
      const page2 = await app2.firstWindow();
      await page2.waitForLoadState('domcontentloaded');
      await login(page2);
      await dismissOnboarding(page2);
      await navigate(page2, 'شؤون الطلاب');
      await expect(page2.locator('tbody tr', { hasText: student })).toBeVisible();
    } finally {
      await app.close().catch(() => {});
      if (app2) await app2.close().catch(() => {});
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
