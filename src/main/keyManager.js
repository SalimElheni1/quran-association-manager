const crypto = require('crypto');
const Store = require('electron-store');

// We use electron-store to save the public salt.
// This is NOT a secret. Its purpose is to make the key derivation unique per database.
const store = new Store({
  name: 'db-config',
});

const SALT_KEY = 'db-salt';

/**
 * Retrieves the database salt.
 * If a salt doesn't exist, it generates a new one, stores it, and returns it.
 * @returns {string} The salt as a hex string.
 */
function getSalt() {
  let salt = store.get(SALT_KEY);

  if (!salt) {
    console.warn('No database salt found. Generating a new one.');
    // A 16-byte salt is standard and secure.
    salt = crypto.randomBytes(16).toString('hex');
    store.set(SALT_KEY, salt);
  }

  return salt;
}

/**
 * Derives a 256-bit encryption key from a password and salt using PBKDF2.
 * @param {string} password The user's password.
 * @param {string} salt The database salt.
 * @returns {string} The derived key as a hex string.
 */
function deriveKey(password, salt) {
  const iterations = 250000; // High iteration count for security
  const keylen = 32; // 32 bytes = 256 bits
  const digest = 'sha512';
  return crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
}

module.exports = { getSalt, deriveKey };
