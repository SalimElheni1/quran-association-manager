// Runs the desktop's real-database handler tests (tests/db) against PostgreSQL, through the web
// server's adapter and shims: the same assertions, on the web storage.
//   npm run test:pg        (needs PostgreSQL; TEST_DATABASE_URL, default qam_jest on localhost)
const path = require('path');

const web = (p) => path.join(__dirname, p);

module.exports = {
  rootDir: path.join(__dirname, '..'),
  displayName: 'web-postgres',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/db/**/*.spec.js'],
  // The database key belongs to the desktop's encrypted SQLite file; the web has none.
  testPathIgnorePatterns: ['/node_modules/', 'dbKey'],
  setupFiles: [web('test/pg/setupEnv.js')],
  globalSetup: web('test/pg/globalSetup.js'),
  moduleNameMapper: {
    '^electron$': web('server/shims/electron.js'),
    '^electron-store$': web('server/shims/electron-store.js'),
    '^(\\.\\./)+(src/)?db/db$': web('server/db/adapter.js'),
    '^\\./(helpers/)?realDb$': web('test/pg/realDbPg.js'),
    '^(\\.\\.?/)+settingsManager$': web('server/shims/settingsManager.js'),
    '^(\\.\\.?/)+(main/)?logger$': web('server/shims/logger.js'),
    '^\\.\\./index$': web('server/shims/mainIndex.js'),
  },
  clearMocks: true,
  maxWorkers: 2,
};
