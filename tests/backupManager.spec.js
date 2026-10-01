// tests/backupManager.spec.js
const path = require('path');

// Mock all dependencies at the top level
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(),
    stat: jest.fn().mockResolvedValue({ size: 123 }),
  },
  statSync: jest.fn(),
  accessSync: jest.fn(),
  constants: { W_OK: 2 },
}));
jest.mock('pizzip');
jest.mock('../src/db/db');
jest.mock('../src/main/logger');
jest.mock('../src/main/keyManager');

// A proper mock for electron-store
const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
};
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => mockStore);
});

describe('backupManager', () => {
  let backupManager;
  let db;
  let keyManager;
  let PizZip;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // clearAllMocks keeps implementations; reset the folder checks between tests.
    require('fs').statSync.mockReset();
    require('fs').accessSync.mockReset();

    backupManager = require('../src/main/backupManager');
    db = require('../src/db/db');
    keyManager = require('../src/main/keyManager');
    PizZip = require('pizzip');
  });

  afterEach(() => {
    backupManager.stopScheduler();
    jest.useRealTimers();
  });

  describe('validateBackupPath (SEC-018)', () => {
    const fsSync = require('fs');
    const aDirectory = { isDirectory: () => true };
    const absolute = path.resolve('/backups/branch');

    beforeEach(() => {
      fsSync.statSync.mockReturnValue(aDirectory);
      fsSync.accessSync.mockReturnValue(undefined);
    });

    it('accepts an existing, writable, absolute folder', () => {
      expect(backupManager.validateBackupPath(absolute)).toEqual({ valid: true, path: absolute });
      expect(fsSync.accessSync).toHaveBeenCalledWith(absolute, fsSync.constants.W_OK);
    });

    it.each([
      ['an empty path', '', 'مسار النسخ الاحتياطي غير محدد.'],
      ['no path', undefined, 'مسار النسخ الاحتياطي غير محدد.'],
      ['a NUL character', `${absolute}\0x`, 'مسار النسخ الاحتياطي يحتوي على أحرف غير صالحة.'],
      ['a relative path', 'backups/branch', 'مسار النسخ الاحتياطي يجب أن يكون مساراً كاملاً.'],
    ])('rejects %s without touching the disk', (_label, dirPath, message) => {
      expect(backupManager.validateBackupPath(dirPath)).toEqual({ valid: false, message });
      expect(fsSync.statSync).not.toHaveBeenCalled();
    });

    it('rejects a folder that does not exist', () => {
      fsSync.statSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      expect(backupManager.validateBackupPath(absolute)).toEqual({
        valid: false,
        message: 'مجلد النسخ الاحتياطي غير موجود.',
      });
    });

    it('rejects a path that is a file', () => {
      fsSync.statSync.mockReturnValue({ isDirectory: () => false });
      expect(backupManager.validateBackupPath(absolute)).toEqual({
        valid: false,
        message: 'مجلد النسخ الاحتياطي غير موجود.',
      });
    });

    it('rejects a folder it cannot write to', () => {
      fsSync.accessSync.mockImplementation(() => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      });
      expect(backupManager.validateBackupPath(absolute)).toEqual({
        valid: false,
        message: 'مجلد النسخ الاحتياطي غير قابل للكتابة.',
      });
    });
  });

  describe('runBackup', () => {
    it('should create backup successfully', async () => {
      const settings = { backup_enabled: true };
      const mockZip = { file: jest.fn(), generate: jest.fn().mockReturnValue(Buffer.from('zip')) };
      PizZip.mockImplementation(() => mockZip);
      keyManager.getDbSalt.mockReturnValue('test-salt');
      keyManager.getDbKey.mockReturnValue('test-db-key');
      db.allQuery
        .mockResolvedValueOnce([{ name: 'students' }])
        .mockResolvedValueOnce([{ id: 1, name: 'John' }]);

      const result = await backupManager.runBackup(settings, '/path/to/backup.qdb');

      expect(result.success).toBe(true);
    });
  });

  describe('encryptBackup/decryptBackup', () => {
    it('should round-trip encrypt and decrypt with the same password', () => {
      const original = Buffer.from('hello backup content');
      const encrypted = backupManager.encryptBackup(original, 'transfer-secret');
      expect(Buffer.isBuffer(encrypted)).toBe(true);
      expect(encrypted.length).toBe(44 + original.length);
      const decrypted = backupManager.decryptBackup(encrypted, 'transfer-secret');
      expect(decrypted.equals(original)).toBe(true);
    });

    it('should throw when decrypting with the wrong password', () => {
      const encrypted = backupManager.encryptBackup(Buffer.from('secret data'), 'right-key');
      expect(() => backupManager.decryptBackup(encrypted, 'wrong-key')).toThrow();
    });

    it('should throw for a buffer too short to be an encrypted backup', () => {
      expect(() => backupManager.decryptBackup(Buffer.from('tiny'), 'key')).toThrow(
        'Invalid encrypted backup file structure',
      );
    });
  });

  describe('generateSignature/verifySignature', () => {
    it('should verify a valid signature and reject tampered data', () => {
      const signature = backupManager.generateSignature('SELECT 1;', 'secret-key');
      expect(backupManager.verifySignature('SELECT 1;', 'secret-key', signature)).toBe(true);
      expect(backupManager.verifySignature('SELECT 2;', 'secret-key', signature)).toBe(false);
      expect(backupManager.verifySignature('SELECT 1;', 'other-key', signature)).toBe(false);
    });

    it('should reject missing or malformed signatures', () => {
      expect(backupManager.verifySignature('data', 'key', '')).toBe(false);
      expect(backupManager.verifySignature('data', 'key', null)).toBe(false);
      expect(backupManager.verifySignature('data', 'key', 'not-hex')).toBe(false);
    });
  });

  describe('isBackupDue', () => {
    it('should return true when no backup has ever run', () => {
      mockStore.get.mockReturnValue(null);
      const result = backupManager.isBackupDue({ backup_frequency: 'daily' });
      expect(result).toBe(true);
    });
  });

  describe('startScheduler', () => {
    it('should check every hour when backup is enabled', () => {
      backupManager.startScheduler({ backup_enabled: true, backup_frequency: 'daily' });
      expect(jest.getTimerCount()).toBe(1);
    });

    it('should not start when backup is disabled', () => {
      backupManager.startScheduler({ backup_enabled: false });
      expect(jest.getTimerCount()).toBe(0);
    });

    it('does not start with an invalid backup folder, and says why', () => {
      const { error: logError } = require('../src/main/logger');
      backupManager.startScheduler({
        backup_enabled: true,
        backup_frequency: 'daily',
        backup_path: 'backups/branch',
      });

      expect(jest.getTimerCount()).toBe(0);
      expect(logError).toHaveBeenCalledWith(
        'Backup scheduler not started: مسار النسخ الاحتياطي يجب أن يكون مساراً كاملاً.',
      );
    });

    it('skips a due backup when the folder has become unusable', async () => {
      const fsSync = require('fs');
      const { error: logError } = require('../src/main/logger');
      fsSync.statSync.mockReturnValue({ isDirectory: () => true });
      mockStore.get.mockReturnValue(null); // never backed up: due
      backupManager.startScheduler({
        backup_enabled: true,
        backup_frequency: 'daily',
        backup_path: path.resolve('/backups/branch'),
      });
      expect(jest.getTimerCount()).toBe(1);

      fsSync.statSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      await jest.advanceTimersByTimeAsync(1000 * 60 * 60);

      expect(logError).toHaveBeenCalledWith(
        'Scheduled backup skipped: مجلد النسخ الاحتياطي غير موجود.',
      );
      const { promises } = require('fs');
      expect(promises.writeFile).not.toHaveBeenCalled();
    });

    it('should report a due backup that has no backup folder', async () => {
      const { error: logError } = require('../src/main/logger');
      mockStore.get.mockReturnValue(null); // never backed up: due
      backupManager.startScheduler({ backup_enabled: true, backup_frequency: 'daily' });

      await jest.advanceTimersByTimeAsync(1000 * 60 * 60);

      expect(logError).toHaveBeenCalledWith('Scheduled backup failed: No backup path configured.');
    });
  });

  describe('stopScheduler', () => {
    it('should stop the active scheduler, keeping a single timer across restarts', () => {
      backupManager.startScheduler({ backup_enabled: true });
      backupManager.startScheduler({ backup_enabled: true });
      expect(jest.getTimerCount()).toBe(1);

      backupManager.stopScheduler();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
