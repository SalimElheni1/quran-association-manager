// --- Refactor Step 1: Import new dependencies ---
const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron'); // <-- Import `app` from Electron
const schema = require('./schema');
const bcrypt = require('bcryptjs');
const { getSalt, deriveKey } = require('../main/keyManager');

// --- Refactor Step 2: `db` is now managed by `getDb` ---
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
    const existingSql = 'SELECT id FROM users WHERE role = ?';
    const existingAdmin = await getQuery(existingSql, ['Superadmin']);

    if (!existingAdmin) {
      console.log('No superadmin found. Creating superadmin from .env...');

      // Get values from .env with fallbacks
      const username = process.env.SUPERADMIN_USERNAME || 'admin';
      const password = process.env.SUPERADMIN_PASSWORD || 'Admin123!';
      const email = process.env.SUPERADMIN_EMAIL || 'admin@example.com';
      const firstName = process.env.SUPERADMIN_FIRST_NAME || 'System';
      const lastName = process.env.SUPERADMIN_LAST_NAME || 'Admin';

      // Use asynchronous bcrypt methods
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const insertSql = `
        INSERT INTO users (username, password, role, first_name, last_name, email)
        VALUES (?, ?, 'Superadmin', ?, ?, ?)
        ON CONFLICT(username) DO NOTHING;
      `;

      await runQuery(insertSql, [username, hashedPassword, firstName, lastName, email]);
      console.log(`Superadmin created successfully: ${username}`);
    }
  } catch (error) {
    console.error('Failed to seed superadmin:', error);
    throw error;
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
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);
  return buffer.toString('utf8', 0, 16) !== 'SQLite format 3\u0000';
}

/**
 * Migrates a plaintext SQLite database to an encrypted SQLCipher database.
 * @param {string} dbPath The path to the database file.
 * @param {string} key The encryption key.
 */
async function migrateToEncrypted(dbPath, key) {
  console.log('Plaintext database detected. Starting migration to encrypted format...');
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
        console.log('Database migration completed successfully.');
        resolve();
      } catch (migrationErr) {
        reject(migrationErr);
      }
    });
  });
}

async function runMigrations() {
  console.log('Checking for pending migrations...');
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir);
  }

  const migrationFiles = fs.readdirSync(migrationsDir).sort();
  const appliedMigrations = (await allQuery('SELECT name FROM migrations')).map((row) => row.name);

  for (const file of migrationFiles) {
    if (!appliedMigrations.includes(file)) {
      console.log(`Applying migration: ${file}`);
      try {
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await runQuery('BEGIN TRANSACTION;', []);
        await dbExec(db, migrationSql); // Use the raw exec for migration files
        await runQuery('INSERT INTO migrations (name) VALUES (?)', [file]);
        await runQuery('COMMIT;');
        console.log(`Successfully applied migration: ${file}`);
      } catch (err) {
        await runQuery('ROLLBACK;');
        // If the error is "duplicate column name", it means the migration was likely
        // already applied manually or in a previous failed run. We can safely ignore it.
        if (err.message.includes('duplicate column name')) {
          console.warn(
            `Warning: Migration ${file} failed with 'duplicate column'. Marking as applied.`,
          );
          // Manually insert into migrations table so it doesn't run again
          await runQuery('INSERT OR IGNORE INTO migrations (name) VALUES (?)', [file]);
        } else {
          console.error(`Failed to apply migration ${file}:`, err);
          throw err;
        }
      }
    }
  }
  console.log('All migrations are up to date.');
}

/**
 * Initializes the database connection. This is the main entry point for the DB.
 * It handles key derivation, migration, and schema setup.
 * @param {string} password The user's password, used to derive the encryption key.
 */
async function initializeDatabase(password) {
  if (db && db.open) {
    return; // Already initialized
  }

  const dbPath = getDatabasePath();
  const salt = getSalt();
  const key = deriveKey(password, salt);

  // --- Migration Check ---
  if (fs.existsSync(dbPath) && !isDbEncrypted(dbPath)) {
    try {
      await migrateToEncrypted(dbPath, key);
    } catch (migrationError) {
      console.error('CRITICAL: Database migration failed.', migrationError);
      // In a real app, you would show a fatal error dialog and quit.
      throw migrationError;
    }
  }

  const dbExists = fs.existsSync(dbPath);

  // --- Open the Database ---
  db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(dbPath, (err) =>
      err ? reject(err) : resolve(connection),
    );
  });

  await dbRun(db, `PRAGMA key = '${key}'`);
  await dbRun(db, 'PRAGMA journal_mode = WAL');
  await dbRun(db, 'PRAGMA foreign_keys = ON');

  // --- Verify Key and Setup Schema/Seed if new ---
  try {
    // This simple query will fail if the key is wrong.
    await getQuery('SELECT count(*) FROM sqlite_master');

    if (!dbExists) {
      console.log('New database created. Initializing schema and default data...');
      await dbExec(db, schema);
      await runMigrations();
      await seedSuperadmin();
      console.log('Database schema and default data initialized.');
    } else {
      // For existing DBs, we still check migrations
      await runMigrations();
    }

    console.log(`Database initialized successfully at ${dbPath}`);
  } catch (error) {
    db = null; // Clear the invalid db connection
    console.error('Failed to open database. The password may be incorrect.', error);
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
    console.log('Database connection closed.');
  }
}

function isDbOpen() {
  return db && db.open;
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
};
