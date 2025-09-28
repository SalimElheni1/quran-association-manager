
const { refreshSettings, getSetting } = require('../src/main/settingsManager');
const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
const { log, error: logError } = require('../src/main/logger');

// Mock dependencies
jest.mock('../src/main/handlers/settingsHandlers', () => ({
  internalGetSettingsHandler: jest.fn(),
}));
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

describe('settingsManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // Ensure a fresh module state for each test
  });

  describe('refreshSettings', () => {
    it('should refresh the settings cache successfully', async () => {
      const mockSettings = { theme: 'dark', fontSize: 16 };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      await refreshSettings();

      expect(internalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Settings cache refreshed.');
      expect(logError).not.toHaveBeenCalled();
      expect(getSetting('theme')).toBe('dark');
      expect(getSetting('fontSize')).toBe(16);
    });

    it('should log an error if refreshing settings fails', async () => {
      const mockError = new Error('Failed to fetch settings');
      internalGetSettingsHandler.mockRejectedValue(mockError);

      await refreshSettings();

      expect(internalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalledWith('Settings cache refreshed.');
      expect(logError).toHaveBeenCalledWith('Failed to refresh settings cache:', mockError);
    });
  });

  describe('getSetting', () => {
    it('should return the setting from the cache if initialized', async () => {
      const mockSettings = { appName: 'Quran Manager', language: 'ar' };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });
      await refreshSettings(); // Initialize cache

      const appName = getSetting('appName');
      const language = getSetting('language');

      expect(appName).toBe('Quran Manager');
      expect(language).toBe('ar');
      expect(logError).not.toHaveBeenCalled();
    });

    it('should log a critical error and return fallback if cache is not initialized', () => {
      // Re-import getSetting to ensure settingsCache is null
      jest.resetModules();
      const { getSetting } = require('../src/main/settingsManager');
      const { log, error: logError } = require('../src/main/logger');

      const setting = getSetting('ageThreshold');

      expect(setting).toBe(18); // Hardcoded fallback
      expect(logError).toHaveBeenCalledWith(
        'CRITICAL: getSetting called before settings cache was initialized.',
      );
    });
  });
});
