const { runBackup, isBackupDue } = require('../src/main/backupManager');
const db = require('../src/db/db');
const fs = require('fs').promises;
const fsSync = require('fs');
const Store = require('electron-store');
const PizZip = require('pizzip'); // This will be the mock from jest.config.js

// Mock other dependencies
jest.mock('../src/db/db');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
  existsSync: jest.fn(),
}));

// Get a reference to the global mocks
const mockStore = new Store();

describe('Backup Manager', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Clear the global pizzip mock's internal state
    PizZip.mockClear();
  });

  describe('runBackup (New SQL-based Logic)', () => {
    const mockSettings = {
      backup_enabled: true,
    };
    const backupFilePath = '/mock/backup-path/backup-test.qdb';

    it('should generate a SQL backup successfully', async () => {
      // Arrange
      fsSync.existsSync.mockReturnValue(true);
      fs.readFile.mockResolvedValue('{"db-salt":"mock-salt"}');
      db.allQuery
        .mockResolvedValueOnce([{ name: 'students' }]) // Mock table names
        .mockResolvedValueOnce([{ id: 1, name: "Alice's" }]); // Mock students data with a quote

      // Act
      const result = await runBackup(mockSettings, backupFilePath);

      // Assert
      expect(db.allQuery).toHaveBeenCalledWith(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'",
      );
      expect(db.allQuery).toHaveBeenCalledWith('SELECT * FROM "students"');

      // Check the generated SQL for correct quote escaping
      const generatedSql = PizZip.mockInstance.file.mock.calls[0][1];
      expect(generatedSql).toContain("INSERT INTO \"students\" (\"id\", \"name\") VALUES (1, 'Alice''s');");

      expect(fs.readFile).toHaveBeenCalledWith(mockStore.path);

      expect(PizZip).toHaveBeenCalledTimes(1);
      expect(PizZip.mockInstance.file).toHaveBeenCalledWith('backup.sql', expect.any(String));
      expect(PizZip.mockInstance.file).toHaveBeenCalledWith('config.json', '{"db-salt":"mock-salt"}');
      expect(PizZip.mockInstance.generate).toHaveBeenCalledWith({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(backupFilePath, 'mock-zip-content');

      expect(mockStore.set).toHaveBeenCalledWith(
        'last_backup_status',
        expect.objectContaining({ success: true }),
      );
      expect(result.success).toBe(true);
    });

    it('should fail if salt file does not exist', async () => {
      // Arrange
      fsSync.existsSync.mockReturnValue(false);

      // Act
      const result = await runBackup(mockSettings, backupFilePath);

      // Assert
      expect(db.allQuery).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(mockStore.set).toHaveBeenCalledWith(
        'last_backup_status',
        expect.objectContaining({ success: false }),
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Source salt file not found');
    });

    it('should handle database query errors gracefully', async () => {
      // Arrange
      fsSync.existsSync.mockReturnValue(true);
      fs.readFile.mockResolvedValue('{"db-salt":"mock-salt"}');
      const dbError = new Error('Database connection failed');
      db.allQuery.mockRejectedValue(dbError);

      // Act
      const result = await runBackup(mockSettings, backupFilePath);

      // Assert
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(mockStore.set).toHaveBeenCalledWith(
        'last_backup_status',
        expect.objectContaining({ success: false, message: expect.stringContaining(dbError.message) }),
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
  });
});
