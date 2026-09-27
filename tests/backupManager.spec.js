// tests/backupManager.spec.js

// Mock all dependencies at the top level
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(),
    stat: jest.fn().mockResolvedValue({ size: 123 }),
  },
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
    // Make setInterval return a dummy ID
    global.setInterval = jest.fn(() => 123);
    global.clearInterval = jest.fn();

    backupManager = require('../src/main/backupManager');
    db = require('../src/db/db');
    keyManager = require('../src/main/keyManager');
    PizZip = require('pizzip');
  });

  afterEach(() => {
    jest.useRealTimers();
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
    it('should start scheduler when backup is enabled', () => {
      backupManager.startScheduler({ backup_enabled: true, backup_frequency: 'daily' });
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000 * 60 * 60);
    });
  });

  describe('stopScheduler', () => {
    it('should stop active scheduler', () => {
      backupManager.startScheduler({ backup_enabled: true });
      const intervalId = global.setInterval.mock.results[0].value;

      backupManager.stopScheduler();
      expect(global.clearInterval).toHaveBeenCalledWith(intervalId);
    });
  });
});
