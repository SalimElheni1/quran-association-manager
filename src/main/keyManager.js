import crypto from 'crypto';
import Store from 'electron-store';
import { log } from '@main/logger';

// Store for the master encryption key for the database file itself
const keyStore = new Store({
  name: 'db-secure-config',
  // In a real app, use a more secure way to get this key,
  // e.g., from the OS keychain or a hardware-backed store.
  encryptionKey: 'your-base64-encoded-master-key',
});

// Store for the salt used in password hashing and other crypto operations
const saltStore = new Store({ name: 'db-salt-config' });

const DB_KEY_NAME = 'db-encryption-key';
const DB_SALT_NAME = 'db-salt';

/**
 * Retrieves the database encryption key.
 * If a key doesn't exist, it generates a new secure 256-bit key,
 * stores it, and returns it.
 * @returns {string} The database encryption key as a hex string.
 */
export function getDbKey() {
  let key = keyStore.get(DB_KEY_NAME);

  if (!key) {
    log('No database encryption key found. Generating a new one.');
    key = crypto.randomBytes(32).toString('hex');
    keyStore.set(DB_KEY_NAME, key);
    log('New database encryption key generated and stored.');
  }

  return key;
}

/**
 * Retrieves the database salt.
 * If a salt doesn't exist, it generates a new secure 128-bit salt,
 * stores it, and returns it.
 * @returns {string} The database salt as a hex string.
 */
export function getDbSalt() {
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
export function setDbSalt(newSalt) {
  if (!newSalt || typeof newSalt !== 'string' || newSalt.length < 32) {
    log.error('setDbSalt received an invalid or missing salt.');
    return;
  }
  saltStore.set(DB_SALT_NAME, newSalt);
  log('Database salt has been updated.');
}

/**
 * Returns the file path of the salt configuration file.
 * @returns {string} The absolute path to the salt config file.
 */
export function getSaltConfigPath() {
  return saltStore.path;
}
