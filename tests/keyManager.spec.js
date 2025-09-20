// Mock dependencies first
jest.mock('crypto');
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

const mockKeyStore = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockSaltStore = {
  get: jest.fn(),
  set: jest.fn(),
  path: '/mock/path/to/salt/config',
};

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation((config) => {
    if (config.name === 'db-secure-config') {
      return mockKeyStore;
    }
    if (config.name === 'db-salt-config') {
      return mockSaltStore;
    }
    return {};
  });
});

const crypto = require('crypto');
const { getDbKey, getDbSalt, setDbSalt, getSaltConfigPath } = require('../src/main/keyManager');
const { log, error: logError } = require('../src/main/logger');

describe('keyManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDbKey', () => {
    it('should return existing key if found in store', () => {
      const existingKey = 'existing-key-hex';
      mockKeyStore.get.mockReturnValue(existingKey);

      const result = getDbKey();

      expect(mockKeyStore.get).toHaveBeenCalledWith('db-encryption-key');
      expect(result).toBe(existingKey);
      expect(crypto.randomBytes).not.toHaveBeenCalled();
      expect(mockKeyStore.set).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('should generate and store new key if none exists', () => {
      const newKeyBuffer = Buffer.from('new-key-bytes');
      const newKeyHex = 'new-key-hex';
      
      mockKeyStore.get.mockReturnValue(null);
      crypto.randomBytes.mockReturnValue(newKeyBuffer);
      newKeyBuffer.toString = jest.fn().mockReturnValue(newKeyHex);

      const result = getDbKey();

      expect(mockKeyStore.get).toHaveBeenCalledWith('db-encryption-key');
      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(newKeyBuffer.toString).toHaveBeenCalledWith('hex');
      expect(mockKeyStore.set).toHaveBeenCalledWith('db-encryption-key', newKeyHex);
      expect(log).toHaveBeenCalledWith('No database encryption key found. Generating a new one.');
      expect(log).toHaveBeenCalledWith('New database encryption key generated and stored.');
      expect(result).toBe(newKeyHex);
    });

    it('should generate and store new key if empty string exists', () => {
      const newKeyBuffer = Buffer.from('new-key-bytes');
      const newKeyHex = 'new-key-hex';
      
      mockKeyStore.get.mockReturnValue('');
      crypto.randomBytes.mockReturnValue(newKeyBuffer);
      newKeyBuffer.toString = jest.fn().mockReturnValue(newKeyHex);

      const result = getDbKey();

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(mockKeyStore.set).toHaveBeenCalledWith('db-encryption-key', newKeyHex);
      expect(result).toBe(newKeyHex);
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
