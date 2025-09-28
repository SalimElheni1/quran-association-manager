// Mock dependencies at the top level. Jest will handle hoisting them.
jest.mock('../src/main/handlers/settingsHandlers', () => ({
  internalGetSettingsHandler: jest.fn(),
}));
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

describe('settingsManager', () => {
  let settingsManager;
  let mockInternalGetSettingsHandler;
  let mockLog;
  let mockLogError;

  beforeEach(() => {
    // Reset modules to ensure a clean state for each test, especially for the cache.
    jest.resetModules();

    // Re-require the module under test and its dependencies after resetting.
    settingsManager = require('../src/main/settingsManager');
    mockInternalGetSettingsHandler =
      require('../src/main/handlers/settingsHandlers').internalGetSettingsHandler;
    mockLog = require('../src/main/logger').log;
    mockLogError = require('../src/main/logger').error;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refreshSettings', () => {
    it('should refresh the settings cache successfully and allow getSetting to retrieve values', async () => {
      const mockSettings = { theme: 'dark', fontSize: 16 };
      mockInternalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      // Action: Refresh the settings
      await settingsManager.refreshSettings();

      // Assertions for refreshSettings
      expect(mockInternalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(mockLog).toHaveBeenCalledWith('Settings cache refreshed.');
      expect(mockLogError).not.toHaveBeenCalled();

      // Assertions for getSetting after refresh
      expect(await settingsManager.getSetting('theme')).toBe('dark');
      expect(await settingsManager.getSetting('fontSize')).toBe(16);
    });

    it('should log an error if refreshing settings fails', async () => {
      const mockError = new Error('Failed to fetch settings');
      mockInternalGetSettingsHandler.mockRejectedValue(mockError);

      await settingsManager.refreshSettings();

      expect(mockInternalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(mockLog).not.toHaveBeenCalledWith('Settings cache refreshed.');
      expect(mockLogError).toHaveBeenCalledWith('Failed to refresh settings cache:', mockError);
    });
  });

  describe('getSetting', () => {
    it('should return the setting from a pre-populated cache', async () => {
      const mockSettings = { appName: 'Quran Manager', language: 'ar' };
      mockInternalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });
      await settingsManager.refreshSettings(); // Pre-populate cache

      // Clear mocks to isolate the getSetting call
      jest.clearAllMocks();

      const appName = await settingsManager.getSetting('appName');
      const language = await settingsManager.getSetting('language');

      // Ensure refresh was not called again
      expect(mockInternalGetSettingsHandler).not.toHaveBeenCalled();
      expect(appName).toBe('Quran Manager');
      expect(language).toBe('ar');
    });

    it('should automatically call refreshSettings if cache is not initialized', async () => {
      const mockSettings = { theme: 'light' };
      mockInternalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      // Cache is empty, so getSetting should trigger a refresh
      const theme = await settingsManager.getSetting('theme');

      // Assert that refresh was called and the value is correct
      expect(mockInternalGetSettingsHandler).toHaveBeenCalledTimes(1);
      expect(mockLog).toHaveBeenCalledWith('Settings cache refreshed.');
      expect(theme).toBe('light');
    });

    it('should return null for a non-existent setting in a populated cache', async () => {
      const mockSettings = { theme: 'light' };
      mockInternalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });
      await settingsManager.refreshSettings();

      const nonExistent = await settingsManager.getSetting('nonExistentSetting');
      expect(nonExistent).toBeNull();
    });

    it('should return the default value for adult_age_threshold if not in cache', async () => {
      const mockSettings = { theme: 'light' }; // No age threshold
      mockInternalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      const ageThreshold = await settingsManager.getSetting('adult_age_threshold');
      expect(ageThreshold).toBe(18);
    });
  });
});