const sqlite3 = require('sqlite3').verbose();
const path = require('path');
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
      createTables();
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

function createTables() {
  db.exec(schema, (err) => {
    if (err) {
      console.error('Error creating tables:', err.message);
    } else {
      console.log('Tables created or already exist.');
      seedSuperadmin();
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
