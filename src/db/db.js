/**
 * @fileoverview Database connection and management module for Quran Branch Manager.
 * Handles SQLCipher encrypted database operations, migrations, and initialization.
 * 
 * This module provides a secure, encrypted SQLite database using SQLCipher with
 * automatic key management, schema migrations, and connection pooling.
 * 
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 * @requires @journeyapps/sqlcipher - SQLCipher database driver
 * @requires electron - For app paths and user data directory
 * @requires crypto - For encryption key generation and hashing
 * @requires bcryptjs - For password hashing
 */

// Dependencies
const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const crypto = require('crypto');
const schema = require('./schema');
const bcrypt = require('bcryptjs');
const { getDbKey, getDbSalt } = require('../main/keyManager');
const { log, error: logError, warn: logWarn } = require('../main/logger');

// ============================================================================
// GLOBAL VARIABLES AND CONFIGURATION
// ============================================================================

/**
 * Global database connection object.
 * Managed by getDb() function to ensure proper initialization.
 * @type {sqlite3.Database|null}
 */
let db = null;

// ============================================================================
// DATABASE PATH AND CONFIGURATION FUNCTIONS
// ============================================================================

/**
 * Determines the appropriate database file path based on the runtime environment.
 * In Electron, uses app.getPath('userData') for persistent storage.
 * In Node.js scripts, uses a local .db directory in the project root.
 * 
 * @returns {string} The absolute path to the database file
 * @throws {Error} If unable to create the database directory
 */
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

// ============================================================================
// DATABASE INITIALIZATION AND SEEDING FUNCTIONS
// ============================================================================

/**
 * Seeds the database with a default superadmin user if none exists.
 * This function is called during initial database setup to ensure
 * there's always at least one admin user who can access the system.
 * 
 * @returns {Promise<Object|null>} Temporary credentials object if a new admin was created,
 *                                 null if an admin already exists
 * @returns {string} returns.username - The created username
 * @returns {string} returns.password - The temporary password
 * @throws {Error} If database operations fail
 */
async function seedSuperadmin() {
  try {
    // First check if there's a user with Superadmin role
    const existingAdmin = await getQuery(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'Superadmin'
    `);

    if (!existingAdmin) {
      // Check if there's a superadmin user without roles (from old system)
      const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', ['superadmin']);
      
      if (existingUser) {
        log('Found existing superadmin user without roles. Assigning Superadmin role...');
        const roleResult = await getQuery('SELECT id FROM roles WHERE name = ?', ['Superadmin']);
        if (roleResult) {
          await runQuery('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [existingUser.id, roleResult.id]);
          log('Superadmin role assigned to existing user.');
        }
        return null;
      }

      // Create new superadmin if none exists
      log('No superadmin found. Seeding default superadmin...');
      const tempPassword = '123456';
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const username = 'superadmin';

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
        const matricule = `U-${result.id.toString().padStart(6, '0')}`;
        await runQuery('UPDATE users SET matricule = ? WHERE id = ?', [matricule, result.id]);
        
        const roleResult = await getQuery('SELECT id FROM roles WHERE name = ?', ['Superadmin']);
        if (roleResult) {
          await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.id, roleResult.id]);
        }
      }

      log(`Superadmin created successfully: ${username}`);
      return { username, password: tempPassword };
    }
    return null;
  } catch (error) {
    logError('Failed to seed superadmin:', error);
    throw error;
  }
}

// ============================================================================
// DATABASE ENCRYPTION AND MIGRATION FUNCTIONS
// ============================================================================

/**
 * Checks if a database file is encrypted by examining its header.
 * SQLite databases start with 'SQLite format 3\0', while encrypted
 * databases have different headers due to encryption.
 * 
 * @param {string} filePath - Path to the database file to check
 * @returns {boolean} True if the file is encrypted or does not exist (new DB will be encrypted)
 * @throws {Error} If unable to read the database file
 */
function isDbEncrypted(filePath) {
  if (!fs.existsSync(filePath)) {
    return true; // A new DB will be created as encrypted
  }
  
  // A plaintext SQLite DB starts with 'SQLite format 3\0'. An encrypted one will not.
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);
  return buffer.toString('utf8', 0, 16) !== 'SQLite format 3\u0000';
}

/**
 * Migrates a plaintext SQLite database to an encrypted SQLCipher database.
 * This function is called when an existing plaintext database is detected
 * and needs to be converted to encrypted format for security.
 * 
 * The process involves:
 * 1. Backing up the original plaintext database
 * 2. Creating a new encrypted database
 * 3. Copying all data from plaintext to encrypted format
 * 4. Removing the plaintext backup
 * 
 * @param {string} dbPath - The path to the database file to migrate
 * @param {string} key - The encryption key to use for the new encrypted database
 * @returns {Promise<void>} Resolves when migration is complete
 * @throws {Error} If migration fails at any step
 */
async function migrateToEncrypted(dbPath, key) {
  log('Plaintext database detected. Starting migration to encrypted format...');
  const backupPath = `${dbPath}.old_plaintext`;

  // 1. Rename the existing plaintext DB to create a backup
  fs.renameSync(dbPath, backupPath);

  // 2. Open a new encrypted DB and export the content from the old one.
  return new Promise((resolve, reject) => {
    const encryptedDb = new sqlite3.Database(dbPath, async (err) => {
      if (err) return reject(err);
      try {
        await dbRun(encryptedDb, `PRAGMA key = '${key}'`);
        await dbRun(encryptedDb, `ATTACH DATABASE '${backupPath}' AS plaintext KEY ''`);
        await dbRun(encryptedDb, 'SELECT sqlcipher_export("main", "plaintext")');
        await dbRun(encryptedDb, 'DETACH DATABASE plaintext');
        await dbClose(encryptedDb);
        fs.unlinkSync(backupPath); // Delete the plaintext backup
        log('Database migration completed successfully.');
        resolve();
      } catch (migrationErr) {
        reject(migrationErr);
      }
    });
  });
}

async function runMigrations() {
  log('Checking for pending migrations...');
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir);
  }

  const migrationFiles = fs.readdirSync(migrationsDir).sort();
  const appliedMigrations = (await allQuery('SELECT name FROM migrations')).map((row) => row.name);

  for (const file of migrationFiles) {
    if (!appliedMigrations.includes(file)) {
      log(`Applying migration: ${file}`);
      try {
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await runQuery('BEGIN TRANSACTION;', []);
        await dbExec(db, migrationSql); // Use the raw exec for migration files
        await runQuery('INSERT INTO migrations (name) VALUES (?)', [file]);
        await runQuery('COMMIT;');
        log(`Successfully applied migration: ${file}`);
      } catch (err) {
        await runQuery('ROLLBACK;');
        // If the error is "duplicate column name", it means the migration was likely
        // already applied manually or in a previous failed run. We can safely ignore it.
        if (err.message.includes('duplicate column name')) {
          logWarn(`Warning: Migration ${file} failed with 'duplicate column'. Marking as applied.`);
          // Manually insert into migrations table so it doesn't run again
          await runQuery('INSERT OR IGNORE INTO migrations (name) VALUES (?)', [file]);
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
  log('[DB_LOG] InitializeDatabase called.');
  if (db && db.open) {
    log('[DB_LOG] Database already open. Skipping initialization.');
    return; // Already initialized
  }

  const dbPath = getDatabasePath();
  log(`[DB_LOG] Database path: ${dbPath}`);
  const key = getDbKey(); // <-- Use the new key manager
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  log(`[DB_LOG] Using dedicated DB key. Key hash: ${keyHash}`);

  // --- Migration Check ---
  if (fs.existsSync(dbPath) && !isDbEncrypted(dbPath)) {
    log('[DB_LOG] Plaintext database detected. Starting migration...');
    try {
      await migrateToEncrypted(dbPath, key);
    } catch (migrationError) {
      logError('CRITICAL: Database migration failed.', migrationError);
      // In a real app, you would show a fatal error dialog and quit.
      throw migrationError;
    }
  }

  const dbExists = fs.existsSync(dbPath);
  log(`[DB_LOG] Database file exists: ${dbExists}`);

  // --- Open the Database ---
  log('[DB_LOG] Opening database connection...');
  db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logError('[DB_LOG] Failed to create database connection object.', err);
        return reject(err);
      }
      log('[DB_LOG] Database connection object created.');
      resolve(connection);
    });
  });

  try {
    log('[DB_LOG] Setting PRAGMA key...');
    await dbRun(db, `PRAGMA key = '${key}'`);
    log('[DB_LOG] PRAGMA key set successfully.');

    log('[DB_LOG] Setting PRAGMA journal_mode...');
    await dbRun(db, 'PRAGMA journal_mode = WAL');
    log('[DB_LOG] PRAGMA journal_mode set to WAL.');

    log('[DB_LOG] Setting PRAGMA foreign_keys...');
    await dbRun(db, 'PRAGMA foreign_keys = ON');
    log('[DB_LOG] PRAGMA foreign_keys set to ON.');

    // --- Verify Key and Setup Schema/Seed if new ---
    log('[DB_LOG] Verifying database key with a test query...');
    await getQuery('SELECT count(*) FROM sqlite_master');
    log('[DB_LOG] Database key is correct.');

    let tempCredentials = null;
    if (!dbExists) {
      log('[DB_LOG] New database detected. Initializing schema and default data...');
      await dbExec(db, schema);
      await runMigrations();
      getDbSalt();
      log('[DB_LOG] Database salt created.');
      tempCredentials = await seedSuperadmin(); // Capture credentials
      log('[DB_LOG] Database schema and default data initialized.');
    } else {
      log('[DB_LOG] Existing database detected. Checking migrations...');
      await runMigrations();
    }

    log(`[DB_LOG] Database initialized successfully at ${dbPath}`);
    return tempCredentials; // Return credentials to the caller
  } catch (error) {
    db = null; // Clear the invalid db connection
    logError(
      '[DB_LOG] Failed to open database. The password may be incorrect or the DB is corrupt.',
      error,
    );
    throw new Error('Incorrect password or corrupt database.');
  }
}

// --- Refactor Step 3: Promisify the callback-based API ---
// This gives us clean async/await syntax for the rest of the app.

function getDb() {
  if (!db || !db.open) {
    throw new Error('Database is not open. Call initializeDatabase(password) first.');
  }
  return db;
}

function dbRun(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function runQuery(sql, params = []) {
  return dbRun(getDb(), sql, params);
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbExec(database, sql) {
  return new Promise((resolve, reject) => {
    database.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function dbClose(database) {
  return new Promise((resolve, reject) => {
    database.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// Close database connection
async function closeDatabase() {
  if (db && db.open) {
    await dbClose(db);
    db = null;
    log('Database connection closed.');
  }
}

function isDbOpen() {
  return db && db.open;
}

async function initializeTestDatabase(dbPath) {
  // Always close any existing connection before starting a test
  if (db && db.open) {
    await dbClose(db);
    db = null;
  }

  // Ensure a clean slate by deleting the old test DB if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  // Use a simple, non-secret key for tests
  const key = 'test-encryption-key';

  // Open the database
  db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      resolve(connection);
    });
  });

  try {
    // Set up encryption and pragmas
    await dbRun(db, `PRAGMA key = '${key}'`);
    await dbRun(db, 'PRAGMA journal_mode = WAL');
    await dbRun(db, 'PRAGMA foreign_keys = ON');

    // Build the schema and run migrations
    await dbExec(db, schema);
    await runMigrations(); // This function uses the global `db` object
    await seedSuperadmin(); // This function also uses the global `db` object

    log(`Test database initialized successfully at ${dbPath}`);
    return db;
  } catch (error) {
    logError('Failed to initialize test database:', error);
    await dbClose(db); // Clean up on failure
    db = null;
    throw error;
  }
}

module.exports = {
  initializeDatabase,
  initializeTestDatabase, // <-- Export the new function
  closeDatabase,
  runQuery,
  getQuery,
  allQuery,
  getDb,
  getDatabasePath,
  isDbOpen,
  dbExec,
};
