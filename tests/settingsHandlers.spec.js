// tests/settingsHandlers.spec.js

// Mock dependencies at the top level
jest.mock('electron');
jest.mock('../src/db/db');
jest.mock('fs');
jest.mock('../src/main/backupManager');
jest.mock('../src/main/logger');

const {
  registerSettingsHandlers,
  internalGetSettingsHandler,
  internalUpdateSettingsHandler,
} = require('../src/main/handlers/settingsHandlers');
const { ipcMain, app, dialog } = require('electron');
const db = require('../src/db/db');
const fs = require('fs');
const path = require('path'); // Use the real path module
const backupManager = require('../src/main/backupManager');
const { log, error: logError } = require('../src/main/logger');

describe('settingsHandlers', () => {
  let handlers = {};
  let mockRefreshSettings;

  const getValidSettings = () => ({
    national_association_name: 'Test Association',
    regional_association_name: 'Test Region',
    local_branch_name: 'Test Branch',
    national_logo_path: 'path/to/logo.png',
    regional_local_logo_path: 'path/to/logo2.png',
    backup_path: '/backup/path',
    backup_enabled: true,
    backup_frequency: 'daily',
    president_full_name: 'Test President',
    backup_reminder_enabled: true,
    backup_reminder_frequency_days: 7,
    adultAgeThreshold: 18,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Capture registered handlers
    handlers = {}; // Reset handlers object
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockRefreshSettings = jest.fn();
    // Register handlers to populate the handlers object for testing
    registerSettingsHandlers(mockRefreshSettings);
  });

  describe('internalGetSettingsHandler', () => {
    it('should get settings and merge with defaults', async () => {
      const mockDbResults = [
        { key: 'national_association_name', value: 'Custom National' },
        { key: 'backup_enabled', value: 'true' },
        { key: 'adultAgeThreshold', value: '21' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.success).toBe(true);
      expect(result.settings).toEqual(expect.objectContaining({
        national_association_name: 'Custom National',
        backup_enabled: true,
        adultAgeThreshold: 21,
        backup_frequency: 'daily', // from default
      }));
    });

    it('should handle legacy snake_case keys correctly', async () => {
        const mockDbResults = [{ key: 'adult_age_threshold', value: '19' }];
        db.allQuery.mockResolvedValue(mockDbResults);

        const result = await internalGetSettingsHandler();

        expect(result.settings.adultAgeThreshold).toBe(19);
        expect(result.settings).not.toHaveProperty('adult_age_threshold');
    });
  });

  describe('internalUpdateSettingsHandler', () => {
    it('should update settings successfully', async () => {
      const settingsData = getValidSettings();
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await internalUpdateSettingsHandler(settingsData);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(result.success).toBe(true);
    });

    it('should rollback on database error', async () => {
      const dbError = new Error('Database error');
      const validSettings = getValidSettings();
      db.runQuery.mockResolvedValueOnce() // BEGIN
                 .mockRejectedValueOnce(dbError); // First UPDATE fails

      await expect(internalUpdateSettingsHandler(validSettings)).rejects.toThrow('فشل تحديث الإعدادات.');

      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
      expect(logError).toHaveBeenCalledWith('Failed to update settings:', dbError);
    });

    it('should throw validation errors', async () => {
        const invalidSettings = { ...getValidSettings(), adultAgeThreshold: 10 }; // Below minimum of 12
        await expect(internalUpdateSettingsHandler(invalidSettings)).rejects.toThrow('"adultAgeThreshold" must be greater than or equal to 12');
    });
  });

  describe('settings:get', () => {
    it('should return settings if db is open', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([]);

      const result = await handlers['settings:get']();
      expect(db.allQuery).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('settings:update', () => {
    it('should update settings and restart backup scheduler', async () => {
      const settingsData = getValidSettings();

      db.runQuery.mockResolvedValue({ changes: 1 }); // for the update
      db.allQuery.mockResolvedValue(Object.entries(settingsData).map(([k,v]) => ({key: k, value: v})));

      await handlers['settings:update'](null, settingsData);

      expect(log).toHaveBeenCalledWith('Settings updated, restarting backup scheduler...');
      expect(backupManager.startScheduler).toHaveBeenCalledWith(expect.objectContaining(settingsData));
      expect(mockRefreshSettings).toHaveBeenCalled();
    });
  });

  describe('settings:uploadLogo', () => {
    it('should create logos directory if it does not exist and copy file', async () => {
        const mockTempPath = '/temp/logo.png';
        const mockUserDataPath = '/user/data';
        const mockDestDir = path.join(mockUserDataPath, 'assets', 'logos');
        const mockDestFile = path.join(mockDestDir, 'logo.png');

        dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [mockTempPath] });
        app.getPath.mockReturnValue(mockUserDataPath);
        fs.existsSync.mockImplementation(p => p !== mockDestDir);

        await handlers['settings:uploadLogo']();

        expect(fs.mkdirSync).toHaveBeenCalledWith(mockDestDir, { recursive: true });
        expect(fs.copyFileSync).toHaveBeenCalledWith(mockTempPath, mockDestFile);
    });

    it('should return success and relative path on successful upload', async () => {
        dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/logo.png'] });
        app.getPath.mockReturnValue('/user/data');
        fs.existsSync.mockReturnValue(true);
        const basenameSpy = jest.spyOn(path, 'basename').mockReturnValue('logo.png');

        const result = await handlers['settings:uploadLogo']();

        expect(result.success).toBe(true);
        expect(result.path).toBe('assets/logos/logo.png');

        basenameSpy.mockRestore();
    });
  });
});