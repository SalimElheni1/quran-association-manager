const { getSettingsHandler, updateSettingsHandler } = require('../src/main/settingsHandlers');
const db = require('../src/db/db');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('fs');
jest.mock('path');

describe('Settings Handlers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettingsHandler', () => {
    it('should fetch and format settings correctly', async () => {
      const mockDbResult = [
        { key: 'national_association_name', value: 'Test Association' },
        { key: 'backup_enabled', value: 'true' },
        { key: 'president_full_name', value: 'John Doe' },
      ];
      db.allQuery.mockResolvedValue(mockDbResult);

      const result = await getSettingsHandler();

      expect(db.allQuery).toHaveBeenCalledWith('SELECT key, value FROM settings');
      expect(result).toEqual({
        success: true,
        settings: {
          national_association_name: 'Test Association',
          backup_enabled: true,
          president_full_name: 'John Doe',
        },
      });
    });
  });

  describe('updateSettingsHandler', () => {
    const mockApp = {
      getPath: jest.fn().mockReturnValue('/mock/userData'),
    };
    const mockSettings = {
      national_association_name: 'New Name',
      backup_enabled: false,
      adultAgeThreshold: 18,
      backup_frequency: 'daily',
    };

    it('should update settings successfully without file copy', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await updateSettingsHandler(mockSettings);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('UPDATE settings SET value = ? WHERE key = ?', [
        'New Name',
        'national_association_name',
      ]);
      expect(db.runQuery).toHaveBeenCalledWith('UPDATE settings SET value = ? WHERE key = ?', [
        'false',
        'backup_enabled',
      ]);
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(result).toEqual({ success: true, message: 'تم تحديث الإعدادات بنجاح.' });
    });

    it('should correctly save a relative logo path', async () => {
      const settingsWithLogo = {
        ...mockSettings,
        national_logo_path: 'assets/logos/logo.png', // It now receives a relative path
      };
      db.runQuery.mockResolvedValue({ changes: 1 });

      await updateSettingsHandler(settingsWithLogo);

      // It should NOT attempt any file system operations
      expect(fs.copyFileSync).not.toHaveBeenCalled();

      // It should just save the relative path it was given
      expect(db.runQuery).toHaveBeenCalledWith('UPDATE settings SET value = ? WHERE key = ?', [
        'assets/logos/logo.png',
        'national_logo_path',
      ]);
    });

    it('should rollback transaction on error', async () => {
      db.runQuery
        .mockResolvedValueOnce() // for BEGIN
        .mockRejectedValueOnce(new Error('DB write error')); // Fail on first UPDATE

      await expect(updateSettingsHandler(mockSettings, mockApp)).rejects.toThrow('فشل تحديث الإعدادات.');

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
    });
  });
});
