// The web twin of tests/e2e/fixtures.js. With web/playwright.config.js, the desktop's own UI
// specs (tests/e2e/*.e2e.js) run in a browser against the web server: `require('./fixtures')`
// in those specs resolves here (see resolveFixtures.js). Each test gets a new branch whose
// Superadmin (SUPERADMIN) came in through a platform invitation and set the backup key, which
// is where the desktop's first-run setup leaves a fresh app.

const { test: base, expect } = require('@playwright/test');
const crypto = require('crypto');
const desktop = require('../../../tests/e2e/fixtures');

const BASE_URL = process.env.QAM_E2E_BASE_URL || 'http://localhost:8098';
const PLATFORM_ADMIN = { email: 'e2e-platform@example.org', password: 'Platform#E2E-2026' };

const { SUPERADMIN } = desktop;

/** A tiny cookie-keeping HTTP client for the API (one per scope). */
function apiClient() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        'X-QAM': '1',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    return data;
  };
}

const digits = (n) => String(crypto.randomInt(10 ** (n - 1), 10 ** n));

/**
 * Creates a branch and its Superadmin (through an invitation), with the backup key set.
 * @returns {Promise<{slug: string, name: string}>}
 */
async function newBranch(superadmin = SUPERADMIN) {
  const platform = apiClient();
  await platform('POST', '/api/platform/auth/login', PLATFORM_ADMIN);
  const slug = `e2e-${crypto.randomBytes(5).toString('hex')}`;
  const name = 'فرع الاختبار';
  const { branch } = await platform('POST', '/api/platform/branches', { name, slug });
  const { link } = await platform('POST', `/api/platform/branches/${branch.id}/invitations`, {});
  const token = link.split('/invite/')[1];

  const member = apiClient();
  await member('POST', `/api/invitations/${token}/accept`, {
    username: superadmin.username,
    password: superadmin.password,
    confirm_password: superadmin.password,
    first_name: 'مدير',
    last_name: 'النظام',
    national_id: digits(8),
    phone_number: digits(8),
  });
  const key = await member('POST', `/api/b/${slug}/rpc/backup:set-transfer-key`, {
    args: [
      {
        password: superadmin.password,
        key: superadmin.transferKey,
        confirmKey: superadmin.transferKey,
      },
    ],
  });
  if (!key.ok || !key.result.success) throw new Error(`transfer key: ${JSON.stringify(key)}`);
  await member('POST', `/api/b/${slug}/auth/logout`, {});
  return { slug, name };
}

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured fixtures arg
  branch: async ({}, use) => {
    await use(await newBranch());
  },

  // The branch's login page (the desktop fixture's fresh app, after its first-run setup).
  page: async ({ page, branch }, use) => {
    await page.goto(`${BASE_URL}/b/${branch.slug}/#/login`);
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },

  authedPage: async ({ page }, use) => {
    await login(page);
    await desktop.dismissOnboarding(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await use(page);
  },
});

/** On the web the Superadmin comes by invitation: there is no setup form, only the login. */
async function setupSuperadmin(page) {
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
}

async function login(page, user = SUPERADMIN) {
  await desktop.login(page, user);
}

module.exports = {
  ...desktop,
  test,
  expect,
  setupSuperadmin,
  login,
  newBranch,
  apiClient,
  BASE_URL,
  PLATFORM_ADMIN,
  launchApp: () => {
    throw new Error('launchApp: the web tests have no desktop app.');
  },
  setAppDate: () => {
    throw new Error('setAppDate: not available against the web server.');
  },
};
