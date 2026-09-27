// Mock dependencies first
jest.mock('crypto');
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

const mockKeyStore = {
  get: jest.fn(),
  set: jest.fn(),
  path: '/mock/path/to/key/config',
};

const mockLegacyKeyStore = {
  get: jest.fn(),
  set: jest.fn(),
  path: '/mock/path/to/key/config',
  store: { 'db-encryption-key': 'legacy-hex-key', 'unrelated-key': 'kept-value' },
};

const mockSaltStore = {
  get: jest.fn(),
  set: jest.fn(),
  path: '/mock/path/to/salt/config',
};

// When true, constructing the plain (unencrypted) db-secure-config store
// throws exactly like electron-store does on a legacy-encrypted file.
let mockLegacyFilePresent = false;

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation((config) => {
    if (config.name === 'db-secure-config') {
      if (!config.encryptionKey && mockLegacyFilePresent) {
        throw new SyntaxError('Unexpected token \ufffd ... is not valid JSON');
      }
      if (config.encryptionKey) {
        mockLegacyFilePresent = false; // File was rewritten during migration.
        return mockLegacyKeyStore;
      }
      return mockKeyStore;
    }
    if (config.name === 'db-salt-config') {
      return mockSaltStore;
    }
    return {};
  });
});

const crypto = require('crypto');
const electron = require('electron');
const { getDbKey, getDbSalt, setDbSalt, getSaltConfigPath } = require('../src/main/keyManager');
const { log, error: logError } = require('../src/main/logger');

const makeBlob = (value) => 'enc:v1:' + Buffer.from(`enc:${value}`).toString('base64');

describe('keyManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLegacyFilePresent = false;
    electron.safeStorage.isEncryptionAvailable.mockReturnValue(true);
  });

  describe('getDbKey (SEC-03 safeStorage)', () => {
    it('should return an existing safeStorage-encrypted blob by decrypting it', () => {
      mockKeyStore.get.mockReturnValue(makeBlob('existing-key-hex'));

      const result = getDbKey();

      expect(mockKeyStore.get).toHaveBeenCalledWith('db-encryption-key');
      expect(electron.safeStorage.decryptString).toHaveBeenCalled();
      expect(result).toBe('existing-key-hex');
      expect(crypto.randomBytes).not.toHaveBeenCalled();
    });

    it('should migrate a legacy plaintext key into safeStorage without re-keying', () => {
      const legacyKey = 'legacy-hex-key';
      mockKeyStore.get.mockReturnValue(legacyKey);

      const result = getDbKey();

      expect(result).toBe(legacyKey);
      const storedBlob = mockKeyStore.set.mock.calls.find(([name]) => name === 'db-encryption-key');
      expect(storedBlob).toBeDefined();
      expect(storedBlob[1]).toMatch(/^enc:v1:/);
      expect(log).toHaveBeenCalledWith('Migrating the database encryption key to safeStorage.');
      expect(crypto.randomBytes).not.toHaveBeenCalled();
    });

    it('should generate, encrypt and store a new key when none exists', () => {
      const newKeyBuffer = Buffer.from('new-key-bytes');
      const newKeyHex = 'new-key-hex';

      mockKeyStore.get.mockReturnValue(null);
      crypto.randomBytes.mockReturnValue(newKeyBuffer);
      newKeyBuffer.toString = jest.fn().mockReturnValue(newKeyHex);

      const result = getDbKey();

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(result).toBe(newKeyHex);
      const storedBlob = mockKeyStore.set.mock.calls.find(([name]) => name === 'db-encryption-key');
      expect(storedBlob).toBeDefined();
      expect(storedBlob[1]).toMatch(/^enc:v1:/);
      expect(log).toHaveBeenCalledWith(
        'New database encryption key generated and stored securely.',
      );
    });

    it('should generate, encrypt and store a new key when empty string exists', () => {
      const newKeyBuffer = Buffer.from('new-key-bytes');
      const newKeyHex = 'new-key-hex';

      mockKeyStore.get.mockReturnValue('');
      crypto.randomBytes.mockReturnValue(newKeyBuffer);
      newKeyBuffer.toString = jest.fn().mockReturnValue(newKeyHex);

      const result = getDbKey();

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(result).toBe(newKeyHex);
      const storedBlob = mockKeyStore.set.mock.calls.find(([name]) => name === 'db-encryption-key');
      expect(storedBlob[1]).toMatch(/^enc:v1:/);
    });

    it('should throw when an existing blob cannot be decrypted', () => {
      mockKeyStore.get.mockReturnValue(makeBlob('key'));
      electron.safeStorage.decryptString.mockImplementation(() => {
        throw new Error('keychain locked');
      });

      expect(() => getDbKey()).toThrow('Failed to unlock the database key');
      expect(logError).toHaveBeenCalled();
    });

    it('should fall back to plaintext storage when safeStorage is unavailable', () => {
      electron.safeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockKeyStore.get.mockReturnValue(null);
      const newKeyBuffer = Buffer.from('new-key-bytes');
      const newKeyHex = 'new-key-hex';
      crypto.randomBytes.mockReturnValue(newKeyBuffer);
      newKeyBuffer.toString = jest.fn().mockReturnValue(newKeyHex);

      const result = getDbKey();

      expect(result).toBe(newKeyHex);
      expect(mockKeyStore.set).toHaveBeenCalledWith('db-encryption-key', newKeyHex);
      expect(log).toHaveBeenCalledWith(
        'safeStorage is unavailable on this system. The database key is stored with restrictive file permissions instead of OS-level encryption.',
      );
    });

    it('should return the stored plaintext key when safeStorage is unavailable', () => {
      electron.safeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockKeyStore.get.mockReturnValue('plaintext-existing-key');

      const result = getDbKey();

      expect(result).toBe('plaintext-existing-key');
      expect(crypto.randomBytes).not.toHaveBeenCalled();
    });

    describe('legacy encrypted store migration (launch-crash fix)', () => {
      const loadFreshModule = () => {
        jest.resetModules();
        mockLegacyFilePresent = true;
        // resetModules re-evaluates the mocked modules, so re-require them to
        // assert against the same instances the fresh keyManager uses.
        const freshFs = require('fs');
        const freshElectron = require('electron');
        const freshLogger = require('../src/main/logger');
        const freshCrypto = require('crypto');
        const freshKeyManager = require('../src/main/keyManager');
        return { freshKeyManager, freshFs, freshElectron, freshLogger, freshCrypto };
      };

      it('should migrate a legacy-encrypted store file into safeStorage format', () => {
        const { freshKeyManager, freshFs, freshLogger, freshCrypto } = loadFreshModule();
        // After migration the (mocked) plain store returns the written blob.
        mockKeyStore.get.mockReturnValue(makeBlob('legacy-hex-key'));

        const result = freshKeyManager.getDbKey();

        expect(result).toBe('legacy-hex-key');
        expect(freshFs.renameSync).toHaveBeenCalledWith(
          '/mock/path/to/key/config',
          '/mock/path/to/key/config.legacy',
        );
        const writtenCall = freshFs.writeFileSync.mock.calls.find(
          ([path]) => path === '/mock/path/to/key/config',
        );
        expect(writtenCall).toBeDefined();
        const writtenData = JSON.parse(writtenCall[1]);
        expect(writtenData['db-encryption-key']).toMatch(/^enc:v1:/);
        expect(writtenData['unrelated-key']).toBe('kept-value');
        expect(freshFs.unlinkSync).toHaveBeenCalledWith('/mock/path/to/key/config.legacy');
        expect(freshLogger.log).toHaveBeenCalledWith(
          'Migrating the legacy encrypted key store to the safeStorage format.',
        );
        expect(freshCrypto.randomBytes).not.toHaveBeenCalled();
      });

      it('should keep the legacy key when safeStorage is unavailable during migration', () => {
        const { freshKeyManager, freshFs, freshElectron } = loadFreshModule();
        freshElectron.safeStorage.isEncryptionAvailable.mockReturnValue(false);
        mockKeyStore.get.mockReturnValue('legacy-hex-key');

        const result = freshKeyManager.getDbKey();

        expect(result).toBe('legacy-hex-key');
        const writtenCall = freshFs.writeFileSync.mock.calls.find(
          ([path]) => path === '/mock/path/to/key/config',
        );
        expect(writtenCall).toBeDefined();
        const writtenData = JSON.parse(writtenCall[1]);
        expect(writtenData['db-encryption-key']).toBe('legacy-hex-key');
        expect(freshFs.chmodSync).toHaveBeenCalledWith('/mock/path/to/key/config', 0o600);
      });
    });
  });

  describe('getDbSalt', () => {
    it('should return existing salt if found in store', () => {
      const existingSalt = 'existing-salt-hex';
      mockSaltStore.get.mockReturnValue(existingSalt);

      const result = getDbSalt();

      expect(mockSaltStore.get).toHaveBeenCalledWith('db-salt');
      expect(result).toBe(existingSalt);
      expect(crypto.randomBytes).not.toHaveBeenCalled();
      expect(mockSaltStore.set).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('should generate and store new salt if none exists', () => {
      const newSaltBuffer = Buffer.from('new-salt-bytes');
      const newSaltHex = 'new-salt-hex';

      mockSaltStore.get.mockReturnValue(null);
      crypto.randomBytes.mockReturnValue(newSaltBuffer);
      newSaltBuffer.toString = jest.fn().mockReturnValue(newSaltHex);

      const result = getDbSalt();

      expect(mockSaltStore.get).toHaveBeenCalledWith('db-salt');
      expect(crypto.randomBytes).toHaveBeenCalledWith(16);
      expect(newSaltBuffer.toString).toHaveBeenCalledWith('hex');
      expect(mockSaltStore.set).toHaveBeenCalledWith('db-salt', newSaltHex);
      expect(log).toHaveBeenCalledWith('No database salt found. Generating a new one.');
      expect(log).toHaveBeenCalledWith('New database salt generated and stored.');
      expect(result).toBe(newSaltHex);
    });

    it('should generate and store new salt if empty string exists', () => {
      const newSaltBuffer = Buffer.from('new-salt-bytes');
      const newSaltHex = 'new-salt-hex';

      mockSaltStore.get.mockReturnValue('');
      crypto.randomBytes.mockReturnValue(newSaltBuffer);
      newSaltBuffer.toString = jest.fn().mockReturnValue(newSaltHex);

      const result = getDbSalt();

      expect(crypto.randomBytes).toHaveBeenCalledWith(16);
      expect(mockSaltStore.set).toHaveBeenCalledWith('db-salt', newSaltHex);
      expect(result).toBe(newSaltHex);
    });
  });

  describe('setDbSalt', () => {
    it('should set valid salt and log success', () => {
      const validSalt = 'a'.repeat(32); // 32 character hex string

      setDbSalt(validSalt);

      expect(mockSaltStore.set).toHaveBeenCalledWith('db-salt', validSalt);
      expect(log).toHaveBeenCalledWith('Database salt has been updated.');
      expect(logError).not.toHaveBeenCalled();
    });

    it('should reject null salt and log error', () => {
      setDbSalt(null);

      expect(mockSaltStore.set).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('setDbSalt received an invalid or missing salt.');
      expect(log).not.toHaveBeenCalled();
    });

    it('should reject undefined salt and log error', () => {
      setDbSalt(undefined);

      expect(mockSaltStore.set).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('setDbSalt received an invalid or missing salt.');
    });

    it('should reject non-string salt and log error', () => {
      setDbSalt(123);

      expect(mockSaltStore.set).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('setDbSalt received an invalid or missing salt.');
    });

    it('should reject short salt and log error', () => {
      const shortSalt = 'a'.repeat(31); // 31 characters, less than required 32

      setDbSalt(shortSalt);

      expect(mockSaltStore.set).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('setDbSalt received an invalid or missing salt.');
    });

    it('should accept salt exactly 32 characters long', () => {
      const validSalt = 'a'.repeat(32);

      setDbSalt(validSalt);

      expect(mockSaltStore.set).toHaveBeenCalledWith('db-salt', validSalt);
      expect(log).toHaveBeenCalledWith('Database salt has been updated.');
    });

    it('should accept salt longer than 32 characters', () => {
      const longSalt = 'a'.repeat(64);

      setDbSalt(longSalt);

      expect(mockSaltStore.set).toHaveBeenCalledWith('db-salt', longSalt);
      expect(log).toHaveBeenCalledWith('Database salt has been updated.');
    });
  });

  describe('getSaltConfigPath', () => {
    it('should return the salt store path', () => {
      const result = getSaltConfigPath();

      expect(result).toBe('/mock/path/to/salt/config');
    });
  });
});
