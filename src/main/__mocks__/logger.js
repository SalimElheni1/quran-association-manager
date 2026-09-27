// src/main/__mocks__/logger.js
module.exports = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  initializeLogFile: jest.fn(),
  getLogFilePath: jest.fn(),
  clearLogFile: jest.fn(),
};
