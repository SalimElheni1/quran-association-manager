const crypto = require('crypto');
const Store = require('electron-store');
const { log, error: logError, warn: logWarn } = require('./logger');

let keytar = null;
try {
  keytar = require('keytar');
} catch (err) {
  keytar = null;
}

const SERVICE_NAME = 'QuranBranchManager';
const DB_KEY_NAME = 'db-encryption-key';
const DB_SALT_NAME = 'db-salt';

// Store fallback for when keytar is unavailable
const keyStore = new Store({
  name: 'db-secure-config',
});

const saltStore = new Store({ name: 'db-salt-config' });

let inMemoryDbKey = null;
let inMemoryDbSalt = null;

/**
 * Initializes keys from OS Keychain if available
 */
async function initKeysFromKeytar() {
  if (!keytar) return;
  try {
    const key = await keytar.getPassword(SERVICE_NAME, DB_KEY_NAME);
    if (key) {
      inMemoryDbKey = key;
      keyStore.set(DB_KEY_NAME, key);
    }
    const salt = await keytar.getPassword(SERVICE_NAME, DB_SALT_NAME);
    if (salt) {
      inMemoryDbSalt = salt;
      saltStore.set(DB_SALT_NAME, salt);
    }
  } catch (err) {
    logWarn('Keytar read error:', err.message);
  }
}

/**
 * Retrieves the database encryption key.
 * @returns {string} The database encryption key as a hex string.
 */
function getDbKey() {
  if (inMemoryDbKey) {
    return inMemoryDbKey;
  }

  let key = keyStore.get(DB_KEY_NAME);

  if (!key) {
    log('No database encryption key found. Generating a new one.');
    key = crypto.randomBytes(32).toString('hex');
    keyStore.set(DB_KEY_NAME, key);
    log('New database encryption key generated and stored.');

    if (keytar) {
      keytar.setPassword(SERVICE_NAME, DB_KEY_NAME, key).catch((err) => {
        logWarn('Failed to save DB key to OS Keychain:', err.message);
      });
    }
  }

  inMemoryDbKey = key;
  return key;
}

/**
 * Retrieves the database salt.
 * @returns {string} The database salt as a hex string.
 */
function getDbSalt() {
  if (inMemoryDbSalt) {
    return inMemoryDbSalt;
  }

  let salt = saltStore.get(DB_SALT_NAME);

  if (!salt) {
    log('No database salt found. Generating a new one.');
    salt = crypto.randomBytes(16).toString('hex');
    saltStore.set(DB_SALT_NAME, salt);
    log('New database salt generated and stored.');

    if (keytar) {
      keytar.setPassword(SERVICE_NAME, DB_SALT_NAME, salt).catch((err) => {
        logWarn('Failed to save DB salt to OS Keychain:', err.message);
      });
    }
  }

  inMemoryDbSalt = salt;
  return salt;
}

/**
 * Overwrites the stored database salt with a new value.
 * @param {string} newSalt - The new salt to store (in hex format).
 */
function setDbSalt(newSalt) {
  if (!newSalt || typeof newSalt !== 'string' || newSalt.length < 32) {
    logError('setDbSalt received an invalid or missing salt.');
    return;
  }
  saltStore.set(DB_SALT_NAME, newSalt);
  inMemoryDbSalt = newSalt;
  if (keytar) {
    keytar.setPassword(SERVICE_NAME, DB_SALT_NAME, newSalt).catch((err) => {
      logWarn('Failed to update DB salt in OS Keychain:', err.message);
    });
  }
  log('Database salt has been updated.');
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

/**
 * Returns the file path of the salt configuration file.
 * @returns {string} The absolute path to the salt config file.
 */
function getSaltConfigPath() {
  return saltStore.path;
}

/**
 * Resets in-memory key cache (useful for testing)
 */
function _resetInMemoryCache() {
  inMemoryDbKey = null;
  inMemoryDbSalt = null;
}

module.exports = {
  getDbKey,
  getDbSalt,
  setDbSalt,
  getJwtSecret,
  getSaltConfigPath,
  initKeysFromKeytar,
  _resetInMemoryCache,
};
