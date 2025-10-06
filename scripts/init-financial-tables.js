/**
 * Initialize financial tables in the main database
 */

const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const path = require('path');
const fs = require('fs');

const { getDbKey } = require('../src/main/keyManager');
const DB_PATH = path.join(__dirname, '..', '.db', 'quran_assoc_manager.sqlite');
const KEY = getDbKey();

async function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('SQL Error:', err.message);
        console.error('SQL:', sql);
        console.error('Params:', params);
        reject(err);
      }
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

async function initializeTables() {
  console.log('🚀 Initializing financial tables...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database not found at:', DB_PATH);
    console.error('Please make sure the application has been run at least once.');
    process.exit(1);
  }

  const db = new sqlite3.Database(DB_PATH);
  
  try {
    await runQuery(db, `PRAGMA key = '${KEY}'`);
    
    // Create accounts table
    console.log('📦 Creating accounts table...');
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('CASH', 'BANK')),
        account_number TEXT,
        initial_balance REAL DEFAULT 0.0,
        current_balance REAL DEFAULT 0.0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Accounts table created\n');

    // Create categories table
    console.log('📦 Creating categories table...');
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
        description TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);
    console.log('✅ Categories table created\n');

    // Create transactions table
    console.log('📦 Creating transactions table...');
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date DATE NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        payment_method TEXT CHECK(payment_method IN ('CASH', 'CHECK', 'TRANSFER')),
        check_number TEXT,
        voucher_number TEXT UNIQUE,
        related_entity_type TEXT,
        related_entity_id INTEGER,
        related_person_name TEXT,
        account_id INTEGER NOT NULL,
        requires_dual_signature INTEGER DEFAULT 0,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `);
    console.log('✅ Transactions table created\n');

    // Seed default account
    console.log('🌱 Seeding default account...');
    await runQuery(db, `
      INSERT OR IGNORE INTO accounts (id, name, type, initial_balance, current_balance)
      VALUES (1, 'الخزينة', 'CASH', 0.0, 0.0)
    `);
    console.log('✅ Default account seeded\n');

    // Seed categories
    console.log('🌱 Seeding categories...');
    const categories = [
      ['رسوم الطلاب', 'INCOME', 'Student registration and monthly fees'],
      ['التبرعات النقدية', 'INCOME', 'Cash donations'],
      ['التبرعات العينية', 'INCOME', 'In-kind donations'],
      ['دعم حكومي', 'INCOME', 'Government support'],
      ['مداخيل أخرى', 'INCOME', 'Other income'],
      ['رواتب المعلمين', 'EXPENSE', 'Teacher salaries'],
      ['رواتب الإداريين', 'EXPENSE', 'Administrative salaries'],
      ['الإيجار', 'EXPENSE', 'Rent'],
      ['الكهرباء والماء', 'EXPENSE', 'Utilities'],
      ['القرطاسية', 'EXPENSE', 'Stationery'],
      ['الصيانة', 'EXPENSE', 'Maintenance'],
      ['مصاريف أخرى', 'EXPENSE', 'Other expenses']
    ];

    for (const [name, type, description] of categories) {
      await runQuery(db, `
        INSERT OR IGNORE INTO categories (name, type, description, is_active)
        VALUES (?, ?, ?, 1)
      `, [name, type, description]);
    }
    console.log('✅ Categories seeded\n');

    // Verify categories were inserted
    console.log('🔍 Verifying categories...');
    const verifyQuery = new Promise((resolve, reject) => {
      db.all('SELECT * FROM categories', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const insertedCategories = await verifyQuery;
    console.log(`Found ${insertedCategories.length} categories in database:`);
    insertedCategories.forEach(cat => {
      console.log(`  - ${cat.name} (${cat.type})`);
    });

    console.log('\n✅ Financial tables initialized successfully!\n');
    console.log('You can now use the financial system.');
    console.log('\n⚠️  IMPORTANT: Restart the application for changes to take effect.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await new Promise((resolve) => db.close(() => resolve()));
  }
}

initializeTables();
