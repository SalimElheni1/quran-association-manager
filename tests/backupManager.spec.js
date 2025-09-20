// Mock dependencies BEFORE importing the module
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
  },
}));
jest.mock('pizzip');
jest.mock('../db/db');
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../src/main/keyManager', () => ({
  getDbSalt: jest.fn(),
}));

// Clear module cache and mock electron-store
beforeAll(() => {
  jest.resetModules();
});

const fs = require('fs').promises;
const PizZip = require('pizzip');
const { allQuery } = require('../db/db');
const { log, error: logError } = require('../src/main/logger');
const { getDbSalt } = require('../src/main/keyManager');

// Import the module AFTER mocks are set up
let runBackup, startScheduler, stopScheduler, isBackupDue;
const Store = require('electron-store');

beforeAll(() => {
  const backupManager = require('../src/main/backupManager');
  runBackup = backupManager.runBackup;
  startScheduler = backupManager.startScheduler;
  stopScheduler = backupManager.stopScheduler;
  isBackupDue = backupManager.isBackupDue;
});

describe('backupManager', () => {
  let mockStore;
  let mockZip;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Get the global mock methods and clear data
    mockStore = Store.mockMethods || {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    };
    if (Store.globalData) {
      Store.globalData.clear();
    }
    
    // Mock global timer functions
    global.setInterval = jest.fn();
    global.clearInterval = jest.fn();

    mockZip = {
      file: jest.fn(),
      generate: jest.fn(),
    };
    PizZip.mockImplementation(() => mockZip);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('runBackup', () => {
    it('should create backup successfully', async () => {
      const settings = { backup_enabled: true };
      const backupPath = '/path/to/backup.qdb';
      const mockSalt = 'test-salt-123';
      const mockTables = [
        { name: 'students' },
        { name: 'teachers' },
        { name: 'users' }
      ];
      const mockStudentData = [
        { id: 1, name: 'John Doe', email: 'john@example.com' }
      ];
      const mockTeacherData = [
        { id: 1, name: 'Jane Smith', subject: 'Math' }
      ];
      const mockUserData = [
        { id: 1, username: 'admin', role: 'Admin' }
      ];
      const mockZipBuffer = Buffer.from('zip-content');

      getDbSalt.mockReturnValue(mockSalt);
      allQuery.mockResolvedValueOnce(mockTables)
        .mockResolvedValueOnce(mockStudentData)
        .mockResolvedValueOnce(mockTeacherData)
        .mockResolvedValueOnce(mockUserData);
      mockZip.generate.mockReturnValue(mockZipBuffer);
      fs.writeFile.mockResolvedValue();

      const result = await runBackup(settings, backupPath);

      expect(getDbSalt).toHaveBeenCalled();
      expect(allQuery).toHaveBeenCalledWith(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
      );
      expect(mockZip.file).toHaveBeenCalledWith('backup.sql', expect.any(String));
      expect(mockZip.file).toHaveBeenCalledWith('salt.json', expect.any(Buffer));
      expect(fs.writeFile).toHaveBeenCalledWith(backupPath, mockZipBuffer);
      expect(mockStore.set).toHaveBeenCalledWith('last_backup_status', {
        success: true,
        message: 'Backup completed successfully.',
        timestamp: expect.any(String),
      });
      expect(result).toEqual({
        success: true,
        message: 'Backup completed successfully.',
      });
    });

    it('should generate correct SQL REPLACE statements', async () => {
      const settings = { backup_enabled: true };
      const backupPath = '/path/to/backup.qdb';
      const mockSalt = 'test-salt';
      const mockTables = [{ name: 'students' }];
      const mockData = [
        { id: 1, name: 'John Doe', email: null, active: true },
        { id: 2, name: "Jane's Test", email: 'jane@test.com', active: false }
      ];

      getDbSalt.mockReturnValue(mockSalt);
      allQuery.mockResolvedValueOnce(mockTables)
        .mockResolvedValueOnce(mockData);
      mockZip.generate.mockReturnValue(Buffer.from('zip'));
      fs.writeFile.mockResolvedValue();

      await runBackup(settings, backupPath);

      const sqlCall = mockZip.file.mock.calls.find(call => call[0] === 'backup.sql');
      const sqlContent = sqlCall[1];

      expect(sqlContent).toContain('REPLACE INTO "students"');
      expect(sqlContent).toContain("'John Doe'");
      expect(sqlContent).toContain('NULL'); // null value handling
      expect(sqlContent).toContain("'Jane''s Test'"); // SQL escaping
      expect(sqlContent).toContain('true');
      expect(sqlContent).toContain('false');
    });

    it('should handle binary data in SQL generation', async () => {
      const settings = { backup_enabled: true };
      const backupPath = '/path/to/backup.qdb';
      const mockSalt = 'test-salt';
      const mockTables = [{ name: 'files' }];
      const mockData = [
        { id: 1, name: 'test.pdf', content: Buffer.from('binary-data') }
      ];

      getDbSalt.mockReturnValue(mockSalt);
      allQuery.mockResolvedValueOnce(mockTables)
        .mockResolvedValueOnce(mockData);
      mockZip.generate.mockReturnValue(Buffer.from('zip'));
      fs.writeFile.mockResolvedValue();

      await runBackup(settings, backupPath);

      const sqlCall = mockZip.file.mock.calls.find(call => call[0] === 'backup.sql');
      const sqlContent = sqlCall[1];

      expect(sqlContent).toContain("X'62696E6172792D64617461'"); // hex representation
    });

    it('should skip empty tables', async () => {
      const settings = { backup_enabled: true };
      const backupPath = '/path/to/backup.qdb';
      const mockSalt = 'test-salt';
      const mockTables = [
        { name: 'students' },
        { name: 'empty_table' }
      ];
      const mockStudentData = [{ id: 1, name: 'John' }];
      const mockEmptyData = [];

      getDbSalt.mockReturnValue(mockSalt);
      allQuery.mockResolvedValueOnce(mockTables)
        .mockResolvedValueOnce(mockStudentData)
        .mockResolvedValueOnce(mockEmptyData);
      mockZip.generate.mockReturnValue(Buffer.from('zip'));
      fs.writeFile.mockResolvedValue();

      await runBackup(settings, backupPath);

      const sqlCall = mockZip.file.mock.calls.find(call => call[0] === 'backup.sql');
      const sqlContent = sqlCall[1];

      expect(sqlContent).toContain('students');
      expect(sqlContent).not.toContain('empty_table');
    });

    it('should handle backup failure', async () => {
      const settings = { backup_enabled: true };
      const backupPath = '/path/to/backup.qdb';
      const error = new Error('Database connection failed');

      getDbSalt.mockReturnValue('salt');
      allQuery.mockRejectedValue(error);

      const result = await runBackup(settings, backupPath);

      expect(mockStore.set).toHaveBeenCalledWith('last_backup_status', {
        success: false,
        message: 'Failed to create SQL backup: Database connection failed',
        timestamp: expect.any(String),
      });
      expect(logError).toHaveBeenCalledWith('Failed to create SQL backup: Database connection failed');
      expect(result).toEqual({
        success: false,
        message: 'Failed to create SQL backup: Database connection failed',
      });
    });

    it('should handle file write failure', async () => {
      const settings = { backup_enabled: true };
      const backupPath = '/path/to/backup.qdb';
      const mockSalt = 'test-salt';
      const writeError = new Error('Permission denied');

      getDbSalt.mockReturnValue(mockSalt);
      allQuery.mockResolvedValueOnce([]);
      mockZip.generate.mockReturnValue(Buffer.from('zip'));
      fs.writeFile.mockRejectedValue(writeError);

      const result = await runBackup(settings, backupPath);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Permission denied');
    });
  });

  describe('isBackupDue', () => {
    it('should return true when no backup has ever run', () => {
      const settings = { backup_frequency: 'daily' };
      mockStore.get.mockReturnValue(null);

      const result = isBackupDue(settings);

      expect(result).toBe(true);
    });

    it('should return true when no timestamp in last backup', () => {
      const settings = { backup_frequency: 'daily' };
      mockStore.get.mockReturnValue({ success: true });

      const result = isBackupDue(settings);

      expect(result).toBe(true);
    });

    it('should return true for daily backup after 24+ hours', () => {
      const settings = { backup_frequency: 'daily' };
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: yesterday.toISOString(),
      });

      const result = isBackupDue(settings);

      expect(result).toBe(true);
    });

    it('should return false for daily backup within 24 hours', () => {
      const settings = { backup_frequency: 'daily' };
      const recent = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: recent.toISOString(),
      });

      const result = isBackupDue(settings);

      expect(result).toBe(false);
    });

    it('should return true for weekly backup after 7+ days', () => {
      const settings = { backup_frequency: 'weekly' };
      const lastWeek = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: lastWeek.toISOString(),
      });

      const result = isBackupDue(settings);

      expect(result).toBe(true);
    });

    it('should return false for weekly backup within 7 days', () => {
      const settings = { backup_frequency: 'weekly' };
      const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: recent.toISOString(),
      });

      const result = isBackupDue(settings);

      expect(result).toBe(false);
    });

    it('should return true for monthly backup after 30+ days', () => {
      const settings = { backup_frequency: 'monthly' };
      const lastMonth = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: lastMonth.toISOString(),
      });

      const result = isBackupDue(settings);

      expect(result).toBe(true);
    });

    it('should return false for monthly backup within 30 days', () => {
      const settings = { backup_frequency: 'monthly' };
      const recent = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days ago
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: recent.toISOString(),
      });

      const result = isBackupDue(settings);

      expect(result).toBe(false);
    });

    it('should return false for unknown frequency', () => {
      const settings = { backup_frequency: 'unknown' };
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: new Date().toISOString(),
      });

      const result = isBackupDue(settings);

      expect(result).toBe(false);
    });
  });

  describe('startScheduler', () => {
    it('should not start scheduler when backup is disabled', () => {
      const settings = { backup_enabled: false };

      startScheduler(settings);

      expect(log).toHaveBeenCalledWith('Backup scheduler is disabled.');
      expect(global.setInterval).not.toHaveBeenCalled();
    });

    it('should start scheduler when backup is enabled', () => {
      const settings = { backup_enabled: true, backup_frequency: 'daily' };

      startScheduler(settings);

      expect(log).toHaveBeenCalledWith('Backup scheduler started. Frequency: daily.');
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000 * 60 * 60);
    });

    it('should stop existing scheduler before starting new one', () => {
      const settings = { backup_enabled: true, backup_frequency: 'daily' };
      
      // Start first scheduler
      startScheduler(settings);
      const firstIntervalId = global.setInterval.mock.results[0].value;
      
      // Start second scheduler
      startScheduler(settings);
      
      expect(global.clearInterval).toHaveBeenCalledWith(firstIntervalId);
      expect(global.setInterval).toHaveBeenCalledTimes(2);
    });

    it('should run backup when due during scheduled check', async () => {
      const settings = { backup_enabled: true, backup_frequency: 'daily' };
      mockStore.get.mockReturnValue(null); // No previous backup
      
      // Mock runBackup to avoid actual backup execution
      const originalRunBackup = require('../src/main/backupManager').runBackup;
      const mockRunBackup = jest.fn().mockResolvedValue({ success: true });
      require('../src/main/backupManager').runBackup = mockRunBackup;

      startScheduler(settings);

      // Get the scheduled function
      const scheduledFunction = global.setInterval.mock.calls[0][0];
      
      // Execute the scheduled function
      await scheduledFunction();

      expect(log).toHaveBeenCalledWith('Scheduled backup is due. Running now...');
      expect(mockRunBackup).toHaveBeenCalledWith(settings);

      // Restore original function
      require('../src/main/backupManager').runBackup = originalRunBackup;
    });

    it('should not run backup when not due during scheduled check', async () => {
      const settings = { backup_enabled: true, backup_frequency: 'daily' };
      const recent = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      mockStore.get.mockReturnValue({
        success: true,
        timestamp: recent.toISOString(),
      });

      const originalRunBackup = require('../src/main/backupManager').runBackup;
      const mockRunBackup = jest.fn();
      require('../src/main/backupManager').runBackup = mockRunBackup;

      startScheduler(settings);

      // Get and execute the scheduled function
      const scheduledFunction = global.setInterval.mock.calls[0][0];
      await scheduledFunction();

      expect(mockRunBackup).not.toHaveBeenCalled();

      // Restore original function
      require('../src/main/backupManager').runBackup = originalRunBackup;
    });
  });

  describe('stopScheduler', () => {
    it('should stop active scheduler', () => {
      const settings = { backup_enabled: true, backup_frequency: 'daily' };
      
      startScheduler(settings);
      const intervalId = global.setInterval.mock.results[0].value;
      
      stopScheduler();

      expect(global.clearInterval).toHaveBeenCalledWith(intervalId);
      expect(log).toHaveBeenCalledWith('Backup scheduler stopped.');
    });

    it('should handle stopping when no scheduler is active', () => {
      stopScheduler();

      expect(global.clearInterval).not.toHaveBeenCalled();
      // Should not throw error
    });
  });
});