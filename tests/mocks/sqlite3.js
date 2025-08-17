// tests/mocks/sqlite3.js

// This mock prevents the native 'sqlite3' module from being loaded during tests.
// The actual database functions are mocked in the test files themselves (e.g., in auth.spec.js).
const sqlite3 = {
  verbose: () => sqlite3,
  Database: jest.fn(() => ({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
    exec: jest.fn(),
    close: jest.fn(),
  })),
};

module.exports = sqlite3;
