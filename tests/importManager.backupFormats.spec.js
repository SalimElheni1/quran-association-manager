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

  it('should pass through a legacy unencrypted ZIP buffer (PK magic bytes)', async () => {
    const legacyZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('legacy zip payload'),
    ]);

    const result = await extractZipFromBuffer(legacyZip, 'any-password');
    expect(result).toBe(legacyZip);
  });

  it('should pass through short buffers untouched', async () => {
    const shortBuffer = Buffer.from('not a backup');
    expect(await extractZipFromBuffer(shortBuffer, 'pw')).toBe(shortBuffer);
  });

  it('should decrypt an encrypted backup with the user-provided transfer key', async () => {
    const originalZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('encrypted payload'),
    ]);
    const encrypted = await backupManager.encryptBackup(originalZip, 'association-secret');

    const result = await extractZipFromBuffer(encrypted, 'association-secret');
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should decrypt an encrypted backup using the stored association_transfer_key setting', async () => {
    const originalZip = Buffer.from('payload');
    const encrypted = await backupManager.encryptBackup(originalZip, 'stored-transfer-key');
    mockStoreData.settings = { association_transfer_key: 'stored-transfer-key' };

    const result = await extractZipFromBuffer(encrypted, undefined);
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should decrypt an encrypted backup with the transfer key saved in the settings table', async () => {
    const originalZip = Buffer.from('payload');
    const encrypted = await backupManager.encryptBackup(originalZip, 'saved-transfer-key');

    // No key typed in the restore dialog: the saved key (passed by db:import) opens it.
    const result = await extractZipFromBuffer(encrypted, undefined, 'saved-transfer-key');
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should still try a typed key before the saved one (e.g. an older key)', async () => {
    const originalZip = Buffer.from('payload');
    const encrypted = await backupManager.encryptBackup(originalZip, 'previous-transfer-key');

    const result = await extractZipFromBuffer(
      encrypted,
      'previous-transfer-key',
      'saved-transfer-key',
    );
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should decrypt an encrypted backup using the local DB key as last resort', async () => {
    const originalZip = Buffer.from('payload');
    const encrypted = await backupManager.encryptBackup(originalZip, 'local-db-key');
    getDbKey.mockReturnValue('local-db-key');

    const result = await extractZipFromBuffer(encrypted, undefined);
    expect(result.equals(originalZip)).toBe(true);
  });

  it('should return the buffer unchanged when no candidate key decrypts it', async () => {
    const encrypted = await backupManager.encryptBackup(Buffer.from('payload'), 'unknown-key');
    getDbKey.mockReturnValue('another-key');

    const result = await extractZipFromBuffer(encrypted, 'wrong-key');
    expect(result).toBe(encrypted);
  });
});
