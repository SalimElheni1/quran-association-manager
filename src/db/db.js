const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const schema = require('./schema');
const bcrypt = require('bcryptjs');

let db;

function initializeDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'quran_branch_manager.sqlite');

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Could not connect to database', err.message);
    } else {
      console.log('Connected to SQLite database at', dbPath);
      initializeSchema();
    }
  });
}

async function seedSuperadmin() {
  const sql = 'SELECT id FROM users WHERE role = ?';
  try {
    const existingAdmin = await getQuery(sql, ['Superadmin']);

    if (!existingAdmin) {
      console.log('No Superadmin found. Seeding default Superadmin...');
      const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
      const password = process.env.SUPERADMIN_PASSWORD;

      if (!password) {
        console.error('FATAL: SUPERADMIN_PASSWORD is not set in the .env file. Cannot seed admin.');
        return;
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      const insertSql = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
      await runQuery(insertSql, [username, hashedPassword, 'Superadmin']);
      console.log(`Default Superadmin created with username: ${username}`);
    }
  } catch (error) {
    console.error('Failed to seed Superadmin:', error);
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
        await new Promise((resolve, reject) => {
          db.exec(sql, (err) => (err ? reject(err) : resolve()));
        });
        await runQuery('INSERT INTO migrations (name) VALUES (?)', [file]);
        await runQuery('COMMIT;');
        console.log(`Successfully applied migration: ${file}`);
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err);
        await runQuery('ROLLBACK;');
        // Stop the app from continuing if a migration fails
        app.quit();
        return;
      }
    }
  }
  console.log('All migrations are up to date.');
}

async function initializeSchema() {
  db.exec(schema, (err) => {
    if (err) {
      console.error('Error creating tables:', err.message);
    } else {
      console.log('Tables created or already exist.');
      runMigrations().then(() => seedSuperadmin());
    }
  });
}

function runQuery(sql, params = []) {
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

module.exports = {
  initializeDatabase,
  runQuery,
  getQuery,
  allQuery,
};
