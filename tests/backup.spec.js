const { runBackup, isBackupDue } = require('../src/main/backupManager');
const db = require('../src/db/db');
const fs = require('fs');
const Store = require('electron-store');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('fs');

// The global mock for electron-store will be used via jest.config.js
const mockStore = new Store();

describe('Backup Manager', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runBackup', () => {
    const mockSettings = {
      backup_enabled: true,
      backup_path: '/mock/backup-path',
    };

    it('should run backup successfully', async () => {
      db.getDatabasePath.mockReturnValue('/mock/db/database.sqlite');
      fs.existsSync.mockReturnValue(true);
      fs.accessSync.mockReturnValue(true); // Writable

      const result = await runBackup(mockSettings);

      expect(fs.copyFileSync).toHaveBeenCalledWith(
        '/mock/db/database.sqlite',
        expect.stringContaining('/mock/backup-path/backup-')
      );
      expect(mockStore.set).toHaveBeenCalledWith(
        'last_backup_status',
        expect.objectContaining({ success: true })
      );
      expect(result.success).toBe(true);
    });

    it('should fail if backup path is not writable', async () => {
      db.getDatabasePath.mockReturnValue('/mock/db/database.sqlite');
      fs.existsSync.mockReturnValue(true);
      fs.accessSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = await runBackup(mockSettings);

      expect(fs.copyFileSync).not.toHaveBeenCalled();
      expect(mockStore.set).toHaveBeenCalledWith(
        'last_backup_status',
        expect.objectContaining({ success: false })
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('not accessible or writable');
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
  });
});
