// tests/importManager.backupFormats.spec.js
// Verifies dual-format backup support: legacy unencrypted ZIP backups
// (v1.2.9 and earlier) import seamlessly, and new AES-256-GCM encrypted
// backups decrypt with the transfer key.

const mockStoreData = {};

const mockStore = {
  get: jest.fn((key) => mockStoreData[key]),
  set: jest.fn((key, value) => {
    mockStoreData[key] = value;
  }),
  delete: jest.fn((key) => {
    delete mockStoreData[key];
  }),
};

jest.mock('electron-store', () => jest.fn().mockImplementation(() => mockStore));
jest.mock('pizzip');
jest.mock('electron');
jest.mock('exceljs');
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/services/matriculeService');
jest.mock('../src/main/keyManager');

const backupManager = require('../src/main/backupManager');
const { extractZipFromBuffer } = require('../src/main/importManager');
const { getDbKey } = require('../src/main/keyManager');

describe('Backup format auto-detection (legacy vs encrypted)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreData.settings = {};
  });

  it('should pass through a legacy unencrypted ZIP buffer (PK magic bytes)', () => {
    const legacyZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('legacy zip payload'),
    ]);

    const result = extractZipFromBuffer(legacyZip, 'any-password');
    expect(result).toBe(legacyZip);
  });

  it('should pass through short buffers untouched', () => {
    const shortBuffer = Buffer.from('not a backup');
    expect(extractZipFromBuffer(shortBuffer, 'pw')).toBe(shortBuffer);
  });

  it('should decrypt an encrypted backup with the user-provided transfer key', () => {
    const originalZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('encrypted payload'),
    ]);
    const encrypted = backupManager.encryptBackup(originalZip, 'association-secret');

    const result = extractZipFromBuffer(encrypted, 'association-secret');
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should decrypt an encrypted backup using the stored association_transfer_key setting', () => {
    const originalZip = Buffer.from('payload');
    const encrypted = backupManager.encryptBackup(originalZip, 'stored-transfer-key');
    mockStoreData.settings = { association_transfer_key: 'stored-transfer-key' };

    const result = extractZipFromBuffer(encrypted, undefined);
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should decrypt an encrypted backup using the local DB key as last resort', () => {
    const originalZip = Buffer.from('payload');
    const encrypted = backupManager.encryptBackup(originalZip, 'local-db-key');
    getDbKey.mockReturnValue('local-db-key');

    const result = extractZipFromBuffer(encrypted, undefined);
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should return the buffer unchanged when no candidate key decrypts it', () => {
    const encrypted = backupManager.encryptBackup(Buffer.from('payload'), 'unknown-key');
    getDbKey.mockReturnValue('another-key');

    const result = extractZipFromBuffer(encrypted, 'wrong-key');
    expect(result).toBe(encrypted);
  });
});
