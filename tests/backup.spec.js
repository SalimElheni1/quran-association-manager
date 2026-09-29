const { runBackup, isBackupDue } = require('../src/main/backupManager');
const db = require('../src/db/db');
const fs = require('fs').promises;
const Store = require('electron-store');
const PizZip = require('pizzip');
const keyManager = require('../src/main/keyManager');

jest.mock('pizzip', () => {
  const mockFile = jest.fn();
  const mockGenerate = jest.fn().mockReturnValue(Buffer.from('mock-zip-bytes'));
  const MockPizZip = jest.fn(() => ({
    file: mockFile,
    generate: mockGenerate,
  }));
  MockPizZip.mockInstance = { file: mockFile, generate: mockGenerate };
  return MockPizZip;
});
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(),
    stat: jest.fn().mockResolvedValue({ size: 100 }),
  },
  existsSync: jest.fn().mockReturnValue(false),
}));
jest.mock('../src/main/keyManager');

const mockStore = new Store();

describe('Backup Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PizZip.mockClear();
    keyManager.getDbKey.mockReturnValue('mock-db-key');
    // Provide a default mock implementation for all tests
    db.allQuery.mockResolvedValue([]);
  });

  describe('runBackup (New SQL-based Logic)', () => {
    const mockSettings = {
      backup_enabled: true,
    };
    const backupFilePath = '/mock/backup-path/backup-test.qdb';
    const mockSalt = 'mock-salt-12345';

    it('should generate a SQL backup successfully', async () => {
      keyManager.getDbSalt.mockReturnValue(mockSalt);
      db.allQuery
        .mockResolvedValueOnce([{ name: 'students' }])
        .mockResolvedValueOnce([{ id: 1, name: "Alice's" }]);

      const result = await runBackup(mockSettings, backupFilePath);

      expect(keyManager.getDbSalt).toHaveBeenCalledTimes(1);
      expect(db.allQuery).toHaveBeenCalledWith(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'",
      );
      expect(db.allQuery).toHaveBeenCalledWith('SELECT * FROM "students"');
      const generatedSql = PizZip.mockInstance.file.mock.calls[0][1];
      expect(generatedSql).toContain(
        'REPLACE INTO "students" ("id", "name") VALUES (1, \'Alice\'\'s\');',
      );
      expect(PizZip).toHaveBeenCalledTimes(1);
      expect(PizZip.mockInstance.file).toHaveBeenCalledWith('backup.sql', expect.any(String));

      // Verify the salt config is now created in memory and added to the zip
      const saltConfigCall = PizZip.mockInstance.file.mock.calls.find(
        (call) => call[0] === 'salt.json',
      );
      expect(saltConfigCall).toBeDefined();
      const saltConfigContent = JSON.parse(saltConfigCall[1].toString());
      expect(saltConfigContent).toEqual({ 'db-salt': mockSalt });

      expect(PizZip.mockInstance.generate).toHaveBeenCalledWith({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
      expect(fs.writeFile).toHaveBeenCalledWith(backupFilePath, expect.any(Buffer));
      expect(mockStore.set).toHaveBeenCalledWith(
        'last_backup_status',
        expect.objectContaining({ success: true }),
      );
      expect(result.success).toBe(true);
    });

    it('should call getDbSalt to ensure salt exists', async () => {
      keyManager.getDbSalt.mockReturnValue(mockSalt);
      await runBackup(mockSettings, backupFilePath);
      expect(keyManager.getDbSalt).toHaveBeenCalledTimes(1);
    });

    it('should handle database query errors gracefully', async () => {
      keyManager.getDbSalt.mockReturnValue(mockSalt);
      const dbError = new Error('Database connection failed');
      db.allQuery.mockRejectedValue(dbError);

      const result = await runBackup(mockSettings, backupFilePath);

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(mockStore.set).toHaveBeenCalledWith(
        'last_backup_status',
        expect.objectContaining({
          success: false,
          message: expect.stringContaining(dbError.message),
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe('isBackupDue', () => {
    it('should be due if no previous backup exists', () => {
      mockStore.get.mockReturnValue(null);
      expect(isBackupDue({})).toBe(true);
    });

    it('should be due for daily backup after 24 hours', () => {
      const oneDayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      mockStore.get.mockReturnValue({ timestamp: oneDayAgo });
      expect(isBackupDue({ backup_frequency: 'daily' })).toBe(true);
    });

    it('should not be due for daily backup within 24 hours', () => {
      const fewHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      mockStore.get.mockReturnValue({ timestamp: fewHoursAgo });
      expect(isBackupDue({ backup_frequency: 'daily' })).toBe(false);
    });

    it('should be due for weekly backup after 7 days', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      mockStore.get.mockReturnValue({ timestamp: eightDaysAgo });
      expect(isBackupDue({ backup_frequency: 'weekly' })).toBe(true);
    });

    describe('with a backup time already passed today', () => {
      const pastTime = () => {
        const d = new Date(Date.now() - 60 * 60 * 1000); // an hour ago, today when possible
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

      beforeEach(() => {
        // Keep "an hour ago" on today's date.
        jest.useFakeTimers({ now: new Date(2026, 8, 29, 14, 0, 0) });
      });
      afterEach(() => jest.useRealTimers());

      it('runs a daily backup that has not run today', () => {
        mockStore.get.mockReturnValue({ timestamp: daysAgo(1) });
        expect(isBackupDue({ backup_frequency: 'daily', backup_time: pastTime() })).toBe(true);
      });

      it('does not run a weekly backup two days after the last one', () => {
        mockStore.get.mockReturnValue({ timestamp: daysAgo(2) });
        expect(isBackupDue({ backup_frequency: 'weekly', backup_time: pastTime() })).toBe(false);
      });

      it('runs a weekly backup on its seventh day', () => {
        mockStore.get.mockReturnValue({ timestamp: daysAgo(7) });
        expect(isBackupDue({ backup_frequency: 'weekly', backup_time: pastTime() })).toBe(true);
      });

      it('does not run a monthly backup ten days after the last one', () => {
        mockStore.get.mockReturnValue({ timestamp: daysAgo(10) });
        expect(isBackupDue({ backup_frequency: 'monthly', backup_time: pastTime() })).toBe(false);
      });
    });
  });
});
