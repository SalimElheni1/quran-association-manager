const { app } = require('electron');
const { log, warn, error } = require('../src/main/logger');

// Mock Electron's app module
jest.mock('electron', () => ({
  app: {
    isPackaged: false, // Default to not packaged for development testing
  },
}));

describe('Logger', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    // Reset app.isPackaged for each test
    app.isPackaged = false;
  });

  describe('log function', () => {
    it('should log to console.log when app is not packaged', () => {
      log('Test message', 123);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('Test message', 123);
    });

    it('should not log to console.log when app is packaged', () => {
      app.isPackaged = true;
      log('Test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn function', () => {
    it('should log to console.warn when app is not packaged', () => {
      warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning message');
    });

    it('should not log to console.warn when app is packaged', () => {
      app.isPackaged = true;
      warn('Warning message');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error function', () => {
    it('should always log to console.error regardless of app packaging status', () => {
      error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error message');

      app.isPackaged = true;
      error('Another error');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Another error');
    });
  });
});
