/**
 * README screenshots: opens a copy of the data left by the real-world scenario (123 students,
 * teachers, classes, attendance and a term of finances) and captures the main pages into
 * docs/screenshots/. Run it with `npm run docs:screenshots` after
 * `npm run test:e2e:realworld` (under xvfb, so no window pops up).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, launchApp, login, dismissOnboarding, navigate } = require('../fixtures');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'e2e-artifacts', 'realworld', '02-continue', 'app-data');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const ADMIN = { username: 'e2eadmin', password: 'Zitouna#Test-2026' };
const SIZE = { width: 1440, height: 900 };

const activePane = (page) => page.locator('.tab-pane.active');

async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
}

test('README screenshots from the real-world data', async () => {
  test.setTimeout(5 * 60_000);
  test.skip(!fs.existsSync(DATA), `No real-world data at ${DATA}; run npm run test:e2e:realworld`);

  // Work on a copy so the preserved artifacts never change.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbm-screenshots-'));
  fs.cpSync(DATA, userDataDir, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const { app } = await launchApp({ userDataDir });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await app.evaluate(({ BrowserWindow }, { width, height }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.unmaximize();
      win.setContentSize(width, height);
    }, SIZE);
    // Toasts would cover parts of the pages.
    await page.addStyleTag({ content: '.Toastify { display: none !important; }' });

    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await shoot(page, 'login');

    await login(page, ADMIN);
    await dismissOnboarding(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.chart-card').first()).toBeVisible();
    await expect(page.locator('.chart-state--loading')).toHaveCount(0);
    await shoot(page, 'dashboard');

    await navigate(page, 'شؤون الطلاب');
    await expect(page.locator('tbody tr').nth(5)).toBeVisible();
    await shoot(page, 'students');

    await navigate(page, 'شؤون المعلمين');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await shoot(page, 'teachers');

    await navigate(page, 'الفصول الدراسية');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await shoot(page, 'classes');

    await navigate(page, 'الحضور والغياب');
    // The first class, with its student list for today.
    await page.locator('select').first().selectOption({ index: 1 });
    await expect(page.locator('tbody tr').nth(3)).toBeVisible();
    await shoot(page, 'attendance');

    await navigate(page, 'الشؤون المالية');
    await expect(
      activePane(page).getByRole('heading', { name: 'لوحة التحكم المالية' }),
    ).toBeVisible();
    await activePane(page).getByLabel('الفترة').selectOption('academicYear');
    await expect(activePane(page).locator('.spinner-border')).toHaveCount(0);
    await shoot(page, 'financial-dashboard');

    await openTab(page, 'رسوم الطلاب');
    await expect(activePane(page).locator('tbody tr').first()).toBeVisible();
    await shoot(page, 'student-fees');

    await navigate(page, 'الإعدادات');
    await openTab(page, 'فئات عمرية');
    // Give the children's group its own fees (on this copy only) to show the fee columns.
    const kids = activePane(page).locator('tbody tr', {
      has: page.locator('td:first-child', { hasText: /^الأطفال$/ }),
    });
    await kids.getByRole('button', { name: 'تعديل' }).click();
    await page.locator('.modal.show input[name="annual_fee"]').fill('100');
    await page.locator('.modal.show input[name="monthly_fee"]').fill('10');
    await page.locator('.modal.show').getByRole('button', { name: 'حفظ' }).click();
    await expect(page.locator('.modal.show')).toHaveCount(0);
    await expect(kids.locator('td').nth(4)).toHaveText('100.00');
    await shoot(page, 'age-groups');
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
