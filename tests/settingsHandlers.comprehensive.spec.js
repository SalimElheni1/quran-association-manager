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
jest.mock('joi');
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

describe('settingsHandlers - Comprehensive Tests', () => {
  let handlers = {};
  let mockRefreshSettings;
  let mockValidationSchema;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Joi mock
    mockValidationSchema = {
      validateAsync: jest.fn(),
    };
    Joi.object.mockReturnValue(mockValidationSchema);
    Joi.string.mockReturnValue({
      allow: jest.fn().mockReturnValue({}),
    });
    Joi.boolean.mockReturnValue({});
    Joi.number.mockReturnValue({
      integer: jest.fn().mockReturnValue({
        min: jest.fn().mockReturnValue({
          max: jest.fn().mockReturnValue({
            required: jest.fn().mockReturnValue({}),
          }),
        }),
      }),
    });
    
    // Capture registered handlers
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockRefreshSettings = jest.fn();
    registerSettingsHandlers(mockRefreshSettings);
  });

  describe('internalGetSettingsHandler - Edge Cases', () => {
    it('should handle mixed data types correctly', async () => {
      const mockDbResults = [
        { key: 'national_association_name', value: 'Test Association' },
        { key: 'backup_enabled', value: 'true' },
        { key: 'backup_reminder_enabled', value: 'false' },
        { key: 'adultAgeThreshold', value: '21' },
        { key: 'backup_reminder_frequency_days', value: '14' },
        { key: 'empty_string_value', value: '' },
        { key: 'whitespace_value', value: '   ' },
        { key: 'zero_value', value: '0' },
        { key: 'false_string', value: 'false' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.success).toBe(true);
      expect(result.settings).toEqual(expect.objectContaining({
        national_association_name: 'Test Association',
        backup_enabled: true,
        backup_reminder_enabled: false,
        adultAgeThreshold: 21,
        backup_reminder_frequency_days: 14,
        empty_string_value: '',
        whitespace_value: '   ',
        zero_value: 0,
        false_string: false,
      }));
    });

    it('should handle numeric strings with decimals', async () => {
      const mockDbResults = [
        { key: 'decimal_value', value: '18.5' },
        { key: 'integer_value', value: '25' },
        { key: 'invalid_number', value: 'not_a_number' },
        { key: 'empty_number', value: '' },
        { key: 'whitespace_number', value: '  ' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.settings.decimal_value).toBe(18.5);
      expect(result.settings.integer_value).toBe(25);
      expect(result.settings.invalid_number).toBe('not_a_number');
      expect(result.settings.empty_number).toBe('');
      expect(result.settings.whitespace_number).toBe('  ');
    });

    it('should handle legacy key migration with conflicts', async () => {
      const mockDbResults = [
        { key: 'adult_age_threshold', value: '18' }, // Legacy key
        { key: 'adultAgeThreshold', value: '21' }, // New key should take precedence
        { key: 'another_legacy_key', value: 'legacy_value' },
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.settings.adultAgeThreshold).toBe(21);
      expect(result.settings).not.toHaveProperty('adult_age_threshold');
      expect(result.settings.another_legacy_key).toBe('legacy_value');
    });

    it('should merge with default settings correctly', async () => {
      const mockDbResults = [
        { key: 'national_association_name', value: 'Custom Name' },
        { key: 'backup_enabled', value: 'true' },
        // Missing other default settings
      ];
      db.allQuery.mockResolvedValue(mockDbResults);

      const result = await internalGetSettingsHandler();

      expect(result.settings).toEqual(expect.objectContaining({
        national_association_name: 'Custom Name',
        backup_enabled: true,
        regional_association_name: '', // Default value
        local_branch_name: '', // Default value
        backup_frequency: 'daily', // Default value
        adultAgeThreshold: 18, // Default value
      }));
    });

    it('should handle database query errors', async () => {
      const dbError = new Error('Database connection failed');
      db.allQuery.mockRejectedValue(dbError);

      await expect(internalGetSettingsHandler()).rejects.toThrow('Database connection failed');
    });
  });

  describe('internalUpdateSettingsHandler - Advanced Cases', () => {
    beforeEach(() => {
      mockValidationSchema.validateAsync.mockResolvedValue({});
      db.runQuery.mockResolvedValue({ changes: 1 });
    });

    it('should handle complex legacy key mapping', async () => {
      const settingsData = {
        adult_age_threshold: 22, // Legacy snake_case
        adultAgeThreshold: 25, // New camelCase (should be ignored in favor of legacy)
        national_association_name: 'Test Association',
        backup_enabled: true,
      };

      const expectedValidatedData = {
        adultAgeThreshold: 22, // Legacy value should be mapped
        national_association_name: 'Test Association',
        backup_enabled: true,
      };

      mockValidationSchema.validateAsync.mockResolvedValue(expectedValidatedData);

      const result = await internalUpdateSettingsHandler(settingsData);

      expect(mockValidationSchema.validateAsync).toHaveBeenCalledWith({
        adultAgeThreshold: 22, // Legacy key mapped to camelCase
        national_association_name: 'Test Association',
        backup_enabled: true,
      });
      expect(result.success).toBe(true);
    });

    it('should handle camelCase to snake_case conversion for database keys', async () => {
      const validatedData = {
        adultAgeThreshold: 25,
        national_association_name: 'Test',
        backup_enabled: true,
      };

      mockValidationSchema.validateAsync.mockResolvedValue(validatedData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await internalUpdateSettingsHandler(validatedData);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['25', 'adult_age_threshold'] // Should use snake_case for adultAgeThreshold
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['Test', 'national_association_name']
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['true', 'backup_enabled']
      );
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
    });

    it('should handle primary key update failure with fallback to alternate key', async () => {
      const validatedData = { adultAgeThreshold: 30 };
      mockValidationSchema.validateAsync.mockResolvedValue(validatedData);

      db.runQuery
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ changes: 0 }) // Primary key update fails
        .mockResolvedValueOnce({ changes: 1 }) // Fallback succeeds
        .mockResolvedValueOnce(); // COMMIT

      const result = await internalUpdateSettingsHandler(validatedData);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['30', 'adult_age_threshold'] // Primary key
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['30', 'adult_age_threshold'] // Fallback (same in this case)
      );
      expect(result.success).toBe(true);
    });

    it('should handle different data types in values', async () => {
      const validatedData = {
        national_association_name: 'Test',
        backup_enabled: true,
        adultAgeThreshold: 25,
        backup_reminder_frequency_days: 0,
        regional_association_name: null,
        local_branch_name: undefined,
      };

      mockValidationSchema.validateAsync.mockResolvedValue(validatedData);

      const result = await internalUpdateSettingsHandler(validatedData);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['Test', 'national_association_name']
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['true', 'backup_enabled']
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['25', 'adult_age_threshold']
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['0', 'backup_reminder_frequency_days']
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['', 'regional_association_name'] // null converted to empty string
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE settings SET value = ? WHERE key = ?',
        ['', 'local_branch_name'] // undefined converted to empty string
      );
    });

    it('should handle validation errors properly', async () => {
      const validationError = new Error('Validation failed: adultAgeThreshold must be a number');
      mockValidationSchema.validateAsync.mockRejectedValue(validationError);

      await expect(internalUpdateSettingsHandler({ adultAgeThreshold: 'invalid' }))
        .rejects.toThrow('Validation failed: adultAgeThreshold must be a number');

      expect(db.runQuery).not.toHaveBeenCalledWith('BEGIN TRANSACTION;');
    });

    it('should rollback transaction on database error', async () => {
      const validatedData = { backup_enabled: true };
      mockValidationSchema.validateAsync.mockResolvedValue(validatedData);

      const dbError = new Error('Database constraint violation');
      db.runQuery
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(dbError) // UPDATE fails
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(internalUpdateSettingsHandler(validatedData))
        .rejects.toThrow('فشل تحديث الإعدادات.');

      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
      expect(logError).toHaveBeenCalledWith('Failed to update settings:', dbError);
    });

    it('should handle transaction begin failure', async () => {
      const validatedData = { backup_enabled: true };
      mockValidationSchema.validateAsync.mockResolvedValue(validatedData);

      const dbError = new Error('Cannot begin transaction');
      db.runQuery.mockRejectedValueOnce(dbError); // BEGIN fails

      await expect(internalUpdateSettingsHandler(validatedData))
        .rejects.toThrow('فشل تحديث الإعدادات.');

      expect(logError).toHaveBeenCalledWith('Failed to update settings:', dbError);
    });
  });

  describe('IPC Handler - settings:get - Edge Cases', () => {
    it('should handle database closed state', async () => {
      db.isDbOpen.mockReturnValue(false);

      const result = await handlers['settings:get']();

      expect(db.allQuery).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        settings: {}
      });
    });

    it('should handle database query errors gracefully', async () => {
      db.isDbOpen.mockReturnValue(true);
      const dbError = new Error('Table does not exist');
      db.allQuery.mockRejectedValue(dbError);

      const result = await handlers['settings:get']();

      expect(logError).toHaveBeenCalledWith('Error in settings:get IPC wrapper:', dbError);
      expect(result).toEqual({
        success: false,
        message: 'Table does not exist'
      });
    });

    it('should handle successful settings retrieval', async () => {
      db.isDbOpen.mockReturnValue(true);
      const mockSettings = {
        national_association_name: 'Test Association',
        backup_enabled: true,
        adultAgeThreshold: 21,
      };
      db.allQuery.mockResolvedValue([
        { key: 'national_association_name', value: 'Test Association' },
        { key: 'backup_enabled', value: 'true' },
        { key: 'adultAgeThreshold', value: '21' },
      ]);

      const result = await handlers['settings:get']();

      expect(result.success).toBe(true);
      expect(result.settings).toEqual(expect.objectContaining(mockSettings));
    });
  });

  describe('IPC Handler - settings:update - Advanced Cases', () => {
    beforeEach(() => {
      mockValidationSchema.validateAsync.mockResolvedValue({});
      db.runQuery.mockResolvedValue({ changes: 1 });
    });

    it('should update settings and restart backup scheduler', async () => {
      const settingsData = {
        backup_enabled: true,
        backup_frequency: 'weekly',
        backup_path: '/custom/backup/path',
      };

      const mockNewSettings = {
        backup_enabled: true,
        backup_frequency: 'weekly',
        backup_path: '/custom/backup/path',
        national_association_name: 'Default',
      };

      mockValidationSchema.validateAsync.mockResolvedValue(settingsData);
      db.allQuery.mockResolvedValue([
        { key: 'backup_enabled', value: 'true' },
        { key: 'backup_frequency', value: 'weekly' },
        { key: 'backup_path', value: '/custom/backup/path' },
        { key: 'national_association_name', value: 'Default' },
      ]);

      const result = await handlers['settings:update'](null, settingsData);

      expect(log).toHaveBeenCalledWith('Settings updated, restarting backup scheduler...');
      expect(backupManager.startScheduler).toHaveBeenCalledWith(
        expect.objectContaining(mockNewSettings)
      );
      expect(mockRefreshSettings).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toBe('تم تحديث الإعدادات بنجاح.');
    });

    it('should handle backup scheduler restart failure', async () => {
      const settingsData = { backup_enabled: true };
      mockValidationSchema.validateAsync.mockResolvedValue(settingsData);
      db.allQuery.mockResolvedValue([{ key: 'backup_enabled', value: 'true' }]);
      
      const schedulerError = new Error('Scheduler restart failed');
      backupManager.startScheduler.mockImplementation(() => {
        throw schedulerError;
      });

      const result = await handlers['settings:update'](null, settingsData);

      expect(logError).toHaveBeenCalledWith('Error in settings:update IPC wrapper:', schedulerError);
      expect(result).toEqual({
        success: false,
        message: 'Scheduler restart failed'
      });
    });

    it('should handle settings retrieval failure after update', async () => {
      const settingsData = { backup_enabled: true };
      mockValidationSchema.validateAsync.mockResolvedValue(settingsData);
      
      // First call for update succeeds, second call for retrieval fails
      db.allQuery.mockRejectedValueOnce(new Error('Settings retrieval failed'));

      const result = await handlers['settings:update'](null, settingsData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Settings retrieval failed');
    });

    it('should handle validation errors in update', async () => {
      const settingsData = { adultAgeThreshold: -5 };
      const validationError = new Error('Age threshold must be positive');
      mockValidationSchema.validateAsync.mockRejectedValue(validationError);

      const result = await handlers['settings:update'](null, settingsData);

      expect(logError).toHaveBeenCalledWith('Error in settings:update IPC wrapper:', validationError);
      expect(result).toEqual({
        success: false,
        message: 'Age threshold must be positive'
      });
      expect(backupManager.startScheduler).not.toHaveBeenCalled();
    });
  });

  describe('IPC Handler - settings:getLogo - Advanced Cases', () => {
    beforeEach(() => {
      app.getPath.mockReturnValue('/mock/userData');
      path.join.mockImplementation((...args) => args.join('/'));
    });

    it('should return regional logo when both logos exist', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: 'assets/logos/regional.png' },
        { key: 'national_logo_path', value: 'assets/logos/national.png' },
      ]);
      fs.existsSync.mockReturnValue(true);

      const result = await handlers['settings:getLogo']();

      expect(path.join).toHaveBeenCalledWith('/mock/userData', 'assets/logos/regional.png');
      expect(result).toEqual({
        success: true,
        path: 'safe-image://assets/logos/regional.png'
      });
    });

    it('should fallback to national logo when regional does not exist', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: 'assets/logos/missing.png' },
        { key: 'national_logo_path', value: 'assets/logos/national.png' },
      ]);
      fs.existsSync
        .mockReturnValueOnce(false) // Regional logo missing
        .mockReturnValueOnce(true); // National logo exists

      const result = await handlers['settings:getLogo']();

      expect(path.join).toHaveBeenCalledWith('/mock/userData', 'assets/logos/missing.png');
      expect(path.join).toHaveBeenCalledWith('/mock/userData', 'assets/logos/national.png');
      expect(result).toEqual({
        success: true,
        path: 'safe-image://assets/logos/national.png'
      });
    });

    it('should return null when no logos are configured', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: '' },
        { key: 'national_logo_path', value: '' },
      ]);

      const result = await handlers['settings:getLogo']();

      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        path: null
      });
    });

    it('should return null when no logos exist on filesystem', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: 'assets/logos/missing1.png' },
        { key: 'national_logo_path', value: 'assets/logos/missing2.png' },
      ]);
      fs.existsSync.mockReturnValue(false);

      const result = await handlers['settings:getLogo']();

      expect(result).toEqual({
        success: true,
        path: null
      });
    });

    it('should handle database closed state', async () => {
      db.isDbOpen.mockReturnValue(false);

      const result = await handlers['settings:getLogo']();

      expect(db.allQuery).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        path: null
      });
    });

    it('should handle database errors', async () => {
      db.isDbOpen.mockReturnValue(true);
      const dbError = new Error('Logo settings query failed');
      db.allQuery.mockRejectedValue(dbError);

      const result = await handlers['settings:getLogo']();

      expect(logError).toHaveBeenCalledWith('Failed to get logo:', dbError);
      expect(result).toEqual({
        success: false,
        message: 'Error getting logo: Logo settings query failed'
      });
    });

    it('should handle filesystem access errors', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'regional_local_logo_path', value: 'assets/logos/logo.png' },
      ]);
      
      const fsError = new Error('Permission denied');
      fs.existsSync.mockImplementation(() => {
        throw fsError;
      });

      const result = await handlers['settings:getLogo']();

      expect(logError).toHaveBeenCalledWith('Failed to get logo:', fsError);
      expect(result).toEqual({
        success: false,
        message: 'Error getting logo: Permission denied'
      });
    });
  });

  describe('IPC Handler - settings:uploadLogo - Comprehensive Cases', () => {
    beforeEach(() => {
      app.getPath.mockReturnValue('/mock/userData');
      path.join.mockImplementation((...args) => args.join('/'));
      path.basename.mockImplementation((filePath) => filePath.split('/').pop());
    });

    it('should upload logo successfully when directory exists', async () => {
      const mockFilePath = '/temp/uploaded-logo.png';
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mockFilePath]
      });
      fs.existsSync.mockReturnValue(true); // Directory exists
      fs.copyFileSync.mockImplementation(() => {}); // Successful copy

      const result = await handlers['settings:uploadLogo']();

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
      });
      expect(fs.mkdirSync).not.toHaveBeenCalled(); // Directory already exists
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        mockFilePath,
        '/mock/userData/assets/logos/uploaded-logo.png'
      );
      expect(result).toEqual({
        success: true,
        path: 'assets/logos/uploaded-logo.png'
      });
    });

    it('should create directory and upload logo when directory does not exist', async () => {
      const mockFilePath = '/temp/new-logo.jpg';
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mockFilePath]
      });
      fs.existsSync.mockReturnValue(false); // Directory doesn't exist
      fs.mkdirSync.mockImplementation(() => {}); // Successful directory creation
      fs.copyFileSync.mockImplementation(() => {}); // Successful copy

      const result = await handlers['settings:uploadLogo']();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/mock/userData/assets/logos',
        { recursive: true }
      );
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        mockFilePath,
        '/mock/userData/assets/logos/new-logo.jpg'
      );
      expect(result).toEqual({
        success: true,
        path: 'assets/logos/new-logo.jpg'
      });
    });

    it('should handle user cancellation', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: true });

      const result = await handlers['settings:uploadLogo']();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.copyFileSync).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'No file selected.'
      });
    });

    it('should handle empty file selection', async () => {
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

    it('should handle null file paths', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: null
      });

      const result = await handlers['settings:uploadLogo']();

      expect(result).toEqual({
        success: false,
        message: 'No file selected.'
      });
    });

    it('should handle directory creation failure', async () => {
      const mockFilePath = '/temp/logo.png';
      dialog.showOpenDialog.mkResolvedValue({
        canceled: false,
        filePaths: [mockFilePath]
      });
      fs.existsSync.mockReturnValue(false);
      
      const dirError = new Error('Permission denied to create directory');
      fs.mkdirSync.mockImplementation(() => {
        throw dirError;
      });

      const result = await handlers['settings:uploadLogo']();

      expect(logError).toHaveBeenCalledWith('Failed to upload logo:', dirError);
      expect(result).toEqual({
        success: false,
        message: 'Error uploading logo: Permission denied to create directory'
      });
    });

    it('should handle file copy failure', async () => {
      const mockFilePath = '/temp/logo.png';
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mockFilePath]
      });
      fs.existsSync.mockReturnValue(true);
      
      const copyError = new Error('Disk full');
      fs.copyFileSync.mockImplementation(() => {
        throw copyError;
      });

      const result = await handlers['settings:uploadLogo']();

      expect(logError).toHaveBeenCalledWith('Failed to upload logo:', copyError);
      expect(result).toEqual({
        success: false,
        message: 'Error uploading logo: Disk full'
      });
    });

    it('should handle dialog open failure', async () => {
      const dialogError = new Error('Dialog service unavailable');
      dialog.showOpenDialog.mockRejectedValue(dialogError);

      const result = await handlers['settings:uploadLogo']();

      expect(logError).toHaveBeenCalledWith('Failed to upload logo:', dialogError);
      expect(result).toEqual({
        success: false,
        message: 'Error uploading logo: Dialog service unavailable'
      });
    });

    it('should handle complex file paths with special characters', async () => {
      const mockFilePath = '/temp/لوجو جديد.png'; // Arabic filename
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mockFilePath]
      });
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});

      const result = await handlers['settings:uploadLogo']();

      expect(fs.copyFileSync).toHaveBeenCalledWith(
        mockFilePath,
        '/mock/userData/assets/logos/لوجو جديد.png'
      );
      expect(result.path).toBe('assets/logos/لوجو جديد.png');
    });

    it('should handle multiple file selection (should use first file)', async () => {
      const mockFilePaths = ['/temp/logo1.png', '/temp/logo2.jpg'];
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: mockFilePaths
      });
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});

      const result = await handlers['settings:uploadLogo']();

      expect(fs.copyFileSync).toHaveBeenCalledWith(
        '/temp/logo1.png', // Should use first file
        '/mock/userData/assets/logos/logo1.png'
      );
      expect(result.path).toBe('assets/logos/logo1.png');
    });

    it('should normalize path separators to forward slashes', async () => {
      const mockFilePath = '/temp/logo.png';
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mockFilePath]
      });
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});
      
      // Mock path.join to return backslashes (Windows style)
      path.join.mockImplementation((...args) => args.join('\\'));

      const result = await handlers['settings:uploadLogo']();

      // Result should still use forward slashes
      expect(result.path).toBe('assets/logos/logo.png');
    });
  });

  describe('Internal Helper Functions', () => {
    describe('internalCopyLogoAsset', () => {
      beforeEach(() => {
        app.getPath.mockReturnValue('/mock/userData');
        path.join.mockImplementation((...args) => args.join('/'));
        path.basename.mockImplementation((filePath) => filePath.split('/').pop());
      });

      it('should return null for empty temp path', async () => {
        const { internalCopyLogoAsset } = require('../src/main/handlers/settingsHandlers');
        
        const result = await internalCopyLogoAsset('');
        expect(result).toBeNull();
        
        const result2 = await internalCopyLogoAsset(null);
        expect(result2).toBeNull();
      });

      it('should return null for non-existent file', async () => {
        const { internalCopyLogoAsset } = require('../src/main/handlers/settingsHandlers');
        fs.existsSync.mockReturnValue(false);
        
        const result = await internalCopyLogoAsset('/nonexistent/file.png');
        expect(result).toBeNull();
      });

      it('should copy file and return relative path', async () => {
        const { internalCopyLogoAsset } = require('../src/main/handlers/settingsHandlers');
        fs.existsSync.mockReturnValueOnce(false) // Directory doesn't exist
          .mockReturnValueOnce(true); // File exists
        fs.mkdirSync.mockImplementation(() => {});
        fs.copyFileSync.mockImplementation(() => {});
        
        const result = await internalCopyLogoAsset('/temp/test-logo.png');
        
        expect(fs.mkdirSync).toHaveBeenCalledWith(
          '/mock/userData/assets/logos',
          { recursive: true }
        );
        expect(fs.copyFileSync).toHaveBeenCalledWith(
          '/temp/test-logo.png',
          '/mock/userData/assets/logos/test-logo.png'
        );
        expect(result).toBe('assets/logos/test-logo.png');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle unexpected errors in handler registration', () => {
      const originalHandle = ipcMain.handle;
      ipcMain.handle.mockImplementation(() => {
        throw new Error('IPC registration failed');
      });

      expect(() => registerSettingsHandlers(jest.fn())).toThrow('IPC registration failed');
      
      ipcMain.handle = originalHandle;
    });

    it('should handle null refresh settings callback', () => {
      expect(() => registerSettingsHandlers(null)).not.toThrow();
    });

    it('should handle database connection issues during settings operations', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockRejectedValue(new Error('Connection lost'));

      const result = await handlers['settings:get']();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection lost');
    });
  });
});