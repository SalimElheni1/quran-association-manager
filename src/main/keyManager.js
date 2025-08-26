const crypto = require('crypto');
const Store = require('electron-store');

// We use electron-store to save the database's unique encryption key.
// This key is generated once and stored securely on the user's machine.
const store = new Store({
  name: 'db-secure-config', // Use a different name to avoid conflicts
  encryptionKey: 'your-base64-encoded-master-key', // In a real app, use a more secure way to get this key
});

const DB_KEY_NAME = 'db-encryption-key';

/**
 * Retrieves the database encryption key.
 * If a key doesn't exist, it generates a new secure 256-bit key,
 * stores it, and returns it.
 * @returns {string} The database encryption key as a hex string.
 */
function getDbKey() {
  let key = store.get(DB_KEY_NAME);

  if (!key) {
    console.log('No database encryption key found. Generating a new one.');
    // Generate a secure, random 32-byte (256-bit) key.
    key = crypto.randomBytes(32).toString('hex');
    store.set(DB_KEY_NAME, key);
    console.log('New database encryption key generated and stored.');
  }

  return key;
}

module.exports = { getDbKey };
