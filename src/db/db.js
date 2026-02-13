const Database = require('better-sqlite3-multiple-ciphers');
const path = require('path');
const fs = require('fs');
const { app } = require('electron'); // <-- Import `app` from Electron
const crypto = require('crypto');
const schema = require('./schema');
const bcrypt = require('bcryptjs');
const { getDbKey, getDbSalt } = require('../main/keyManager');
const { log, error: logError, warn: logWarn } = require('../main/logger');

// --- Refactor: `db` is now a better-sqlite3 instance ---
let db; // This will hold our database connection object

// Helper function to get database file path
function getDatabasePath() {
  // Check if running in Electron or a plain Node.js script
  const isElectron = 'electron' in process.versions;

  let dbPath;

  if (isElectron && app) {
    // In Electron, use the reliable app.getPath('userData')
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    dbPath = path.join(userDataPath, 'quran_assoc_manager.sqlite');
  } else {
    // In a script (like the seeder), use a local path.
    // The .db directory will be created in the project root.
    const localDbDir = path.join(__dirname, '..', '..', '.db');
    if (!fs.existsSync(localDbDir)) {
      fs.mkdirSync(localDbDir, { recursive: true });
    }
    dbPath = path.join(localDbDir, 'quran_assoc_manager.sqlite');
    console.log(`Running in Node.js script, using local DB path: ${dbPath}`);
  }

  return dbPath;
}

async function seedSuperadmin() {
  try {
    // Check if a superadmin already exists using the multi-role system
    const existingAdmin = await getQuery(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'Superadmin'
    `);

    if (!existingAdmin) {
      log('No superadmin found. Seeding default superadmin...');

      const tempPassword = '123456';
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const username = 'superadmin';

      // Insert the user without the 'role' column (removed in migration 026)
      const insertSql = `
        INSERT INTO users (username, password, first_name, last_name, email)
        VALUES (?, ?, ?, ?, ?)
      `;

      const result = await runQuery(insertSql, [
        username,
        hashedPassword,
        'Super',
        'Admin',
        'superadmin@example.com',
      ]);

      if (result.id) {
        // Set the matricule
        const matricule = `U-${result.id.toString().padStart(6, '0')}`;
        await runQuery('UPDATE users SET matricule = ? WHERE id = ?', [matricule, result.id]);

        // Assign the Superadmin role using the multi-role system
        const superadminRole = await getQuery("SELECT id FROM roles WHERE name = 'Superadmin'");
        if (superadminRole) {
          await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.id, superadminRole.id]);
        } else {
          // If the role doesn't exist yet, insert it first
          const roleResult = await runQuery("INSERT INTO roles (name) VALUES ('Superadmin')");
          await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.id, roleResult.id]);
        }
      }

      log(`Superadmin created successfully: ${username}`);
      // Return the credentials so they can be displayed to the user
      return { username, password: tempPassword };
    }
    // If admin already exists, do nothing and return null
    return null;
  } catch (error) {
    logError('Failed to seed superadmin:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

/**
 * Checks if a database file is encrypted.
 * @param {string} filePath Path to the database file.
 * @returns {boolean} True if the file is encrypted or does not exist.
 */
function isDbEncrypted(filePath) {
  if (!fs.existsSync(filePath)) {
    return true; // A new DB will be created as encrypted.
  }
  // A plaintext SQLite DB starts with 'SQLite format 3\0'. An encrypted one will not.
  try {
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    return buffer.toString('utf8', 0, 16) !== 'SQLite format 3\u0000';
  } catch (err) {
    logError('Error checking if DB is encrypted:', err);
    return false;
  }
}

/**
 * Migrates a plaintext SQLite database to an encrypted database.
 * @param {string} dbPath The path to the database file.
 * @param {string} key The encryption key.
 */
async function migrateToEncrypted(dbPath, key) {
  log('Plaintext database detected. Starting migration to encrypted format...');

  // Implementation for better-sqlite3-multiple-ciphers rekey/migration
  // Basic strategy: open plaintext, rekey it.
  try {
    const tempDb = new Database(dbPath);
    // In improved-sqlite3-multiple-ciphers (sqlite3mc), we can typically just attach and rekey, 
    // or if the library supports it, use standard sqlcipher_export if compatible.
    // However, simplest valid approach with sqlite3mc often is:
    // 1. Open as plaintext.
    // 2. PRAGMA rekey = 'key';

    // Note: older better-sqlite3 bindings didn't support rekey easily. 
    // better-sqlite3-multiple-ciphers supports the "rekey" pragma for SQLCipher.

    log('Applying rekey pragma...');
    tempDb.pragma(`rekey = '${key}'`);
    // Force a write to ensure encryption is applied? VACUUM is often good practice.
    tempDb.exec('VACUUM');
    tempDb.close();

    log('Database migration completed successfully.');
  } catch (err) {
    logError('Migration failed:', err);
    throw err;
  }
}

async function runMigrations() {
  log('Checking for pending migrations...');
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir);
  }

  const migrationFiles = fs.readdirSync(migrationsDir).sort();
  const appliedMigrations = (await allQuery('SELECT name FROM migrations')).map((row) => row.name);

  // We need to use synchronous exec inside the loop, but we wrap it in our async logic.
  // Actually, since this function is async, we can just call our promisified helpers.
  // But for better-sqlite3 transaction logic, we can use the synchronous transaction feature.

  const applyMigration = db.transaction((file, migrationSql) => {
    db.exec(migrationSql);
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
  });

  for (const file of migrationFiles) {
    if (!appliedMigrations.includes(file)) {
      log(`Applying migration: ${file}`);
      try {
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        // better-sqlite3 transactions are synchronous.
        applyMigration(file, migrationSql);
        log(`Successfully applied migration: ${file}`);
      } catch (err) {
        // If the error is "duplicate column name", it means the migration was likely
        // already applied manually or in a previous failed run. We can safely ignore it.
        if (err.message.includes('duplicate column name')) {
          logWarn(`Warning: Migration ${file} failed with 'duplicate column'. Marking as applied.`);
          // Manually insert into migrations table so it doesn't run again
          try {
            db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(file);
          } catch (e) { logError('Failed to mark migration as ignored', e); }
        } else {
          logError(`Failed to apply migration ${file}:`, err);
          throw err;
        }
      }
    }
  }
  log('All migrations are up to date.');
}

/**
 * Initializes the database connection. This is the main entry point for the DB.
 * It handles key derivation, migration, and schema setup.
 */
async function initializeDatabase() {
  log('[DB_LOG] InitializeDatabase called (better-sqlite3).');
  if (db && db.open) {
    log('[DB_LOG] Database already open. Skipping initialization.');
    return; // Already initialized
  }

  const dbPath = getDatabasePath();
  log(`[DB_LOG] Database path: ${dbPath}`);
  const key = getDbKey();
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  log(`[DB_LOG] Using dedicated DB key. Key hash: ${keyHash}`);

  // --- Migration Check ---
  if (fs.existsSync(dbPath) && !isDbEncrypted(dbPath)) {
    log('[DB_LOG] Plaintext database detected. Starting migration...');
    try {
      await migrateToEncrypted(dbPath, key);
    } catch (migrationError) {
      logError('CRITICAL: Database migration failed.', migrationError);
      throw migrationError;
    }
  }

  const dbExists = fs.existsSync(dbPath);
  log(`[DB_LOG] Database file exists: ${dbExists}`);

  // --- Open the Database ---
  log('[DB_LOG] Opening database connection...');
  try {
    // Open database
    db = new Database(dbPath, { verbose: null }); // verbose: console.log for debug

    // Apply encryption key
    db.pragma(`key = '${key}'`);

    // DIAGNOSTIC START: Check if encryption is actually working
    try {
      const cipherVersion = db.pragma('cipher_version', { simple: true });
      log(`[DB_LOG] Cipher version: ${cipherVersion}`);
      if (!cipherVersion) {
        logWarn('[DB_LOG] Database encryption support missing or native module not offering cipher_version.');
      }
    } catch (verErr) {
      logWarn('[DB_LOG] Failed to query cipher version (Normal if not using multiple-ciphers build):', verErr.message);
    }
    // DIAGNOSTIC END

    // Test encryption / key
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get();
    } catch (keyErr) {
      // If this fails, it might be incorrect password or corrupt.
      if (keyErr.code === 'SQLITE_NOTADB') {
        log('[DB_LOG] Standard open failed (NOTADB). Attempting legacy compatibility mode (v3)...');
        try {
          db.close();
          db = new Database(dbPath, { verbose: null });
          db.pragma(`key = '${key}'`);
          db.pragma('cipher_compatibility = 3');

          db.prepare('SELECT count(*) FROM sqlite_master').get();
          log('[DB_LOG] Legacy compatibility mode (v3) successful.');
        } catch (retryErr) {
          logError('[DB_LOG] Legacy compatibility mode failed.', retryErr);

          // NEW FALLBACK: Try Migrating (v3 -> v4)
          log('[DB_LOG] Attempting automatic cipher migration (v3 -> v4)...');
          try {
            db.close();
            db = new Database(dbPath, { verbose: null });
            db.pragma(`key = '${key}'`);
            db.pragma('cipher_migrate');

            db.prepare('SELECT count(*) FROM sqlite_master').get();
            log('[DB_LOG] Cipher migration successful.');
          } catch (migrateErr) {
            logError('[DB_LOG] Cipher migration failed.', migrateErr);
            throw keyErr; // Throw original error after exhausting options
          }
        }
      } else {
        throw keyErr;
      }
    }

    log('[DB_LOG] Database connection object created and key verified.');

    // PRAGMAs
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Schema / Seeding
    let tempCredentials = null;
    if (!dbExists) {
      log('[DB_LOG] New database detected. Initializing schema and default data...');
      db.exec(schema);
      await runMigrations(); // This uses db, which is set now
      getDbSalt();
      log('[DB_LOG] Database salt created.');
      tempCredentials = await seedSuperadmin(); // Capture credentials
      log('[DB_LOG] Database schema and default data initialized.');
    } else {
      log('[DB_LOG] Existing database detected. Checking migrations...');
      await runMigrations();
    }

    log(`[DB_LOG] Database initialized successfully at ${dbPath}`);
    return tempCredentials;
  } catch (error) {
    db = null;
    logError(
      '[DB_LOG] Failed to open database. The password may be incorrect or the DB is corrupt.',
      error,
    );
    throw new Error('Incorrect password or corrupt database.');
  }
}

// --- Refactor: Promisify the synchronous API ---
// This maintains compatibility with the rest of the application.

function getDb() {
  if (!db || !db.open) {
    throw new Error('Database is not open. Call initializeDatabase(password) first.');
  }
  return db;
}

function dbRun(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const stmt = database.prepare(sql);
      const info = stmt.run(...params);
      resolve({ id: info.lastInsertRowid, changes: info.changes });
    } catch (err) {
      reject(err);
    }
  });
}

function runQuery(sql, params = []) {
  // Use module-level db implicitly if not passed, but matching original structure:
  // Original runQuery called dbRun(getDb(), ...)
  try {
    return dbRun(getDb(), sql, params);
  } catch (err) {
    return Promise.reject(err);
  }
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const stmt = getDb().prepare(sql);
      const row = stmt.get(...params);
      resolve(row);
    } catch (err) {
      reject(err);
    }
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const stmt = getDb().prepare(sql);
      const rows = stmt.all(...params);
      resolve(rows);
    } catch (err) {
      reject(err);
    }
  });
}

function dbExec(database, sql) {
  return new Promise((resolve, reject) => {
    try {
      database.exec(sql);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

// Close database connection
async function closeDatabase() {
  if (db && db.open) {
    try {
      db.close();
      db = null;
      log('Database connection closed.');
    } catch (err) {
      logError('Error closing database:', err);
      throw err;
    }
  }
}

function isDbOpen() {
  return db && db.open;
}

/**
 * Executes an async callback within a transaction.
 * Handles nested calls by only starting/committing at the top level.
 * Uses manual BEGIN/COMMIT since better-sqlite3 transaction() doesn't support async.
 * @param {Function} callback - Async function containing DB operations
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  if (!db || !db.open) throw new Error('Database not initialized');

  const isTopLevel = !db.inTransaction;

  if (isTopLevel) {
    db.prepare('BEGIN').run();
  }

  try {
    const result = await callback();
    if (isTopLevel) {
      db.prepare('COMMIT').run();
    }
    return result;
  } catch (err) {
    if (isTopLevel && db.inTransaction) {
      db.prepare('ROLLBACK').run();
    }
    throw err;
  }
}

module.exports = {
  initializeDatabase,
  closeDatabase,
  runQuery,
  getQuery,
  allQuery,
  getDb,
  getDatabasePath,
  isDbOpen,
  dbExec,
  withTransaction,
};
