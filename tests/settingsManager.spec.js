// Mock dependencies
jest.mock('../src/main/handlers/settingsHandlers', () => ({
  internalGetSettingsHandler: jest.fn(),
}));
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

describe('settingsManager', () => {
  // We need to reset modules before each test to clear the module-level settingsCache
  beforeEach(() => {
    jest.resetModules();
    // Re-apply mocks after resetting modules
    jest.mock('../src/main/handlers/settingsHandlers', () => ({
      internalGetSettingsHandler: jest.fn(),
    }));
    jest.mock('../src/main/logger', () => ({
      log: jest.fn(),
      error: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refreshSettings', () => {
    it('should refresh the settings cache successfully and allow getSetting to read it', async () => {
      // Re-require modules to get fresh instances for this test
      const { refreshSettings, getSetting } = require('../src/main/settingsManager');
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
      const { log } = require('../src/main/logger');

      const mockSettings = { theme: 'dark', fontSize: 16 };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      await refreshSettings();

      expect(internalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Settings cache refreshed.');

      // Check if getSetting can retrieve the cached values without re-fetching
      expect(await getSetting('theme')).toBe('dark');
      expect(await getSetting('fontSize')).toBe(16);
      // Ensure getSetting used the cache and did not call refreshSettings again
      expect(internalGetSettingsHandler).toHaveBeenCalledTimes(1);
    });

    it('should log an error if refreshing settings fails', async () => {
      const { refreshSettings } = require('../src/main/settingsManager');
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
      const { log, error: logError } = require('../src/main/logger');

      const mockError = new Error('Failed to fetch settings');
      internalGetSettingsHandler.mockRejectedValue(mockError);

      await refreshSettings();

      expect(internalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalledWith('Settings cache refreshed.');
      expect(logError).toHaveBeenCalledWith('Failed to refresh settings cache:', mockError);
    });
  });

  describe('getSetting', () => {
    it('should return a setting from the cache if already initialized', async () => {
      const { refreshSettings, getSetting } = require('../src/main/settingsManager');
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');

      const mockSettings = { appName: 'Quran Manager', language: 'ar' };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      // Initialize the cache first
      await refreshSettings();
      // Clear mock calls from the initialization step
      internalGetSettingsHandler.mockClear();

      const appName = await getSetting('appName');
      const language = await getSetting('language');

      expect(appName).toBe('Quran Manager');
      expect(language).toBe('ar');
      // Verify that getSetting used the cache and did not call the handler again
      expect(internalGetSettingsHandler).not.toHaveBeenCalled();
    });

    it('should automatically refresh the cache if it is not initialized', async () => {
      const { getSetting } = require('../src/main/settingsManager');
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
      const { log } = require('../src/main/logger');

      const mockSettings = { adultAgeThreshold: 21 };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      // Call getSetting with an empty cache
      const setting = await getSetting('adultAgeThreshold');

      expect(setting).toBe(21);
      expect(internalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Settings cache refreshed.');
    });

    it('should return a fallback for age threshold if the setting is missing', async () => {
      const { getSetting } = require('../src/main/settingsManager');
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');

      // Simulate settings from DB that are missing the age threshold
      const mockSettings = { theme: 'light' };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      const setting = await getSetting('adultAgeThreshold');

      expect(setting).toBe(18); // Check for the hardcoded fallback
      expect(internalGetSettingsHandler).toHaveBeenCalledTimes(1);
    });
  });
});
