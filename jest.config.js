module.exports = {
  // Multiple test environments for different test types
  projects: [
    {
      displayName: 'main-process',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/*.spec.js'],
      moduleNameMapper: {
        'electron-store': '<rootDir>/tests/mocks/electron-store.js',
        sqlite3: '<rootDir>/tests/mocks/sqlite3.js',
        '^@journeyapps/sqlcipher$': '<rootDir>/tests/mocks/sqlcipher.js',
        electron: '<rootDir>/tests/mocks/electron.js',
        pizzip: '<rootDir>/tests/mocks/pizzip.js',
        bcryptjs: '<rootDir>/tests/mocks/bcryptjs.js',
        '../db/db': '<rootDir>/tests/mocks/db.js',
      },
    },
    {
      displayName: 'renderer-process',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/renderer/*.spec.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/renderer/setup.js'],
      moduleNameMapper: {
        '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(png|jpg|jpeg|gif|svg)$': 'jest-transform-stub',
        '^@renderer/styles/(.*)$': 'identity-obj-proxy',
      },
      transformIgnorePatterns: [
        'node_modules/(?!(react-bootstrap)/)',
      ],
      transform: {
        '^.+\\.(js|jsx)$': 'babel-jest',
      },
    },
  ],

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The paths to modules that run some code to configure or set up the testing environment before each test
  testPathIgnorePatterns: ['/node_modules/', '/release/'],
};
