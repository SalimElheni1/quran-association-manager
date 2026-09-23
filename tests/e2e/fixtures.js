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
 * @returns {Promise<{ app: import('@playwright/test').ElectronApplication, userDataDir: string }>}
 */
async function launchApp() {
  if (!fs.existsSync(RENDERER_INDEX)) {
    throw new Error(`Renderer build not found at ${RENDERER_INDEX}. Run "npm run build" first.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbm-e2e-'));
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

module.exports = { test, expect, launchApp, setupSuperadmin, login, SUPERADMIN };
