const { test: base, expect, _electron: electron } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RENDERER_INDEX = path.join(ROOT, 'dist', 'renderer', 'index.html');

// Meets the password policy (SEC-010): 12+ characters, upper, lower, digit and symbol.
const SUPERADMIN = { username: 'e2eadmin', password: 'Zitouna#Test-2026' };

/**
 * Launches the real Electron app against a fresh, throwaway userData directory.
 * Pass an existing `userDataDir` to relaunch on the same data (e.g. after a restore), and
 * `now` (ISO date-time) to start the app's main-process clock at that moment, and
 * `recordVideo` ({ dir, size }) to record the window (used by the video guide).
 * @param {{ userDataDir?: string, now?: string, recordVideo?: { dir: string, size?: object } }} [options]
 * @returns {Promise<{ app: import('@playwright/test').ElectronApplication, userDataDir: string }>}
 */
async function launchApp({
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbm-e2e-')),
  now,
  recordVideo,
} = {}) {
  if (!fs.existsSync(RENDERER_INDEX)) {
    throw new Error(`Renderer build not found at ${RENDERER_INDEX}. Run "npm run build" first.`);
  }

  const env = {
    ...process.env,
    QBM_E2E: '1',
    QBM_E2E_USER_DATA: userDataDir,
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  if (now) env.QBM_E2E_NOW = now;
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    cwd: ROOT,
    // `basic` password store: no OS keyring prompts on Linux desktops or CI.
    args: ['.', '--password-store=basic'],
    env,
    ...(recordVideo ? { recordVideo } : {}),
  });
  return { app, userDataDir };
}

const test = base.extend({
  // Fresh app + fresh database for every test.
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured fixtures arg
  electronApp: async ({}, use) => {
    const { app, userDataDir } = await launchApp();
    try {
      await use(app);
    } finally {
      await app.close().catch(() => {});
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },

  // Logged in as the superadmin on the dashboard, onboarding guide dismissed.
  authedPage: async ({ page }, use) => {
    await setupSuperadmin(page);
    await login(page);
    await dismissOnboarding(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await use(page);
  },
});

/** Completes the first-run superadmin setup form. */
async function setupSuperadmin(page, { username, password } = SUPERADMIN) {
  await expect(page.getByRole('heading', { name: 'إنشاء مدير النظام' })).toBeVisible();
  await page.locator('#setup-username').fill(username);
  await page.locator('input[name="setup-password"]').fill(password);
  await page.locator('input[name="setup-confirm-password"]').fill(password);
  await page.getByRole('button', { name: 'إنشاء مدير النظام' }).click();
}

/** Logs in through the login form. */
async function login(page, { username, password } = SUPERADMIN) {
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await page.locator('#username').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
}

/**
 * Moves the app to a given moment: the main process (billing, scheduler, sessions) keeps
 * ticking from there; the window's date is fixed at it (its timers keep running, so fades and
 * toasts still work). Sessions are checked against this clock, so moving ahead usually means
 * logging in again.
 * @param {string} iso e.g. '2026-10-26T09:00:00'
 */
async function setAppDate(electronApp, page, iso) {
  await electronApp.evaluate((_, when) => global.__qbmE2ESetNow(when), iso);
  await page.clock.setFixedTime(new Date(iso));
}

/**
 * Closes the onboarding guide that opens ~500ms after a user's first login.
 * No-op when the guide does not appear (user already dismissed it).
 */
async function dismissOnboarding(page) {
  const stop = page.getByRole('button', { name: 'إيقاف العرض' });
  try {
    await stop.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    return;
  }
  await stop.click();
  await expect(page.locator('.onboarding-guide')).toBeHidden();
}

/** Navigates via the sidebar link with the given Arabic label (e.g. 'شؤون الطلاب'). */
async function navigate(page, label) {
  await page.locator('a.nav-link', { hasText: label }).click();
}

/** The currently open react-bootstrap modal. */
function modal(page) {
  return page.locator('.modal.show');
}

/**
 * Asserts a react-toastify toast is visible.
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string|RegExp} text
 */
async function expectToast(page, type, text) {
  await expect(page.locator(`.Toastify__toast--${type}`, { hasText: text }).first()).toBeVisible();
}

/**
 * Waits until no modal is left, including one still fading out. A closing
 * react-bootstrap modal drops `.show` first but keeps `modal-open` on the body
 * and traps focus, so typing into the page right away is silently lost.
 */
async function expectNoModal(page) {
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
}

/** Confirms the shared ConfirmationModal. */
async function confirmDialog(page, confirmText = 'نعم، حذف') {
  await modal(page).getByRole('button', { name: confirmText }).click();
  await expectNoModal(page);
}

/**
 * Creates a user with exactly one role through the Users page.
 * @param {{ username, password, firstName, lastName, nationalId, phone }} user
 * @param {'Superadmin'|'Administrator'|'FinanceManager'|'SessionSupervisor'} roleKey
 */
async function createUser(page, user, roleKey) {
  await navigate(page, 'إدارة المستخدمين');
  await page.getByRole('button', { name: 'إضافة مستخدم جديد' }).click();
  const form = modal(page);
  await expect(form.locator('.modal-title')).toHaveText('إضافة مستخدم جديد');

  await form.locator('input[name="username"]').fill(user.username);
  await form.locator('input[name="password"]').fill(user.password);
  await form.locator('input[name="first_name"]').fill(user.firstName);
  await form.locator('input[name="last_name"]').fill(user.lastName);
  await form.locator('input[name="national_id"]').fill(user.nationalId);
  await form.locator('input[name="phone_number"]').fill(user.phone);

  // Administrator is pre-checked for new users; leave only the requested role.
  if (roleKey !== 'Administrator') {
    await form.locator('#role-Administrator').uncheck();
    await form.locator(`#role-${roleKey}`).check();
  }

  await form.getByRole('button', { name: 'إضافة المستخدم' }).click();
  await expectNoModal(page);
}

/** A sidebar navigation link by its Arabic label. */
function sidebarLink(page, label) {
  return page.locator('a.nav-link', { hasText: label });
}

/** Logs out from the sidebar footer and waits for the login form. */
async function logout(page) {
  await page.locator('button.logout-btn').click();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
}

module.exports = {
  test,
  expect,
  launchApp,
  setAppDate,
  setupSuperadmin,
  login,
  dismissOnboarding,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  confirmDialog,
  logout,
  createUser,
  sidebarLink,
  SUPERADMIN,
};
