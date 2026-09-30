const fs = require('fs');
const { test, expect, navigate, expectToast, setAppDate, logout, login } = require('./fixtures');

const NO_BACKUP_YET =
  'لم يتم العثور على نسخة احتياطية سابقة. يُرجى إنشاء واحدة الآن لحماية بياناتك.';

function reminder(page) {
  return page.locator('.dashboard-page .alert-warning');
}

function activePane(page) {
  return page.locator('.tab-pane.active');
}

/** Picks `backupDir` as the backup folder and backs up now (on the open backup tab). */
async function backUpNow(page, electronApp, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  await electronApp.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, backupDir);
  await activePane(page).getByRole('button', { name: 'اختيار...' }).click();
  await expect(activePane(page).locator('input[readonly]')).toHaveValue(backupDir);
  await activePane(page).getByRole('button', { name: 'نسخ احتياطي الآن' }).click();
  await expectToast(page, 'success', /تم إنشاء النسخة الاحتياطية بنجاح/);
}

function daysFromNow(days) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

test.describe('backup reminder', () => {
  test('shows until a first backup is made, and its button opens the backup tab', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    await expect(reminder(page)).toContainText(NO_BACKUP_YET);

    await reminder(page).getByRole('button', { name: 'الانتقال إلى صفحة النسخ الاحتياطي' }).click();
    await expect(page.getByRole('tab', { name: 'النسخ الاحتياطي', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await backUpNow(page, electronApp, testInfo.outputPath('backups'));

    await navigate(page, 'الرئيسية');
    await expect(page.getByRole('heading', { name: 'لوحة التحكم الرئيسية' })).toBeVisible();
    await expect(reminder(page)).toHaveCount(0);
  });

  test('comes back once the last backup is older than a week', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    await reminder(page).getByRole('button', { name: 'الانتقال إلى صفحة النسخ الاحتياطي' }).click();
    await backUpNow(page, electronApp, testInfo.outputPath('backups'));

    // Six days later: still within the 7-day reminder setting.
    await setAppDate(electronApp, page, daysFromNow(6));
    await logout(page);
    await login(page);
    await expect(page.getByRole('heading', { name: 'لوحة التحكم الرئيسية' })).toBeVisible();
    await expect(reminder(page)).toHaveCount(0);

    // Nine days later: the reminder counts the days since the backup.
    await setAppDate(electronApp, page, daysFromNow(9));
    await logout(page);
    await login(page);
    await expect(reminder(page)).toContainText(
      'لم تقم بإنشاء نسخة احتياطية لقاعدة البيانات منذ أكثر من 9 أيام.',
    );
  });
});
