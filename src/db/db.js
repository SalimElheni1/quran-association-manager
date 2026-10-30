const Database = require('better-sqlite3-multiple-ciphers');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const { app } = require('electron'); // <-- Import `app` from Electron
const schema = require('./schema');
const {
  getDbKey,
  getDbSalt,
  validateHexKey,
  generateDbKey,
  getPendingDbKey,
  setPendingDbKey,
  promotePendingDbKey,
  clearPendingDbKey,
} = require('../main/keyManager');
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

/**
 * Checks whether a Superadmin user already exists.
 * SEC-04: no default credentials are ever seeded; the first superadmin is
 * created through the first-run setup flow (auth:setup-superadmin).
 * @returns {Promise<boolean>} True when at least one Superadmin exists.
 */
async function hasSuperadmin() {
  try {
    const existingAdmin = await getQuery(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'Superadmin' AND u.deleted_at IS NULL
    `);
    return !!existingAdmin;
  } catch (error) {
    logError('Failed to check for existing superadmin:', error);
    throw error;
  }
}

/**
 * Creates the first Superadmin user with the given credentials.
 * Used exclusively by the first-run setup flow (SEC-04). The password must
 * already be hashed by the caller.
 * @param {string} username - The chosen username (must be unique).
 * @param {string} hashedPassword - The bcrypt-hashed password.
 * @returns {Promise<{id: number, username: string}>} The created user.
 */
async function createSuperadminUser(username, hashedPassword) {
  const existing = await getQuery('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    throw new Error('اسم المستخدم هذا موجود مسبقاً. الرجاء اختيار اسم آخر.');
  }

  const result = await runQuery(
    'INSERT INTO users (username, password, first_name, last_name, email) VALUES (?, ?, ?, ?, ?)',
    [username, hashedPassword, 'Super', 'Admin', `${username}@local.local`],
  );

  if (!result.id) {
    throw new Error('فشل إنشاء المستخدم.');
  }

  // Same 4-digit form as matriculeService (U-0001); the user validation only accepts that.
  const matricule = `U-${result.id.toString().padStart(4, '0')}`;
  await runQuery('UPDATE users SET matricule = ? WHERE id = ?', [matricule, result.id]);

  const superadminRole = await getQuery("SELECT id FROM roles WHERE name = 'Superadmin'");
  if (superadminRole) {
    await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      result.id,
      superadminRole.id,
    ]);
  } else {
    const roleResult = await runQuery("INSERT INTO roles (name) VALUES ('Superadmin')");
    await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      result.id,
      roleResult.id,
    ]);
  }

  log(`Superadmin created successfully: ${username}`);
  return { id: result.id, username };
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
 * Sets the SQLCipher `key` or `rekey` PRAGMA. The key is validated first (64 hex characters),
 * so nothing but a hex string ever reaches the PRAGMA text.
 * @param {import('better-sqlite3-multiple-ciphers').Database} database
 * @param {'key'|'rekey'} pragmaName
 * @param {string} key
 */
function applyKeyPragma(database, pragmaName, key) {
  validateHexKey(key);
  database.pragma(`${pragmaName} = '${key}'`);
}

/**
 * Whether `key` opens the database file at `dbPath` (a separate, short-lived connection).
 * @returns {boolean}
 */
function openWithKey(dbPath, key) {
  let probe;
  try {
    probe = new Database(dbPath, { fileMustExist: true });
    applyKeyPragma(probe, 'key', key);
    probe.prepare('SELECT count(*) FROM sqlite_master').get();
    return true;
  } catch {
    return false;
  } finally {
    if (probe) probe.close();
  }
}

/**
 * SEC-017: re-encrypts the open database with a new random key.
 * Crash-safe order: the new key is stored as pending, the file is re-keyed (SQLite3MultipleCiphers
 * cannot re-key in WAL mode, so the journal is switched to DELETE for the duration), the new key
 * is verified with a second connection, and only then becomes the live key. initializeDatabase
 * finishes or discards a rotation that was interrupted.
 * Callers must make sure backups do not depend on the old key (the association transfer key is
 * set) and must re-derive the JWT secret and end every session afterwards.
 * No screen offers this any more (the database key stays automatic and invisible); it is kept,
 * with its tests, together with the recovery of interrupted rotations in initializeDatabase.
 * @returns {Promise<void>}
 */
async function rotateDatabaseKey() {
  if (!db || !db.open) throw new Error('Database is not open.');
  const dbPath = getDatabasePath();
  const newKey = generateDbKey();
  setPendingDbKey(newKey);
  try {
    db.pragma('journal_mode = DELETE');
    applyKeyPragma(db, 'rekey', newKey);
  } catch (rekeyError) {
    clearPendingDbKey();
    db.pragma('journal_mode = WAL');
    throw rekeyError;
  }
  if (!openWithKey(dbPath, newKey)) {
    // The file may already use the new key: keep it pending so the next start can recover.
    throw new Error('The database could not be opened with the new key after re-keying.');
  }
  promotePendingDbKey();
  db.pragma('journal_mode = WAL');
  log('[DB_LOG] Database encryption key rotated.');
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
    applyKeyPragma(tempDb, 'rekey', key);
    // Force a write to ensure encryption is applied? VACUUM is often good practice.
    tempDb.exec('VACUUM');
    tempDb.close();

    log('Database migration completed successfully.');
  } catch (err) {
    logError('Migration failed:', err);
    throw err;
  }
}

// An "ALTER TABLE t ADD [COLUMN] c ..." statement of a migration file.
const ADD_COLUMN_STATEMENT =
  /ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+(?:COLUMN\s+)?["`]?(\w+)["`]?[^;]*;?/gi;

/**
 * The migration's SQL without the ADD COLUMN statements whose column the table already has (a
 * column added by an earlier migration too, or by hand), so the rest of the file still runs. Any
 * other error fails the migration: a migration is only recorded once all of it ran.
 * @param {string} migrationSql
 * @returns {string}
 */
function withoutExistingColumns(migrationSql) {
  return migrationSql.replace(ADD_COLUMN_STATEMENT, (statement, table, column) => {
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
    if (!columns.some((c) => c.name === column)) return statement;
    logWarn(`Migration: ${table}.${column} already exists; its ADD COLUMN is skipped.`);
    return `-- ${table}.${column} already exists\n`;
  });
}

/** Logs the rows whose foreign keys point nowhere (migrations run with the checks off). */
function reportForeignKeyProblems() {
  const problems = db.pragma('foreign_key_check');
  if (problems.length === 0) return;
  const byTable = {};
  problems.forEach(({ table, parent }) => {
    const key = `${table} -> ${parent}`;
    byTable[key] = (byTable[key] || 0) + 1;
  });
  logWarn('[DB_LOG] Rows with a broken foreign key after the migrations:', byTable);
}

async function runMigrations() {
  log('Checking for pending migrations...');
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir);
  }

  const migrationFiles = fs.readdirSync(migrationsDir).sort();
  const appliedMigrations = (await allQuery('SELECT name FROM migrations')).map((row) => row.name);

  // better-sqlite3 transactions are synchronous: a migration file runs, and is recorded, whole.
  const applyMigration = db.transaction((file, migrationSql) => {
    db.exec(withoutExistingColumns(migrationSql));
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
  });

  let appliedNow = 0;
  for (const file of migrationFiles) {
    if (!appliedMigrations.includes(file)) {
      log(`Applying migration: ${file}`);
      const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      // PRAGMA foreign_keys cannot be changed inside a transaction, and some
      // table-rebuild migrations (e.g. 052 receipt_books) DROP a table that
      // child tables reference. Disable FK enforcement around the migration so
      // the rebuild succeeds; child references are by name and survive the rename.
      db.pragma('foreign_keys = OFF');
      try {
        applyMigration(file, migrationSql);
        appliedNow++;
        log(`Successfully applied migration: ${file}`);
      } catch (err) {
        logError(`Failed to apply migration ${file}:`, err);
        throw err;
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  }
  if (appliedNow > 0) reportForeignKeyProblems();
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
  // Rejected here, before the database file is touched, when it is not 64 hex characters.
  const key = validateHexKey(getDbKey());

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
    applyKeyPragma(db, 'key', key);

    // DIAGNOSTIC START: Check if encryption is actually working
    try {
      // SQLite3MultipleCiphers reports its active scheme through PRAGMA cipher
      // (it has no SQLCipher-style cipher_version).
      const cipherVersion = db.pragma('cipher', { simple: true });
      log(`[DB_LOG] Cipher: ${cipherVersion}`);
      if (!cipherVersion) {
        logWarn(
          '[DB_LOG] Database encryption support missing or native module not offering cipher_version.',
        );
      }
    } catch (verErr) {
      logWarn(
        '[DB_LOG] Failed to query cipher version (Normal if not using multiple-ciphers build):',
        verErr.message,
      );
    }
    // DIAGNOSTIC END

    // Test encryption / key
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get();
    } catch (keyErr) {
      // A key rotation that stopped after re-keying the file but before promoting the new
      // key (SEC-017): the pending key opens the database; make it the live key.
      const pendingKey = keyErr.code === 'SQLITE_NOTADB' ? getPendingDbKey() : null;
      if (pendingKey && openWithKey(dbPath, pendingKey)) {
        log('[DB_LOG] Opened with the pending rotated key; finishing the key rotation.');
        db.close();
        db = new Database(dbPath, { verbose: null });
        applyKeyPragma(db, 'key', pendingKey);
        promotePendingDbKey();
      } else if (keyErr.code === 'SQLITE_NOTADB') {
        // If this fails, it might be incorrect password or corrupt.
        log('[DB_LOG] Standard open failed (NOTADB). Attempting legacy compatibility mode (v3)...');
        try {
          db.close();
          db = new Database(dbPath, { verbose: null });
          applyKeyPragma(db, 'key', key);
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
            applyKeyPragma(db, 'key', key);
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
    // A pending key left by a rotation that stopped before re-keying was never applied.
    if (getPendingDbKey() && !openWithKey(dbPath, getPendingDbKey())) {
      clearPendingDbKey();
    }

    // PRAGMAs
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Schema / Seeding
    if (!dbExists) {
      log('[DB_LOG] New database detected. Initializing schema...');
      db.exec(schema);
      await runMigrations(); // This uses db, which is set now
      getDbSalt();
      log('[DB_LOG] Database salt created.');
      // SEC-04: no default superadmin is seeded. The first-run setup flow
      // (auth:setup-superadmin) creates the first Superadmin account.
      log('[DB_LOG] Database schema initialized. First-run superadmin setup required.');
    } else {
      log('[DB_LOG] Existing database detected. Checking migrations...');
      await runMigrations();
    }

    // Ensure the Quran reference data (surahs/hizbs) exists so the
    // memorization pickers are usable on fresh installs. Both seed
    // functions are idempotent (they skip when the tables are non-empty),
    // so this never overwrites or duplicates existing reference data.
    try {
      const { seedSurahs, seedHizbs } = require('./seederFunctions');
      await seedSurahs();
      await seedHizbs();
    } catch (seedError) {
      logWarn('[DB_LOG] Could not ensure surahs/hizbs reference data:', seedError.message);
    }

    log(`[DB_LOG] Database initialized successfully at ${dbPath}`);
  } catch (error) {
    db = null;
    // A missing or broken native module fails to load before the database is even touched;
    // don't report that as a bad password.
    if (error && error.code === 'ERR_DLOPEN_FAILED') {
      logError('[DB_LOG] Failed to load the SQLite native module.', error);
      const nativeError = new Error(
        'The SQLite native module could not be loaded (its package is incomplete). ' +
          'Reinstall the dependencies with `npm ci`.',
      );
      nativeError.code = 'ERR_DLOPEN_FAILED';
      throw nativeError;
    }
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

// One connection serves every IPC call, so a transaction belongs to the call chain that opened
// it (tracked with AsyncLocalStorage, which follows awaits, timers and callbacks). While it is
// open, the queries and transactions of other call chains wait for it to end: they never read
// its uncommitted rows, never get rolled back with it, and never commit it half-way.
const transactionScope = new AsyncLocalStorage();
// Settles when the transaction now running (if any) ends.
let openTransaction = null;
// Settles when the last transaction queued so far has ended.
let transactionQueue = Promise.resolve();

// The store is { open } and is closed when the transaction ends: work started inside it that
// finishes later is not "inside" any more.
const inOwnTransaction = () => transactionScope.getStore()?.open === true;

/** Runs `query` now, or once another call chain's open transaction has ended. */
function whenNoOtherTransaction(query) {
  if (!openTransaction || inOwnTransaction()) {
    return new Promise((resolve, reject) => {
      try {
        resolve(query());
      } catch (err) {
        reject(err);
      }
    });
  }
  return transactionQueue.then(() => whenNoOtherTransaction(query));
}

function runQuery(sql, params = []) {
  return whenNoOtherTransaction(() => {
    const info = getDb()
      .prepare(sql)
      .run(...params);
    return { id: info.lastInsertRowid, changes: info.changes };
  });
}

function getQuery(sql, params = []) {
  return whenNoOtherTransaction(() =>
    getDb()
      .prepare(sql)
      .get(...params),
  );
}

function allQuery(sql, params = []) {
  return whenNoOtherTransaction(() =>
    getDb()
      .prepare(sql)
      .all(...params),
  );
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
 * Executes an async callback within a transaction (manual BEGIN/COMMIT: better-sqlite3's
 * transaction() is synchronous). A call from inside a transaction of the same call chain joins
 * it; a call from another chain waits until no other transaction is open.
 * @param {Function} callback - Async function containing DB operations
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  if (!db || !db.open) throw new Error('Database not initialized');
  // Called from inside a transaction of the same call chain: part of it.
  if (inOwnTransaction()) return callback();

  // One transaction at a time: wait for the ones queued before this one.
  const previous = transactionQueue;
  let finished;
  transactionQueue = new Promise((resolve) => {
    finished = resolve;
  });
  await previous;

  openTransaction = transactionQueue;
  const scope = { open: true };
  try {
    return await transactionScope.run(scope, async () => {
      db.prepare('BEGIN').run();
      try {
        const result = await callback();
        db.prepare('COMMIT').run();
        return result;
      } catch (err) {
        if (db.inTransaction) db.prepare('ROLLBACK').run();
        throw err;
      }
    });
  } finally {
    scope.open = false;
    openTransaction = null;
    finished();
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
  hasSuperadmin,
  createSuperadminUser,
  rotateDatabaseKey,
  withoutExistingColumns,
};
