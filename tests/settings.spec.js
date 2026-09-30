// tests/settings.spec.js

// Mock dependencies at the top level
jest.mock('electron');
jest.mock('../src/db/db');
jest.mock('../src/main/backupManager');
// settings:update restarts the fee scheduler; its real 24-hour interval kept the Jest worker alive.
jest.mock('../src/main/feeChargeScheduler');
jest.mock('../src/main/logger');
// Joi is mocked globally via jest.config.js
jest.mock('../src/main/settingsManager');

const { registerSettingsHandlers } = require('../src/main/handlers/settingsHandlers');
const { ipcMain } = require('electron');
const db = require('../src/db/db');
const backupManager = require('../src/main/backupManager');
const feeChargeScheduler = require('../src/main/feeChargeScheduler');
const Joi = require('joi');

describe('Settings Handlers IPC', () => {
  let handlers = {};
  let mockRefreshSettings;

  beforeEach(() => {
    jest.clearAllMocks();

    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockRefreshSettings = jest.fn();
    registerSettingsHandlers(mockRefreshSettings);

    Joi.object().validateAsync.mockImplementation((data) => Promise.resolve(data));
  });

  describe('settings:get', () => {
    it('should fetch and format settings correctly', async () => {
      const mockDbResult = [{ key: 'backup_enabled', value: 'true' }];
      db.isDbOpen.mockReturnValue(true);
      db.allQuery.mockResolvedValue(mockDbResult);

      const result = await handlers['settings:get']();

      expect(result.success).toBe(true);
      expect(result.settings.backup_enabled).toBe(true);
    });

    it('should return empty settings without reading while the database is closed', async () => {
      db.isDbOpen.mockReturnValue(false);

      const result = await handlers['settings:get']();

      expect(result).toEqual({ success: true, settings: {} });
      expect(db.allQuery).not.toHaveBeenCalled();
    });
  });

  describe('settings:update', () => {
    const mockSettings = { national_association_name: 'New Name' };

    it('should save the settings and restart both schedulers with the saved values', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.allQuery.mockResolvedValue([{ key: 'national_association_name', value: 'New Name' }]);

      const result = await handlers['settings:update'](null, mockSettings);

      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['national_association_name', 'New Name'],
      );
      const expectedSettings = expect.objectContaining({
        national_association_name: 'New Name',
      });
      expect(backupManager.startScheduler).toHaveBeenCalledWith(expectedSettings);
      expect(feeChargeScheduler.startScheduler).toHaveBeenCalledWith(expectedSettings);
      expect(mockRefreshSettings).toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: 'تم تحديث الإعدادات بنجاح.' });
    });

    it('should report a failed save without restarting the schedulers', async () => {
      db.allQuery.mockResolvedValue([]);
      db.runQuery.mockRejectedValueOnce(new Error('DB write error'));

      const result = await handlers['settings:update'](null, mockSettings);

      expect(result.success).toBe(false);
      expect(result.message).toContain('فشل تحديث الإعدادات.');
      expect(backupManager.startScheduler).not.toHaveBeenCalled();
      expect(feeChargeScheduler.startScheduler).not.toHaveBeenCalled();
      expect(mockRefreshSettings).not.toHaveBeenCalled();
    });
  });
});
