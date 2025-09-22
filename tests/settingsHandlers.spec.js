const {
  registerSettingsHandlers,
  internalGetSettingsHandler,
  internalUpdateSettingsHandler,
} = require('../src/main/handlers/settingsHandlers');

// Mock dependencies
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
  app: {
    getPath: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
  },
}));
jest.mock('joi', () => {
  const chainable = {
    string: jest.fn().mockReturnThis(),
    min: jest.fn().mockReturnThis(),
    max: jest.fn().mockReturnThis(),
    required: jest.fn().mockReturnThis(),
    messages: jest.fn().mockReturnThis(),
    email: jest.fn().mockReturnThis(),
    pattern: jest.fn().mockReturnThis(),
    alphanum: jest.fn().mockReturnThis(),
    number: jest.fn().mockReturnThis(),
    integer: jest.fn().mockReturnThis(),
    positive: jest.fn().mockReturnThis(),
    date: jest.fn().mockReturnThis(),
    iso: jest.fn().mockReturnThis(),
    boolean: jest.fn().mockReturnThis(),
    array: jest.fn().mockReturnThis(),
    any: jest.fn().mockReturnThis(),
    allow: jest.fn().mockReturnThis(),
    optional: jest.fn().mockReturnThis(),
    unknown: jest.fn().mockReturnThis(),
    valid: jest.fn().mockReturnThis(),
    default: jest.fn().mockReturnThis(),
    keys: jest.fn().mockReturnThis(),
    when: jest.fn().mockReturnThis(),
    try: jest.fn().mockReturnThis(),
    with: jest.fn().mockReturnThis(),
    ref: jest.fn((ref) => `ref:${ref}`),
    validateAsync: jest.fn(),
    validate: jest.fn(),
  };

  return {
    object: jest.fn(() => chainable),
    string: jest.fn(() => chainable),
    number: jest.fn(() => chainable),
    boolean: jest.fn(() => chainable),
    date: jest.fn(() => chainable),
    array: jest.fn(() => chainable),
    any: jest.fn(() => chainable),
    alternatives: jest.fn(() => chainable),
    exist: jest.fn(() => chainable),
    required: jest.fn(() => chainable),
    valid: jest.fn().mockReturnThis(),
    ref: (ref) => chainable.ref(ref),
    ValidationError: class ValidationError extends Error {
      constructor(message, details) {
        super(message);
        this.details = details;
      }
    },
  };
});
jest.mock('../../db/db');
jest.mock('fs');
jest.mock('path');
jest.mock('../src/main/backupManager');
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

const { ipcMain, app, dialog } = require('electron');
const Joi = require('joi');
const db = require('../../db/db');
const fs = require('fs');
const path = require('path');
const backupManager = require('../src/main/backupManager');
const { log, error: logError } = require('../src/main/logger');

describe('settingsHandlers', () => {
  let handlers = {};
  let mockRefreshSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Capture registered handlers
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockRefreshSettings = jest.fn();
    registerSettingsHandlers(mockRefreshSettings);
  });

  describe('internalGetSettingsHandler', () => {
    it('should get settings and merge with defaults', async () => {
      const mockDbResults = [
        { key: 'national_association_name', value: 'Custom National' },
        { key: 'backup_enabled', value: 'true' },
        { key: 'adultAgeThreshold', value: '21' },
        { key: 'adult_age_threshold', value: '19' }, // legacy key
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(db.allQuery).toHaveBeenCalledWith('SELECT key, value FROM settings');
      expect(result.success).toBe(true);
      expect(result.settings).toEqual(expect.objectContaining({
        national_association_name: 'Custom National',
        backup_enabled: true,
        adultAgeThreshold: 21, // Should use camelCase version
        backup_frequency: 'daily', // Default value
      }));
      expect(result.settings).not.toHaveProperty('adult_age_threshold'); // Legacy key removed
    });

    it('should handle boolean string conversion', async () => {
      const mockDbResults = [
        { key: 'backup_enabled', value: 'true' },
        { key: 'backup_reminder_enabled', value: 'false' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.settings.backup_enabled).toBe(true);
      expect(result.settings.backup_reminder_enabled).toBe(false);
    });

    it('should handle number string conversion', async () => {
      const mockDbResults = [
        { key: 'adultAgeThreshold', value: '25' },
        { key: 'backup_reminder_frequency_days', value: '14' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.settings.adultAgeThreshold).toBe(25);
      expect(result.settings.backup_reminder_frequency_days).toBe(14);
    });

    it('should handle empty and whitespace values', async () => {
      const mockDbResults = [
        { key: 'national_association_name', value: '' },
        { key: 'regional_association_name', value: '   ' },
        { key: 'backup_enabled', value: 'true' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.settings.national_association_name).toBe('');
      expect(result.settings.regional_association_name).toBe('   ');
      expect(result.settings.backup_enabled).toBe(true);
    });

    it('should prioritize camelCase over snake_case when both exist', async () => {
      const mockDbResults = [
        { key: 'adult_age_threshold', value: '18' },
        { key: 'adultAgeThreshold', value: '21' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.settings.adultAgeThreshold).toBe(21);
      expect(result.settings).not.toHaveProperty('adult_age_threshold');
    });
  });

  describe('internalUpdateSettingsHandler', () => {
    it('should update settings successfully', async () => {
      const settingsData = {
        national_association_name: 'Updated National',
        backup_enabled: true,
        adultAgeThreshold: 20,
      };

      const mockValidatedData = { ...settingsData };
      Joi.object().validateAsync = jest.fn().mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await internalUpdateSettingsHandler(settingsData);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(result).toEqual({
        success: true,
        message: 'تم تحديث الإعدادات بنجاح.'
      });
    });

    it('should handle legacy snake_case keys', async () => {
      const settingsData = {
        adult_age_threshold: 22,
        national_association_name: 'Test',
      };

      const mockValidatedData = {
        adultAgeThreshold: 22,
        national_association_name: 'Test',
      };
      Joi.object().validateAsync = jest.fn().mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await internalUpdateSettingsHandler(settingsData);

      expect(result.success).toBe(true);
    });

    it('should handle primary key update failure with fallback', async () => {
      const settingsData = { adultAgeThreshold: 25 };
      const mockValidatedData = { adultAgeThreshold: 25 };

      Joi.object().validateAsync = jest.fn().mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ changes: 0 }) // Primary key update fails
        .mockResolvedValueOnce({ changes: 1 }) // Fallback succeeds
        .mockResolvedValueOnce(); // COMMIT

      const result = await internalUpdateSettingsHandler(settingsData);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['25', 'adult_age_threshold']
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['25', 'adult_age_threshold']
      );
      expect(result.success).toBe(true);
    });

    it('should handle null and undefined values', async () => {
      const settingsData = {
        national_association_name: null,
        regional_association_name: undefined,
        backup_enabled: true,
      };

      const mockValidatedData = { ...settingsData };
      Joi.object().validateAsync = jest.fn().mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await internalUpdateSettingsHandler(settingsData);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['', 'national_association_name']
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['', 'regional_association_name']
      );
      expect(result.success).toBe(true);
    });

    it('should rollback on database error', async () => {
      const settingsData = { backup_enabled: true };
      const mockValidatedData = { backup_enabled: true };
      const dbError = new Error('Database error');

      Joi.object().validateAsync = jest.fn().mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(dbError) // UPDATE fails
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(internalUpdateSettingsHandler(settingsData))
        .rejects.toThrow('فشل تحديث الإعدادات.');

      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
      expect(logError).toHaveBeenCalledWith('Failed to update settings:', dbError);
    });

    it('should handle validation errors', async () => {
      const settingsData = { adultAgeThreshold: -5 };
      const validationError = new Error('Validation failed');

      Joi.object().validateAsync = jest.fn().mockRejectedValue(validationError);

      await expect(internalUpdateSettingsHandler(settingsData))
        .rejects.toThrow(validationError);
    });
  });

  describe('settings:get', () => {
    it('should get settings when database is open', async () => {
      const mockSettings = { backup_enabled: true };
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'backup_enabled', value: 'true' }
      ]);

      const result = await handlers['settings:get']();

      expect(result.success).toBe(true);
      expect(result.settings).toEqual(expect.objectContaining({
        backup_enabled: true
      }));
    });

    it('should return empty settings when database is closed', async () => {
      db.isDbOpen.mockReturnValue(false);

      const result = await handlers['settings:get']();

      expect(result).toEqual({
        success: true,
        settings: {}
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Database error');
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockRejectedValue(error);

      const result = await handlers['settings:get']();

      expect(logError).toHaveBeenCalledWith('Error in settings:get IPC wrapper:', error);
      expect(result).toEqual({
        success: false,
        message: 'Database error'
      });
    });
  });

  describe('settings:update', () => {
    it('should update settings and restart backup scheduler', async () => {
      const settingsData = { backup_enabled: true };
      const mockNewSettings = {
        adultAgeThreshold: 18,
        backup_enabled: true,
        backup_frequency: 'daily',
        backup_path: '',
        backup_reminder_enabled: true,
        backup_reminder_frequency_days: 7,
        local_branch_name: '',
        national_association_name: 'الرابطة الوطنية للقرآن الكريم',
        national_logo_path: '/assets/logos/g247.png',
        president_full_name: '',
        regional_association_name: '',
        regional_local_logo_path: '',
      };

      Joi.object().validateAsync = jest.fn().mockResolvedValue(settingsData);
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.allQuery.mockResolvedValue([
        { key: 'backup_enabled', value: 'true' },
        { key: 'backup_frequency', value: 'daily' },
      ]);
      backupManager.startScheduler.mockImplementation(() => {});

      // Mock the getSettings handler to return the full new settings
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
      jest.mock('../src/main/handlers/settingsHandlers', () => ({
        ...jest.requireActual('../src/main/handlers/settingsHandlers'),
        internalGetSettingsHandler: jest.fn().mockResolvedValue({
          success: true,
          settings: mockNewSettings,
        }),
      }));


      const result = await handlers['settings:update'](null, settingsData);

      expect(log).toHaveBeenCalledWith('Settings updated, restarting backup scheduler...');
      expect(backupManager.startScheduler).toHaveBeenCalledWith(mockNewSettings);
      expect(mockRefreshSettings).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle update errors', async () => {
      const settingsData = { backup_enabled: true };
      const error = new Error('Update failed');

      Joi.object().validateAsync = jest.fn().mockRejectedValue(error);

      const result = await handlers['settings:update'](null, settingsData);

      expect(logError).toHaveBeenCalledWith('Error in settings:update IPC wrapper:', error);
      expect(result).toEqual({
        success: false,
        message: 'Update failed'
      });
    });
  });

  describe('settings:getLogo', () => {
    it('should return regional logo when available', async () => {
      const mockSettings = {
        regional_local_logo_path: 'assets/logos/regional.png'
      };
      
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: 'assets/logos/regional.png' }
      ]);
      app.getPath.mockReturnValue('/user/data');
      fs.existsSync.mockReturnValue(true);

      const result = await handlers['settings:getLogo']();

      expect(path.join).toHaveBeenCalledWith('/user/data', 'assets/logos/regional.png');
      expect(result).toEqual({
        success: true,
        path: 'safe-image://assets/logos/regional.png'
      });
    });

    it('should fallback to national logo when regional not available', async () => {
      const mockSettings = {
        regional_local_logo_path: 'assets/logos/missing.png',
        national_logo_path: 'assets/logos/national.png'
      };
      
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: 'assets/logos/missing.png' },
        { key: 'national_logo_path', value: 'assets/logos/national.png' }
      ]);
      app.getPath.mockReturnValue('/user/data');
      fs.existsSync.mockReturnValueOnce(false) // regional logo missing
        .mockReturnValueOnce(true); // national logo exists

      const result = await handlers['settings:getLogo']();

      expect(result).toEqual({
        success: true,
        path: 'safe-image://assets/logos/national.png'
      });
    });

    it('should return null when no logos available', async () => {
      db.isDbOpen.mockReturnValue(true);
      // Ensure no logo paths are returned from the DB mock for this test
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: '' },
        { key: 'national_logo_path', value: '' },
      ]);
      app.getPath.mockReturnValue('/user/data');
      fs.existsSync.mockReturnValue(false); // Mock that no logo files exist

      const result = await handlers['settings:getLogo']();

      expect(result).toEqual({
        success: true,
        path: null,
      });
    });

    it('should return null when database is closed', async () => {
      db.isDbOpen.mockReturnValue(false);

      const result = await handlers['settings:getLogo']();

      expect(result).toEqual({
        success: true,
        path: null
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Logo error');
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockRejectedValue(error);

      const result = await handlers['settings:getLogo']();

      expect(logError).toHaveBeenCalledWith('Failed to get logo:', error);
      expect(result).toEqual({
        success: false,
        message: 'Error getting logo: Logo error'
      });
    });
  });

  describe('settings:uploadLogo', () => {
    it('should upload logo successfully', async () => {
      const mockFilePath = '/temp/logo.png';
      const mockDestPath = '/user/data/assets/logos/logo.png';

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mockFilePath],
      });
      app.getPath.mockReturnValue('/user/data');
      path.join.mockImplementation((...args) => args.join('/'));
      path.basename.mockReturnValue('logo.png');
      // Mock that the directory does not exist, so it gets created
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      const result = await handlers['settings:uploadLogo']();

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
      });
      expect(fs.mkdirSync).toHaveBeenCalledWith('user/data/assets/logos', { recursive: true });
      expect(fs.copyFileSync).toHaveBeenCalledWith(mockFilePath, expect.stringContaining('logo.png'));
      expect(result.success).toBe(true);
      expect(result.path).toContain('assets/logos/logo.png');
    });

    it('should handle user cancellation', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: true });

      const result = await handlers['settings:uploadLogo']();

      expect(result).toEqual({
        success: false,
        message: 'No file selected.'
      });
    });

    it('should handle no file selected', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: []
      });

      const result = await handlers['settings:uploadLogo']();

      expect(result).toEqual({
        success: false,
        message: 'No file selected.'
      });
    });

    it('should handle file copy failure', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/temp/logo.png']
      });
      fs.existsSync.mockReturnValue(false);

      const result = await handlers['settings:uploadLogo']();

      expect(result).toEqual({
        success: false,
        message: 'Failed to copy logo.'
      });
    });

    it('should handle upload errors', async () => {
      const error = new Error('Upload failed');
      dialog.showOpenDialog.mockRejectedValue(error);

      const result = await handlers['settings:uploadLogo']();

      expect(logError).toHaveBeenCalledWith('Failed to upload logo:', error);
      expect(result).toEqual({
        success: false,
        message: 'Error uploading logo: Upload failed'
      });
    });

    it('should create logos directory if it does not exist', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/temp/logo.png'],
      });
      app.getPath.mockReturnValue('/user/data');
      path.join.mockImplementation((...args) => args.join('/'));
      // Mock that the directory does not exist, then that the file copy succeeds
      fs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
      fs.mkdirSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});
      path.basename.mockReturnValue('logo.png');

      const result = await handlers['settings:uploadLogo']();

      expect(fs.mkdirSync).toHaveBeenCalledWith('user/data/assets/logos', { recursive: true });
      expect(result.success).toBe(true);
    });

    it('should not create directory if it already exists', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/temp/logo.png']
      });
      app.getPath.mockReturnValue('/user/data');
      fs.existsSync.mockReturnValueOnce(true) // Directory exists
        .mockReturnValueOnce(true); // File exists after copy
      fs.copyFileSync.mockImplementation(() => {});
      path.join.mockReturnValue('/user/data/assets/logos');
      path.basename.mockReturnValue('logo.png');

      const result = await handlers['settings:uploadLogo']();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});