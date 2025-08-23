const { registerSettingsHandlers } = require('../src/main/handlers/settingsHandlers');
const { ipcMain } = require('electron');
const db = require('../src/db/db');
const backupManager = require('../src/main/backupManager');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('../src/main/backupManager');
// Mock settingsManager and get a reference to the mock function
const mockRefreshSettings = jest.fn();
jest.mock('../src/main/settingsManager', () => ({
  refreshSettings: mockRefreshSettings,
}));

describe('Settings Handlers', () => {
  beforeAll(() => {
    // Pass the mocked function to the handler registration
    registerSettingsHandlers(mockRefreshSettings);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('settings:get', () => {
    it('should fetch and format settings correctly', async () => {
      const mockDbResult = [
        { key: 'national_association_name', value: 'Test Association' },
        { key: 'backup_enabled', value: 'true' },
        { key: 'president_full_name', value: 'John Doe' },
      ];
      db.isDbOpen.mockReturnValue(true); // Mock that the DB is open
      db.allQuery.mockResolvedValue(mockDbResult);

      const result = await ipcMain.invoke('settings:get');

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

  describe('settings:update', () => {
    const mockSettings = {
      national_association_name: 'New Name',
      backup_enabled: false,
      adultAgeThreshold: 18,
      backup_frequency: 'daily',
    };

    it('should update settings successfully', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.allQuery.mockResolvedValue([]); // Mock the nested call to getSettingsHandler

      const result = await ipcMain.invoke('settings:update', mockSettings);

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
      expect(backupManager.startScheduler).toHaveBeenCalled();
      expect(mockRefreshSettings).toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: 'تم تحديث الإعدادات بنجاح.' });
    });

    it('should rollback transaction on error', async () => {
      db.runQuery
        .mockResolvedValueOnce() // for BEGIN
        .mockRejectedValueOnce(new Error('DB write error')); // Fail on first UPDATE

      const result = await ipcMain.invoke('settings:update', mockSettings);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
      expect(result.success).toBe(false);
      expect(result.message).toBe('فشل تحديث الإعدادات.');
    });
  });
});
