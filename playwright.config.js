const { defineConfig } = require('@playwright/test');

/**
 * End-to-end tests: drive the real Electron app (main process, preload bridge,
 * encrypted SQLite DB, built renderer) through Playwright's Electron support.
 *
 * Specs live in tests/e2e and use the `.e2e.js` suffix so Jest never picks them up.
 * The renderer must be built first (`npm run test:e2e` does this).
 */
// The real-world scenario (tests/e2e/realworld) is long, so it only runs with
// QBM_REALWORLD=1 (npm run test:e2e:realworld). Its continuation phase depends on the seed.
const realworld = !!process.env.QBM_REALWORLD;

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.js',
  projects: realworld
    ? [
        { name: 'realworld-seed', testMatch: 'realworld/01-seed.e2e.js' },
        {
          name: 'realworld-continue',
          testMatch: 'realworld/02-continue.e2e.js',
          dependencies: ['realworld-seed'],
        },
      ]
    : [{ name: 'e2e', testIgnore: '**/realworld/**' }],
  // Each test launches its own Electron instance; keep them serial for stability.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
