const crypto = require('crypto');
const { validateHexKey } = require('../src/db/db');
const { getJwtSecret, getDbKey, _resetInMemoryCache } = require('../src/main/keyManager');
const {
  encryptBackup,
  decryptBackup,
  generateSignature,
  verifySignature,
} = require('../src/main/backupManager');

describe('Sprint 1 Security Features', () => {
  beforeEach(() => {
    _resetInMemoryCache();
  });

  describe('SEC-002: validateHexKey', () => {
    it('should pass for a valid 64-character hex string', () => {
      const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(validateHexKey(validKey)).toBe(true);
    });

    it('should throw error for non-64 length key', () => {
      expect(() => validateHexKey('shortkey')).toThrow(
        'Invalid encryption key format: Must be a 64-character hex string.',
      );
    });

    it('should throw error for non-hex characters in key', () => {
      const invalidKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg';
      expect(() => validateHexKey(invalidKey)).toThrow(
        'Invalid encryption key format: Must be a 64-character hex string.',
      );
    });

    it('should throw error for non-string input', () => {
      expect(() => validateHexKey(12345)).toThrow(
        'Invalid encryption key format: Must be a 64-character hex string.',
      );
    });
  });

  describe('SEC-003: getJwtSecret HKDF derivation', () => {
    it('should derive secret deterministically from dbKey', () => {
      const secret1 = getJwtSecret();
      const secret2 = getJwtSecret();
      expect(secret1).toEqual(secret2);
      expect(secret1).toHaveLength(64);
    });
  });

  describe('SEC-005: Backup Encryption (AES-256-GCM)', () => {
    it('should encrypt and decrypt buffer correctly', () => {
      const dbKey = getDbKey();
      const plainBuffer = Buffer.from('SELECT * FROM students; SQL DUMP TEST');

      const encrypted = encryptBackup(plainBuffer, dbKey);
      expect(encrypted).not.toEqual(plainBuffer);
      expect(encrypted.length).toBeGreaterThan(44);

      const decrypted = decryptBackup(encrypted, dbKey);
      expect(decrypted.toString('utf8')).toBe('SELECT * FROM students; SQL DUMP TEST');
    });

    it('should fail decryption if tampered', () => {
      const dbKey = getDbKey();
      const plainBuffer = Buffer.from('SELECT * FROM students;');
      const encrypted = encryptBackup(plainBuffer, dbKey);

      // Tamper with payload
      encrypted[encrypted.length - 1] ^= 0xff;

      expect(() => decryptBackup(encrypted, dbKey)).toThrow();
    });
  });

  describe('SEC-006: HMAC Signature Verification', () => {
    it('should generate and verify valid signature', () => {
      const dbKey = getDbKey();
      const data = 'DATABASE SQL BACKUP CONTENT';

      const sig = generateSignature(data, dbKey);
      expect(typeof sig).toBe('string');
      expect(sig).toHaveLength(64);

      const isValid = verifySignature(data, dbKey, sig);
      expect(isValid).toBe(true);
    });

    it('should reject invalid or tampered signature', () => {
      const dbKey = getDbKey();
      const data = 'DATABASE SQL BACKUP CONTENT';

      const sig = generateSignature(data, dbKey);
      const tamperedSig = sig.substring(0, 63) + (sig[63] === 'a' ? 'b' : 'a');

      expect(verifySignature(data, dbKey, tamperedSig)).toBe(false);
      expect(verifySignature('MODIFIED CONTENT', dbKey, sig)).toBe(false);
    });
  });
});
