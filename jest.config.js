module.exports = {
  // The test environment that will be used for testing
  testEnvironment: 'node',

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources
  moduleNameMapper: {
    // Mock for native/electron-dependent modules
    'electron-store': '<rootDir>/tests/mocks/electron-store.js',
    sqlite3: '<rootDir>/tests/mocks/sqlite3.js',
    '^@journeyapps/sqlcipher$': '<rootDir>/tests/mocks/sqlcipher.js',
    electron: '<rootDir>/tests/mocks/electron.js',
    pizzip: '<rootDir>/tests/mocks/pizzip.js',
    bcryptjs: '<rootDir>/tests/mocks/bcryptjs.js',
  },

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The paths to modules that run some code to configure or set up the testing environment before each test
  testPathIgnorePatterns: ['/node_modules/', '/release/'],
};
