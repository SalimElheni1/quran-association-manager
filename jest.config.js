module.exports = {
  // The test environment that will be used for testing
  testEnvironment: 'node',

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources
  moduleNameMapper: {
    // Mock for native/electron-dependent modules
    'electron-store': '<rootDir>/tests/mocks/electron-store.js',
    'sqlite3': '<rootDir>/tests/mocks/sqlite3.js',
  },

  // Automatically clear mock calls and instances between every test
  clearMocks: true,
};
