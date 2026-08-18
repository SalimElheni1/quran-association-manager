const crypto = require('crypto');
const fs = require('fs');
const Store = require('electron-store');
const { log, error: logError } = require('./logger');

// SEC-03: legacy hardcoded protector. Kept ONLY to decrypt store files written
// by previous versions during the one-time migration to safeStorage. The live
// store is never protected by this constant.
const LEGACY_ENCRYPTION_KEY = 'your-base64-encoded-master-key';

const KEY_STORE_NAME = 'db-secure-config';
const SALT_STORE_NAME = 'db-salt-config';

const DB_KEY_NAME = 'db-encryption-key';
const DB_SALT_NAME = 'db-salt';

const BLOB_PREFIX = 'enc:v1:';

// Store for the salt used in password hashing and other crypto operations.
// Never encrypted (the salt is portable by design — it travels in backups).
const saltStore = new Store({ name: SALT_STORE_NAME });

// Store for the database encryption key. The key value is always stored as a
// safeStorage-encrypted blob (OS-level protection: DPAPI / Keychain / libsecret).
// Created lazily: a legacy store file (encrypted with the old hardcoded key)
// must be migrated to the new format before the plain store can be opened.
let keyStore = null;

function getSafeStorage() {
  try {
    // Lazy require so plain-node contexts (e.g. scripts/manual-seeder.js)
    // degrade gracefully instead of crashing.
    const electron = require('electron');
    return electron && electron.safeStorage ? electron.safeStorage : null;
  } catch {
    return null;
  }
}

function isSecureStorageAvailable() {
  const safeStorage = getSafeStorage();
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function') return false;
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * Encrypts the key via safeStorage and returns the blob string.
 * @param {string} keyHex
 * @returns {string} blob string with BLOB_PREFIX
 */
function encryptKeyBlob(keyHex) {
  const safeStorage = getSafeStorage();
  const encrypted = safeStorage.encryptString(keyHex);
  return BLOB_PREFIX + Buffer.from(encrypted).toString('base64');
}

/**
 * Decrypts a blob string back to the key hex.
 * @param {string} blob
 * @returns {string}
 */
function decryptKeyBlob(blob) {
  const safeStorage = getSafeStorage();
  const encrypted = Buffer.from(blob.slice(BLOB_PREFIX.length), 'base64');
  return safeStorage.decryptString(encrypted);
}

/**
 * Attempts to open the store file using the legacy hardcoded encryption key.
 * @returns {Store|null} The legacy store, or null when it cannot be read.
 */
function tryOpenLegacyKeyStore() {
  try {
    return new Store({ name: KEY_STORE_NAME, encryptionKey: LEGACY_ENCRYPTION_KEY });
  } catch {
    return null;
  }
}

/**
 * Replaces the store file with the given JSON data, keeping a `.legacy` backup
 * until the write succeeded, and restoring it if the write fails.
 * @param {string} filePath - Absolute path of the store file.
 * @param {Object} data - The new store content.
 */
function replaceStoreFile(filePath, data) {
  const backupPath = `${filePath}.legacy`;
  try {
    fs.renameSync(filePath, backupPath);
  } catch (err) {
    logError('Failed to back up the legacy key store file:', err);
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, '\t'));
  } catch (err) {
    try {
      if (fs.existsSync(backupPath)) fs.renameSync(backupPath, filePath);
    } catch (restoreErr) {
      logError('Failed to restore the legacy key store backup:', restoreErr);
    }
    throw err;
  }
  try {
    fs.unlinkSync(backupPath);
  } catch {
    log('The legacy key store backup could not be removed; keeping it as a fallback.');
  }
}

/**
 * Opens the key store, migrating a legacy (hardcoded-key-encrypted) store file
 * to the current safeStorage format on first access. Existing installs keep
 * their current key — no re-keying, so existing databases remain decryptable.
 * @returns {Store} The key store instance.
 */
function getKeyStore() {
  if (keyStore) return keyStore;
  try {
    keyStore = new Store({ name: KEY_STORE_NAME });
    keyStore.get(DB_KEY_NAME); // Forces a read; throws when the file is not plain JSON.
  } catch (error) {
    const legacyStore = tryOpenLegacyKeyStore();
    if (!legacyStore) throw error;
    const legacyData = { ...legacyStore.store };
    if (typeof legacyData[DB_KEY_NAME] !== 'string') throw error;

    log('Migrating the legacy encrypted key store to the safeStorage format.');
    legacyData[DB_KEY_NAME] = isSecureStorageAvailable()
      ? encryptKeyBlob(legacyData[DB_KEY_NAME])
      : legacyData[DB_KEY_NAME];

    replaceStoreFile(legacyStore.path, legacyData);
    if (!isSecureStorageAvailable()) restrictKeyStorePermissions(legacyStore.path);
    log('Legacy key store migrated successfully.');
    keyStore = new Store({ name: KEY_STORE_NAME });
  }
  return keyStore;
}

function restrictKeyStorePermissions(storePath) {
  try {
    if (storePath) fs.chmodSync(storePath, 0o600);
  } catch (error) {
    logError('Failed to restrict database key file permissions:', error);
  }
}

/**
 * Retrieves the database encryption key (hex string).
 *
 * Storage strategy (SEC-03):
 * - The key is generated randomly per install (unchanged).
 * - It is stored as a safeStorage-encrypted blob in the electron-store file;
 *   there is no hardcoded master key anywhere in the live format.
 * - Existing installs keep their current key: the legacy encrypted store file
 *   is migrated in place (re-encrypted under safeStorage) — no re-keying, so
 *   existing databases remain decryptable.
 * - When safeStorage is unavailable (e.g. Linux without a keyring), the key
 *   falls back to a plaintext store entry with restrictive file permissions
 *   and a warning log.
 * @returns {string} The database encryption key as a hex string.
 */
function getDbKey() {
  const store = getKeyStore();
  const stored = store.get(DB_KEY_NAME);

  if (stored && typeof stored === 'string' && stored.startsWith(BLOB_PREFIX)) {
    try {
      return decryptKeyBlob(stored);
    } catch (error) {
      logError('Failed to decrypt the database key with safeStorage:', error);
      throw new Error('Failed to unlock the database key. The OS keychain may be locked.');
    }
  }

  if (isSecureStorageAvailable()) {
    if (stored && typeof stored === 'string') {
      // Plaintext key from the safeStorage-unavailable fallback: upgrade it.
      log('Migrating the database encryption key to safeStorage.');
      store.set(DB_KEY_NAME, encryptKeyBlob(stored));
      return stored;
    }

    log('No database encryption key found. Generating a new one.');
    const key = crypto.randomBytes(32).toString('hex');
    store.set(DB_KEY_NAME, encryptKeyBlob(key));
    log('New database encryption key generated and stored securely.');
    return key;
  }

  // Fallback: no OS keychain available. Plaintext with restrictive permissions.
  log(
    'safeStorage is unavailable on this system. The database key is stored with restrictive file permissions instead of OS-level encryption.',
  );
  if (stored && typeof stored === 'string') {
    return stored;
  }
  log('No database encryption key found. Generating a new one.');
  const key = crypto.randomBytes(32).toString('hex');
  store.set(DB_KEY_NAME, key);
  restrictKeyStorePermissions(store.path);
  return key;
}

/**
 * Retrieves the database salt.
 * If a salt doesn't exist, it generates a new secure 128-bit salt,
 * stores it, and returns it.
 * @returns {string} The database salt as a hex string.
 */
function getDbSalt() {
  let salt = saltStore.get(DB_SALT_NAME);

  if (!salt) {
    log('No database salt found. Generating a new one.');
    salt = crypto.randomBytes(16).toString('hex');
    saltStore.set(DB_SALT_NAME, salt);
    log('New database salt generated and stored.');
  }

  return salt;
}

/**
 * Overwrites the stored database salt with a new value.
 * This is primarily used when restoring a database from a backup.
 * @param {string} newSalt - The new salt to store (in hex format).
 */
function setDbSalt(newSalt) {
  if (!newSalt || typeof newSalt !== 'string' || newSalt.length < 32) {
    logError('setDbSalt received an invalid or missing salt.');
    return;
  }
  saltStore.set(DB_SALT_NAME, newSalt);
  log('Database salt has been updated.');
}

/**
 * Returns the file path of the salt configuration file.
 * @returns {string} The absolute path to the salt config file.
 */
function getSaltConfigPath() {
  return saltStore.path;
}

/**
 * Returns the derived JWT secret based on the DB encryption key using HKDF-SHA256.
 * @returns {string} The derived JWT secret as a hex string.
 */
function getJwtSecret() {
  const dbKey = getDbKey();
  const ikm = Buffer.from(dbKey, 'hex');
  const salt = Buffer.from('quran-jwt-salt-v1');
  const info = Buffer.from('quran-manager-jwt-secret-v1');
  const derived = crypto.hkdfSync('sha256', ikm, salt, info, 32);
  return Buffer.from(derived).toString('hex');
}

module.exports = {
  getDbKey,
  getDbSalt,
  setDbSalt,
  getSaltConfigPath,
  getJwtSecret,
};
