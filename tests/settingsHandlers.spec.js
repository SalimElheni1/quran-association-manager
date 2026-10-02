// tests/settingsHandlers.spec.js

// Mock dependencies at the top level
jest.mock('electron');
jest.mock('../src/db/db');
jest.mock('fs');
jest.mock('../src/main/backupManager');
jest.mock('../src/main/logger');
// settings:update restarts the fee scheduler; a real 24h interval would keep Jest from exiting.
jest.mock('../src/main/feeChargeScheduler');
jest.mock('../src/main/handlers/studentFeeHandlers', () => ({
  checkAndGenerateChargesForAllStudents: jest.fn(),
}));

// Note: 'joi' is automatically mocked by the jest.config.js moduleNameMapper

const {
  registerSettingsHandlers,
  internalGetSettingsHandler,
  internalUpdateSettingsHandler,
} = require('../src/main/handlers/settingsHandlers');
const { ipcMain, app, dialog } = require('electron');
const Joi = require('joi');
const db = require('../src/db/db');
const fs = require('fs');
const path = require('path'); // Use the real path module
const backupManager = require('../src/main/backupManager');
const { log, error: logError } = require('../src/main/logger');
const {
  checkAndGenerateChargesForAllStudents,
} = require('../src/main/handlers/studentFeeHandlers');

describe('settingsHandlers', () => {
  let handlers = {};
  let mockRefreshSettings;

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
      expect(result.settings).toEqual(
        expect.objectContaining({
          national_association_name: 'Custom National',
          backup_enabled: true,
          adultAgeThreshold: 21,
          backup_frequency: 'daily', // from default
        }),
      );
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
      const settingsData = {
        national_association_name: 'Updated National',
        adultAgeThreshold: 20,
      };
      // Validation gets the payload after unknown keys are filtered out.
      Joi.object().validateAsync.mockImplementation((data) => Promise.resolve(data));
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await internalUpdateSettingsHandler(settingsData);

      expect(result.success).toBe(true);
      expect(db.withTransaction).toHaveBeenCalledTimes(1);
      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['national_association_name', 'Updated National'],
      );
      // Not a settings key: never written.
      expect(db.runQuery).not.toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['adultAgeThreshold', expect.anything()],
      );
    });

    it('should keep the bundled national logo, which is not in userData', async () => {
      app.isPackaged = false; // a development run: bundled images are in public/
      Joi.object().validateAsync.mockImplementation((data) => Promise.resolve(data));
      db.runQuery.mockResolvedValue({ changes: 1 });
      const bundledLogo = path.resolve(__dirname, '..', 'public', 'g247.png');
      fs.existsSync.mockImplementation((p) => p === bundledLogo);

      await internalUpdateSettingsHandler({ national_logo_path: 'g247.png' });

      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['national_logo_path', 'g247.png'],
      );
    });

    it('should fall back to the default logo when the logo file is missing', async () => {
      app.isPackaged = false; // a development run: bundled images are in public/
      Joi.object().validateAsync.mockImplementation((data) => Promise.resolve(data));
      db.runQuery.mockResolvedValue({ changes: 1 });
      fs.existsSync.mockReturnValue(false);

      await internalUpdateSettingsHandler({ national_logo_path: 'assets/logos/gone.png' });

      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['national_logo_path', 'assets/logos/icon.png'],
      );
    });

    it('should store values as strings and empty values as an empty string', async () => {
      const settingsData = { backup_enabled: false, charge_generation_day: 20, backup_path: null };
      Joi.object().validateAsync.mockResolvedValue(settingsData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      await internalUpdateSettingsHandler(settingsData);

      const saved = db.runQuery.mock.calls.map(([, params]) => params);
      expect(saved).toEqual([
        ['backup_enabled', 'false'],
        ['charge_generation_day', '20'],
        ['backup_path', ''],
      ]);
    });

    it('should report a failed save in Arabic', async () => {
      const dbError = new Error('Database error');
      Joi.object().validateAsync.mockResolvedValue({ name: 'test' });
      db.runQuery.mockRejectedValueOnce(dbError); // First UPDATE fails

      await expect(internalUpdateSettingsHandler({ name: 'test' })).rejects.toThrow(
        'فشل تحديث الإعدادات.',
      );

      expect(logError).toHaveBeenCalledWith('Failed to update settings:', dbError);
    });

    it('should re-throw validation errors', async () => {
      const validationError = new Error('Validation failed');
      Joi.object().validateAsync.mockRejectedValue(validationError);

      await expect(internalUpdateSettingsHandler({})).rejects.toThrow(validationError);
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

    it('should never send the association transfer key to the window', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([{ key: 'association_transfer_key', value: 'SECRET-KEY-123' }]);

      const result = await handlers['settings:get']();

      expect(result.settings).not.toHaveProperty('association_transfer_key');
      expect(JSON.stringify(result)).not.toContain('SECRET-KEY-123');
      expect(result.settings.has_transfer_key).toBe(true);
    });

    it('should tell the window when no transfer key is set', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([{ key: 'association_transfer_key', value: '' }]);

      const result = await handlers['settings:get']();

      expect(result.settings.has_transfer_key).toBe(false);
    });
  });

  describe('settings:getLogo', () => {
    it('should return the bundled default national logo', async () => {
      app.isPackaged = false; // a development run: bundled images are in public/
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([{ key: 'national_logo_path', value: 'g247.png' }]);
      const bundledLogo = path.resolve(__dirname, '..', 'public', 'g247.png');
      fs.existsSync.mockImplementation((p) => p === bundledLogo);

      const result = await handlers['settings:getLogo']();

      expect(result).toEqual({ success: true, path: 'safe-image://g247.png' });
    });

    it('should prefer the local branch logo', async () => {
      app.isPackaged = false;
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([
        { key: 'national_logo_path', value: 'g247.png' },
        { key: 'regional_local_logo_path', value: 'assets/logos/branch.png' },
      ]);
      fs.existsSync.mockReturnValue(true);

      const result = await handlers['settings:getLogo']();

      expect(result.path).toBe('safe-image://assets/logos/branch.png');
    });

    it('should return no logo when none of the files exists', async () => {
      app.isPackaged = false;
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue([{ key: 'national_logo_path', value: 'gone.png' }]);
      fs.existsSync.mockReturnValue(false);

      const result = await handlers['settings:getLogo']();

      expect(result).toEqual({ success: true, path: null });
    });
  });

  describe('settings:update', () => {
    it('should update settings and restart backup scheduler', async () => {
      const settingsData = { backup_enabled: true };
      const mockNewSettings = { backup_enabled: true, backup_frequency: 'daily' };

      // Mock the dependencies of the entire flow
      Joi.object().validateAsync.mockResolvedValue(settingsData);
      db.runQuery.mockResolvedValue({ changes: 1 }); // for the update
      db.allQuery.mockResolvedValue([
        // for the get settings call after update
        { key: 'backup_enabled', value: 'true' },
        { key: 'backup_frequency', value: 'daily' },
      ]);

      await handlers['settings:update'](null, settingsData);

      expect(log).toHaveBeenCalledWith('Settings updated, restarting backup scheduler...');
      expect(backupManager.startScheduler).toHaveBeenCalledWith(
        expect.objectContaining(mockNewSettings),
      );
      expect(mockRefreshSettings).toHaveBeenCalled();
    });

    it('should not change the transfer key (it has its own password-checked channel)', async () => {
      Joi.object().validateAsync.mockImplementation((data) => Promise.resolve(data));
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.allQuery.mockResolvedValue([]);

      await handlers['settings:update'](null, {
        local_branch_name: 'فرع ساقية الزيت',
        association_transfer_key: 'typed-in-the-window',
      });

      const writtenKeys = db.runQuery.mock.calls.map(([, params]) => params && params[0]);
      expect(writtenKeys).toContain('local_branch_name');
      expect(writtenKeys).not.toContain('association_transfer_key');
    });

    it('should never write the association transfer key to the log', async () => {
      const settingsData = { association_transfer_key: 'SECRET-KEY-123' };
      Joi.object().validateAsync.mockResolvedValue(settingsData);
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.allQuery.mockResolvedValue([{ key: 'association_transfer_key', value: 'SECRET-KEY-123' }]);

      await handlers['settings:update'](null, settingsData);

      const logged = log.mock.calls.flat().map(String).join('\n');
      expect(logged).not.toContain('SECRET-KEY-123');
      expect(logged).toContain('[redacted]');
    });
  });

  describe('settings:update - fee changes and charge generation', () => {
    const settingsRows = (settings) =>
      Object.entries(settings).map(([key, value]) => ({ key, value: String(value) }));

    // settings:update reads the settings before and after saving.
    const mockSettingsBeforeAndAfter = (before, after) => {
      db.allQuery
        .mockResolvedValueOnce(settingsRows(before))
        .mockResolvedValueOnce(settingsRows(after));
    };

    beforeEach(() => {
      Joi.object().validateAsync.mockImplementation((data) => Promise.resolve(data));
      db.runQuery.mockResolvedValue({ changes: 1 });
      checkAndGenerateChargesForAllStudents.mockResolvedValue({
        success: true,
        studentsProcessed: 3,
      });
    });

    it('generates the charges when fees are set for the first time', async () => {
      mockSettingsBeforeAndAfter(
        { annual_fee: 0, standard_monthly_fee: 0, auto_charge_generation_enabled: false },
        { annual_fee: 100, standard_monthly_fee: 0, auto_charge_generation_enabled: false },
      );

      const result = await handlers['settings:update'](null, { annual_fee: 100 });

      expect(checkAndGenerateChargesForAllStudents).toHaveBeenCalledWith(
        expect.objectContaining({ annual_fee: 100 }),
      );
      expect(result).toEqual({
        success: true,
        message: 'تم تحديث الإعدادات بنجاح. تم توليد الرسوم لجميع الطلاب بنجاح.',
      });
    });

    it('regenerates the charges when fees change and automatic generation is on', async () => {
      mockSettingsBeforeAndAfter(
        { annual_fee: 100, standard_monthly_fee: 20, auto_charge_generation_enabled: true },
        { annual_fee: 100, standard_monthly_fee: 25, auto_charge_generation_enabled: true },
      );

      await handlers['settings:update'](null, { standard_monthly_fee: 25 });

      expect(checkAndGenerateChargesForAllStudents).toHaveBeenCalledTimes(1);
    });

    it('does not regenerate the charges when automatic generation is off', async () => {
      mockSettingsBeforeAndAfter(
        { annual_fee: 100, standard_monthly_fee: 20, auto_charge_generation_enabled: false },
        { annual_fee: 100, standard_monthly_fee: 25, auto_charge_generation_enabled: false },
      );

      const result = await handlers['settings:update'](null, { standard_monthly_fee: 25 });

      expect(checkAndGenerateChargesForAllStudents).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: 'تم تحديث الإعدادات بنجاح.' });
    });

    it('does not generate anything when the fees did not change', async () => {
      const unchanged = {
        annual_fee: 100,
        standard_monthly_fee: 20,
        auto_charge_generation_enabled: true,
      };
      mockSettingsBeforeAndAfter(unchanged, { ...unchanged, backup_time: '03:00' });

      await handlers['settings:update'](null, { backup_time: '03:00' });

      expect(checkAndGenerateChargesForAllStudents).not.toHaveBeenCalled();
    });

    it('reports a charge generation failure to the user', async () => {
      mockSettingsBeforeAndAfter(
        { annual_fee: 0, standard_monthly_fee: 0 },
        { annual_fee: 100, standard_monthly_fee: 0 },
      );
      checkAndGenerateChargesForAllStudents.mockRejectedValue(new Error('Charge error'));

      const result = await handlers['settings:update'](null, { annual_fee: 100 });

      expect(result).toEqual({ success: false, message: 'Charge error' });
      expect(mockRefreshSettings).not.toHaveBeenCalled();
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
      // Make existsSync specific: return false only for the directory we want to create
      fs.existsSync.mockImplementation((p) => p !== mockDestDir);

      await handlers['settings:uploadLogo']();

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockDestDir, { recursive: true });
      expect(fs.copyFileSync).toHaveBeenCalledWith(mockTempPath, mockDestFile);
    });

    it('should return success and relative path on successful upload', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/logo.png'] });
      app.getPath.mockReturnValue('/user/data');
      fs.existsSync.mockReturnValue(true);
      // Spy on path.basename for this test since we are using the real path module
      const basenameSpy = jest.spyOn(path, 'basename').mockReturnValue('logo.png');

      const result = await handlers['settings:uploadLogo']();

      expect(result.success).toBe(true);
      expect(result.path).toBe('assets/logos/logo.png');

      basenameSpy.mockRestore();
    });
  });
});
