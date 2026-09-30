const fs = require('fs');
const path = require('path');
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

/** Points the next open dialog at `target`, and records relaunches instead of doing them. */
async function stubDialogAndRelaunch(electronApp, target) {
  await electronApp.evaluate(({ dialog, app }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    global.__e2eRelaunches = 0;
    app.relaunch = () => {
      global.__e2eRelaunches += 1;
    };
    app.exit = () => {};
  }, target);
}

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

async function addStudent(page, name) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(yearsAgo(10));
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

/** Saves the transfer key and writes one backup into `backupDir`; returns the backup's path. */
async function backUp(page, electronApp, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  await navigate(page, 'الإعدادات');
  await openTab(page, 'النسخ الاحتياطي');
  await activePane(page).locator('input[name="association_transfer_key"]').fill(TRANSFER_KEY);
  await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
  await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);

  await electronApp.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, backupDir);
  await activePane(page).getByRole('button', { name: 'اختيار...' }).click();
  await expect(activePane(page).locator('input[readonly]')).toHaveValue(backupDir);
  await activePane(page).getByRole('button', { name: 'نسخ احتياطي الآن' }).click();
  await expectToast(page, 'success', /تم إنشاء النسخة الاحتياطية بنجاح/);

  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.qdb'));
  expect(files).toHaveLength(1);
  return path.join(backupDir, files[0]);
}

async function startRestore(page, { password, key }) {
  await navigate(page, 'الإعدادات');
  await openTab(page, 'النسخ الاحتياطي');
  await activePane(page).getByRole('button', { name: 'استيراد قاعدة بيانات محلية' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('الخطوة الأخيرة: تأكيد الهوية');
  await modal(page).locator('input[placeholder="أدخل كلمة المرور الخاصة بك"]').fill(password);
  await modal(page)
    .locator('input[placeholder="رمز النسخة الاحتياطية (اتركه فارغاً إذا كان غير مطلوب)"]')
    .fill(key);
  await modal(page).getByRole('button', { name: 'تأكيد' }).click();
  await expectNoModal(page);
}

function studentRow(page, name) {
  return page.locator('tbody tr', { hasText: name });
}

test.describe('database restore', () => {
  test('a wrong password or a wrong transfer key is refused and the data stays', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    const kept = 'حمزة بن الطاهر العياري';
    const afterBackup = 'ريم بنت لطفي الماجري';
    await addStudent(page, kept);
    const backupPath = await backUp(page, electronApp, testInfo.outputPath('backups'));
    // Not in the backup: a restore that went through would remove it.
    await addStudent(page, afterBackup);
    await stubDialogAndRelaunch(electronApp, backupPath);

    await startRestore(page, { password: 'not-my-password', key: TRANSFER_KEY });
    await expectToast(page, 'error', 'فشل الاستبدال: كلمة المرور الحالية التي أدخلتها غير صحيحة.');

    await startRestore(page, { password: SUPERADMIN.password, key: 'another-branch-key' });
    await expectToast(page, 'error', 'فشل الاستبدال: خطأ في قراءة ملف النسخ الاحتياطي');

    expect(await electronApp.evaluate(() => global.__e2eRelaunches)).toBe(0);
    await navigate(page, 'شؤون الطلاب');
    await expect(studentRow(page, kept)).toBeVisible();
    await expect(studentRow(page, afterBackup)).toBeVisible();
  });

  // Manages its own launches: a restore only shows after the app starts again on the same data.
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured fixtures arg
  test('restoring a backup brings back its data after the relaunch', async ({}, testInfo) => {
    const inBackup = 'نادية بنت الهادي السويسي';
    const afterBackup = 'مهدي بن سمير الفرجاني';
    const { app, userDataDir } = await launchApp();
    let app2;
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      await setupSuperadmin(page);
      await login(page);
      await dismissOnboarding(page);
      await expect(page.locator('.topbar')).toBeVisible();

      await addStudent(page, inBackup);
      const backupPath = await backUp(page, app, testInfo.outputPath('backups'));
      await addStudent(page, afterBackup);
      await stubDialogAndRelaunch(app, backupPath);

      await startRestore(page, { password: SUPERADMIN.password, key: TRANSFER_KEY });
      await expectToast(page, 'success', 'تم استيراد قاعدة البيانات بنجاح!');
      await expect.poll(() => app.evaluate(() => global.__e2eRelaunches)).toBe(1);
      await app.close();

      ({ app: app2 } = await launchApp({ userDataDir }));
      const page2 = await app2.firstWindow();
      await page2.waitForLoadState('domcontentloaded');
      await login(page2);
      await dismissOnboarding(page2);
      await expect(page2.locator('.topbar')).toBeVisible();
      await navigate(page2, 'شؤون الطلاب');
      await expect(studentRow(page2, inBackup)).toBeVisible();
      await expect(studentRow(page2, afterBackup)).toHaveCount(0);
    } finally {
      await app.close().catch(() => {});
      if (app2) await app2.close().catch(() => {});
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
