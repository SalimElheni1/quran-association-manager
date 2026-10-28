// Browser tests of the web version, against a server started here on a throwaway database:
//   npm run test:e2e      (needs PostgreSQL and a built client: npm run build:client)
// They run the desktop's own UI specs (tests/e2e, those that do not drive Electron itself)
// with the web fixtures, plus the web-only specs in test/e2e.
const path = require('path');
const { defineConfig } = require('@playwright/test');

process.env.NODE_OPTIONS =
  `${process.env.NODE_OPTIONS || ''} --require ${path.join(__dirname, 'test', 'e2e', 'resolveFixtures.js')}`.trim();

const PORT = Number(process.env.QAM_E2E_PORT) || 8098;
const DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/qam_web_e2e';
process.env.QAM_E2E_BASE_URL = `http://localhost:${PORT}`;
process.env.QAM_E2E_DATABASE_URL = DATABASE_URL;

// Desktop specs that need no Electron API (dialogs, clock, relaunch).
const DESKTOP_SPECS = [
  'categories',
  'classes-attendance',
  'classes-manage',
  'dashboard-home',
  'financial-transactions',
  'financials',
  'inventory',
  'settings',
  'smoke',
  'student-fees-categories',
  'student-fees-groups',
  'student-fees',
  'students',
  'teachers',
  'users-admin',
  'users-roles',
];

module.exports = defineConfig({
  globalSetup: require.resolve('./test/e2e/globalSetup.js'),
  projects: [
    {
      name: 'desktop-specs-on-web',
      testDir: path.join(__dirname, '..', 'tests', 'e2e'),
      testMatch: DESKTOP_SPECS.map((name) => `${name}.e2e.js`),
      // Asserts the desktop's safe-image:// address; files.e2e.js checks the web one.
      grepInvert: /shows the bundled national logo in the sidebar/,
    },
    { name: 'web', testDir: path.join(__dirname, 'test', 'e2e'), testMatch: '*.e2e.js' },
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: path.join(__dirname, 'test-results'),
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1366, height: 860 },
    locale: 'ar-TN',
    acceptDownloads: true,
    // Without a UTF-8 locale Chromium names downloads with Arabic names "download".
    launchOptions: { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    cwd: __dirname,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL,
      PORT: String(PORT),
      PUBLIC_URL: `http://localhost:${PORT}`,
      DATA_DIR: path.join(require('os').tmpdir(), `qam-web-e2e-${PORT}`),
      RATE_LIMIT_SCALE: '1000',
      SCHEDULER_ENABLED: 'false',
      LOG_LEVEL: 'error',
    },
  },
});
