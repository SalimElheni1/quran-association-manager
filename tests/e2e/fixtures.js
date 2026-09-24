const { test: base, expect, _electron: electron } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RENDERER_INDEX = path.join(ROOT, 'dist', 'renderer', 'index.html');

const SUPERADMIN = { username: 'e2eadmin', password: 'e2e-pass-123' };

/**
 * Launches the real Electron app against a fresh, throwaway userData directory.
 * Pass an existing `userDataDir` to relaunch on the same data (e.g. after a restore).
 * @param {{ userDataDir?: string }} [options]
 * @returns {Promise<{ app: import('@playwright/test').ElectronApplication, userDataDir: string }>}
 */
async function launchApp({
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbm-e2e-')),
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
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    cwd: ROOT,
    // `basic` password store: no OS keyring prompts on Linux desktops or CI.
    args: ['.', '--password-store=basic'],
    env,
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
