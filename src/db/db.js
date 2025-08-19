const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const schema = require('./schema');
const bcrypt = require('bcryptjs');

let db;
let isDatabaseInitialized = false;

// Helper function to execute raw SQL safely
async function execSql(sql, errorMessage = 'Error executing SQL') {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        console.error(errorMessage, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to get database file path
function getDatabasePath() {
  let userDataPath;

  // Always use the same path as the Electron app, even when running standalone
  // This ensures consistency between the app and manual seeder
  const os = require('os');

  // Use the same path structure as Electron's userData
  // On Windows: C:\Users\[username]\AppData\Roaming\quran-branch-manager
  // On macOS: ~/Library/Application Support/quran-branch-manager
  // On Linux: ~/.config/quran-branch-manager
  const appName = 'quran-branch-manager';

  let basePath;
  switch (process.platform) {
    case 'win32':
      basePath = path.join(os.homedir(), 'AppData', 'Roaming', appName);
      break;
    case 'darwin':
      basePath = path.join(os.homedir(), 'Library', 'Application Support', appName);
      break;
    default: // linux and others
      basePath = path.join(os.homedir(), '.config', appName);
      break;
  }

  userDataPath = basePath;

  // Ensure the directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  return path.join(userDataPath, 'database.sqlite');
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
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await runQuery('BEGIN TRANSACTION;');
        await execSql(sql);
        await runQuery('INSERT INTO migrations (name) VALUES (?)', [file]);
        await runQuery('COMMIT;');
        console.log(`Successfully applied migration: ${file}`);
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err);
        await runQuery('ROLLBACK;');
        throw err;
      }
    }
  }
  console.log('All migrations are up to date.');
}

async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    const dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);

    // Create database directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      db = new sqlite3.Database(
        dbPath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        async (err) => {
          if (err) {
            console.error('Error opening database:', err.message);
            reject(err);
            return;
          }

          try {
            // Mark database as initialized immediately after connection
            isDatabaseInitialized = true;

            // Initialize schema and run migrations
            console.log('Step 1/4: Creating base schema...');
            await execSql(schema);

            console.log('Step 2/4: Running pending migrations...');
            await runMigrations();

            console.log('Step 3/4: Setting up superadmin...');
            await seedSuperadmin();

            console.log('Step 4/4: Database ready for use');
            // Note: Demo/sample data seeding is now manual via npm run seed:manual

            // Log final counts (only superadmin and schema)
            const counts = await allQuery(`
      SELECT 
        (SELECT COUNT(*) FROM branches) as branches,
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM teachers) as teachers,
        (SELECT COUNT(*) FROM students) as students,
        (SELECT COUNT(*) FROM classes) as classes
    `);

            console.log('Database initialization completed:');
            console.log(`- Branches: ${counts[0].branches}`);
            console.log(`- Users: ${counts[0].users} (including superadmin from .env)`);
            console.log(`- Teachers: ${counts[0].teachers}`);
            console.log(`- Students: ${counts[0].students}`);
            console.log(`- Classes: ${counts[0].classes}`);
            console.log('💡 Run "npm run seed:manual" to populate demo data');

            console.log('Database initialized successfully');
            resolve(true);
          } catch (error) {
            console.error('Error during database initialization:', error);
            isDatabaseInitialized = false;
            reject(error);
          }
        },
      );
    });
  } catch (error) {
    console.error('Error in initializeDatabase:', error);
    throw error;
  }
}

function runQuery(sql, params = []) {
  if (!isDatabaseInitialized) {
    console.error('Database is not initialized.');
    return Promise.reject(new Error('Database is not initialized.'));
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        console.error('DB Error:', err.message, 'SQL:', sql, 'Params:', params);
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

function getQuery(sql, params = []) {
  if (!isDatabaseInitialized) {
    console.error('Database is not initialized.');
    return Promise.reject(new Error('Database is not initialized.'));
  }
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('DB Error:', err.message, 'SQL:', sql, 'Params:', params);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function allQuery(sql, params = []) {
  if (!isDatabaseInitialized) {
    console.error('Database is not initialized.');
    return Promise.reject(new Error('Database is not initialized.'));
  }
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('DB Error:', err.message, 'SQL:', sql, 'Params:', params);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Close database connection
function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
          reject(err);
        } else {
          isDatabaseInitialized = false;
          console.log('Database connection closed');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  initializeDatabase,
  closeDatabase,
  runQuery,
  getQuery,
  allQuery,
  getDatabasePath,
};
