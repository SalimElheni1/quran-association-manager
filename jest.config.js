// Handler tests against a real, migrated SQLite database (tests/db). The SQLite module is built
// for Electron's ABI and does not load under plain Node, so this project only exists when Jest
// runs under Electron's Node (`npm run test:db`); a plain `jest` run leaves it out. It uses the
// real src/db/db.js (no '../db/db' mapping); 'electron' and 'electron-store' are mapped to
// in-memory mocks so the database, logs and key store stay in a temporary directory.
const dbIntegrationProject = {
  displayName: 'db-integration',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/db/**/*.spec.js'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/db/helpers/electronMock.js',
    '^electron-store$': '<rootDir>/tests/db/helpers/electronStoreMock.js',
  },
};

module.exports = {
  // Multiple test environments for different test types
  projects: [
    {
      displayName: 'main-process',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/*.spec.js'],
      moduleNameMapper: {
        'electron-store': '<rootDir>/tests/mocks/electron-store.js',
        '^electron$': '<rootDir>/tests/mocks/electron.js',
        pizzip: '<rootDir>/tests/mocks/pizzip.js',
        bcryptjs: '<rootDir>/tests/mocks/bcryptjs.js',
        '../db/db': '<rootDir>/tests/mocks/db.js',
        exceljs: '<rootDir>/tests/mocks/exceljs.js',
        '^fs$': '<rootDir>/tests/mocks/fs.js',
        '^joi$': '<rootDir>/tests/mocks/joi.js',
        jsonwebtoken: '<rootDir>/tests/mocks/jsonwebtoken.js',
      },
    },
    {
      displayName: 'renderer-process',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/renderer/**/*.spec.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/renderer/setup.js'],
      moduleNameMapper: {
        '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
        '\\.(png|jpg|jpeg|gif|svg)$': 'jest-transform-stub',
      },
      transformIgnorePatterns: ['node_modules/(?!(react-bootstrap|d3-[a-z-]+|internmap)/)'],
      transform: {
        '^.+\\.(js|jsx)$': 'babel-jest',
        '\\.(css|less|scss|sass)$': 'jest-transform-stub',
      },
    },
    ...(process.versions.electron ? [dbIntegrationProject] : []),
  ],

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The paths to modules that run some code to configure or set up the testing environment before each test
  testPathIgnorePatterns: ['/node_modules/', '/release/'],
};
