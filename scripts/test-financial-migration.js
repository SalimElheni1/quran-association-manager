/**
 * @fileoverview Test script for financial system migration
 * @author Quran Branch Manager Team
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('@journeyapps/sqlcipher').verbose();

const testDbPath = path.join(__dirname, '..', '.db', 'quran_assoc_manager_test_financial.sqlite');
let db = null;

// Simple DB wrapper for testing
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
};

/**
 * Creates test database with sample legacy data
 */
async function setupTestDatabase() {
  console.log('Setting up test database with sample data...');

  // Create tables
  await runQuery(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      matricule TEXT UNIQUE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      matricule TEXT UNIQUE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      amount REAL,
      payment_date DATE,
      payment_method TEXT,
      notes TEXT,
      receipt_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      amount REAL,
      expense_date DATE,
      description TEXT,
      responsible_person TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS salaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_type TEXT,
      amount REAL,
      payment_date DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      donor_name TEXT,
      amount REAL,
      donation_date DATE,
      donation_type TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert sample students
  await runQuery("INSERT INTO students (id, name, matricule) VALUES (1, 'أحمد محمد', 'S-000001')");
  await runQuery("INSERT INTO students (id, name, matricule) VALUES (2, 'فاطمة علي', 'S-000002')");

  // Insert sample teachers
  await runQuery(
    "INSERT INTO teachers (id, name, matricule) VALUES (1, 'محمد الأستاذ', 'T-000001')",
  );

  // Insert sample users
  await runQuery(
    "INSERT INTO users (id, username, first_name, last_name) VALUES (1, 'admin', 'أحمد', 'الإداري')",
  );

  // Insert sample payments (3 payments)
  await runQuery(`
    INSERT INTO payments (student_id, amount, payment_date, payment_method, notes, receipt_number)
    VALUES (1, 150.0, '2024-01-15', 'CASH', 'رسوم شهر يناير', 'R-001')
  `);
  await runQuery(`
    INSERT INTO payments (student_id, amount, payment_date, payment_method, notes, receipt_number)
    VALUES (2, 200.0, '2024-01-20', 'CHECK', 'رسوم شهر يناير', 'R-002')
  `);
  await runQuery(`
    INSERT INTO payments (student_id, amount, payment_date, payment_method, notes)
    VALUES (1, 150.0, '2024-02-15', 'CASH', 'رسوم شهر فبراير')
  `);

  // Insert sample expenses (2 expenses)
  await runQuery(`
    INSERT INTO expenses (category, amount, expense_date, description, responsible_person)
    VALUES ('الإيجار', 500.0, '2024-01-01', 'إيجار شهر يناير', 'أحمد')
  `);
  await runQuery(`
    INSERT INTO expenses (category, amount, expense_date, description, responsible_person)
    VALUES ('القرطاسية', 50.0, '2024-01-10', 'شراء أوراق', 'محمد')
  `);

  // Insert sample salaries (1 salary)
  await runQuery(`
    INSERT INTO salaries (user_id, user_type, amount, payment_date, notes)
    VALUES (1, 'teacher', 800.0, '2024-01-31', 'راتب شهر يناير')
  `);

  // Insert sample donations (1 cash donation)
  await runQuery(`
    INSERT INTO donations (donor_name, amount, donation_date, donation_type, notes)
    VALUES ('محسن كريم', 100.0, '2024-01-25', 'Cash', 'تبرع نقدي')
  `);

  console.log('✅ Test database setup complete');
}

/**
 * Runs migration and verification tests
 */
async function runMigrationTests() {
  console.log('\n--- Running Financial Migration Tests ---\n');

  try {
    // Delete existing test DB
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize test database
    db = new sqlite3.Database(testDbPath);
    await runQuery("PRAGMA key = 'test-key'");
    await runQuery('PRAGMA journal_mode = WAL');
    await runQuery('PRAGMA foreign_keys = ON');

    // Setup test data
    await setupTestDatabase();

    // Get totals before migration
    console.log('\n📊 Pre-Migration Totals:');
    const prePayments = await getQuery(
      'SELECT COUNT(*) as count, SUM(amount) as total FROM payments',
    );
    const preExpenses = await getQuery(
      'SELECT COUNT(*) as count, SUM(amount) as total FROM expenses',
    );
    const preSalaries = await getQuery(
      'SELECT COUNT(*) as count, SUM(amount) as total FROM salaries',
    );
    const preDonations = await getQuery(
      'SELECT COUNT(*) as count, SUM(amount) as total FROM donations WHERE donation_type = "Cash"',
    );

    console.log(`  Payments: ${prePayments.count} records, ${prePayments.total} TND`);
    console.log(`  Expenses: ${preExpenses.count} records, ${preExpenses.total} TND`);
    console.log(`  Salaries: ${preSalaries.count} records, ${preSalaries.total} TND`);
    console.log(`  Donations: ${preDonations.count} records, ${preDonations.total} TND`);

    // Run schema migration
    console.log('\n🔧 Running schema migration...');
    await runQuery(`
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
    await runQuery(
      'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)',
    );
    await runQuery('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
    await runQuery(
      'CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)',
    );

    await runQuery(`
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

    await runQuery(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
        description TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);
    console.log('✅ Schema created');

    // Run seed migration
    console.log('\n🌱 Seeding categories and accounts...');
    await runQuery(
      "INSERT OR IGNORE INTO accounts (id, name, type, initial_balance, current_balance) VALUES (1, 'الخزينة', 'CASH', 0.0, 0.0)",
    );

    await runQuery(
      "INSERT OR IGNORE INTO categories (name, type, description) VALUES ('رسوم الطلاب', 'INCOME', 'Student fees')",
    );
    await runQuery(
      "INSERT OR IGNORE INTO categories (name, type, description) VALUES ('التبرعات النقدية', 'INCOME', 'Cash donations')",
    );
    await runQuery(
      "INSERT OR IGNORE INTO categories (name, type, description) VALUES ('رواتب المعلمين', 'EXPENSE', 'Teacher salaries')",
    );
    await runQuery(
      "INSERT OR IGNORE INTO categories (name, type, description) VALUES ('رواتب الإداريين', 'EXPENSE', 'Admin salaries')",
    );
    await runQuery(
      "INSERT OR IGNORE INTO categories (name, type, description) VALUES ('الإيجار', 'EXPENSE', 'Rent')",
    );
    await runQuery(
      "INSERT OR IGNORE INTO categories (name, type, description) VALUES ('القرطاسية', 'EXPENSE', 'Stationery')",
    );
    await runQuery(
      "INSERT OR IGNORE INTO categories (name, type, description) VALUES ('مصاريف أخرى', 'EXPENSE', 'Other expenses')",
    );
    console.log('✅ Categories and accounts seeded');

    // Run data migration
    console.log('\n🔄 Migrating legacy data to unified transactions...');
    const migrationResult = await migrateToUnifiedTransactions();

    console.log('\n✅ Migration completed successfully!');
    console.log(`  Total migrated: ${migrationResult.totalMigrated} transactions`);
    console.log(`  - Payments: ${migrationResult.payments}`);
    console.log(`  - Expenses: ${migrationResult.expenses}`);
    console.log(`  - Salaries: ${migrationResult.salaries}`);
    console.log(`  - Donations: ${migrationResult.donations}`);
    console.log(`  Final balance: ${migrationResult.finalBalance} TND`);

    // Verify migration
    console.log('\n🔍 Verifying data integrity...');
    const verificationResult = await verifyMigration();

    if (verificationResult.paymentsMatch) {
      console.log('✅ PASSED: Payment totals match');
    } else {
      throw new Error(
        `❌ FAILED: Payment totals mismatch (Old: ${verificationResult.oldPaymentsTotal}, New: ${verificationResult.newPaymentsTotal})`,
      );
    }

    // Additional verification tests
    console.log('\n🧪 Running additional verification tests...');

    // Test 1: Check transaction count
    const transactionCount = await getQuery('SELECT COUNT(*) as count FROM transactions');
    const expectedCount =
      prePayments.count + preExpenses.count + preSalaries.count + preDonations.count;
    if (transactionCount.count === expectedCount) {
      console.log(`✅ PASSED: Transaction count matches (${transactionCount.count})`);
    } else {
      throw new Error(
        `❌ FAILED: Transaction count mismatch (Expected: ${expectedCount}, Got: ${transactionCount.count})`,
      );
    }

    // Test 2: Check voucher numbers (some may be null from legacy data)
    const vouchersWithNumber = await getQuery(
      'SELECT COUNT(*) as count FROM transactions WHERE voucher_number IS NOT NULL',
    );
    if (vouchersWithNumber.count >= 2) {
      console.log(
        `✅ PASSED: ${vouchersWithNumber.count} transactions have voucher numbers (legacy data preserved)`,
      );
    } else {
      throw new Error(
        `❌ FAILED: Only ${vouchersWithNumber.count} transactions have voucher numbers`,
      );
    }

    // Test 3: Check account balance
    const account = await getQuery('SELECT current_balance FROM accounts WHERE id = 1');
    const expectedBalance =
      prePayments.total + preDonations.total - (preExpenses.total + preSalaries.total);
    if (Math.abs(account.current_balance - expectedBalance) < 0.01) {
      console.log(`✅ PASSED: Account balance is correct (${account.current_balance} TND)`);
    } else {
      throw new Error(
        `❌ FAILED: Account balance mismatch (Expected: ${expectedBalance}, Got: ${account.current_balance})`,
      );
    }

    // Test 4: Check categories exist
    const categoryCount = await getQuery('SELECT COUNT(*) as count FROM categories');
    if (categoryCount.count >= 7) {
      console.log(`✅ PASSED: Categories seeded (${categoryCount.count} categories)`);
    } else {
      throw new Error(
        `❌ FAILED: Insufficient categories (Expected: 7+, Got: ${categoryCount.count})`,
      );
    }

    // Test 5: Check transaction types
    const incomeCount = await getQuery(
      "SELECT COUNT(*) as count FROM transactions WHERE type = 'INCOME'",
    );
    const expenseCount = await getQuery(
      "SELECT COUNT(*) as count FROM transactions WHERE type = 'EXPENSE'",
    );
    const expectedIncome = prePayments.count + preDonations.count;
    const expectedExpense = preExpenses.count + preSalaries.count;

    if (incomeCount.count === expectedIncome && expenseCount.count === expectedExpense) {
      console.log(
        `✅ PASSED: Transaction types correct (Income: ${incomeCount.count}, Expense: ${expenseCount.count})`,
      );
    } else {
      throw new Error(`❌ FAILED: Transaction type mismatch`);
    }

    console.log('\n✅ All tests passed! Migration is successful.');
  } catch (error) {
    console.error('\n❌ Migration test FAILED:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log('\n🧹 Test database cleaned up');
    }
  }
}

// Inline migration functions for testing
async function migrateToUnifiedTransactions() {
  const results = { payments: 0, expenses: 0, salaries: 0, donations: 0, errors: [] };

  try {
    await runQuery('BEGIN TRANSACTION;');

    const accountId = 1;

    // Migrate payments
    const payments = await allQuery('SELECT * FROM payments');
    for (const p of payments) {
      await runQuery(
        `
        INSERT INTO transactions (
          type, category, amount, transaction_date, description,
          payment_method, voucher_number, account_id, related_entity_type, related_entity_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          'INCOME',
          'رسوم الطلاب',
          p.amount,
          p.payment_date,
          p.notes || 'رسوم الطالب',
          p.payment_method || 'CASH',
          p.receipt_number,
          accountId,
          'Student',
          p.student_id,
          p.created_at,
        ],
      );
      results.payments++;
    }

    // Migrate expenses
    const expenses = await allQuery('SELECT * FROM expenses');
    for (const e of expenses) {
      await runQuery(
        `
        INSERT INTO transactions (
          type, category, amount, transaction_date, description,
          payment_method, account_id, related_person_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          'EXPENSE',
          e.category || 'مصاريف أخرى',
          e.amount,
          e.expense_date,
          e.description || 'مصروف',
          'CASH',
          accountId,
          e.responsible_person,
          e.created_at,
        ],
      );
      results.expenses++;
    }

    // Migrate salaries
    const salaries = await allQuery('SELECT * FROM salaries');
    for (const s of salaries) {
      const category = s.user_type === 'teacher' ? 'رواتب المعلمين' : 'رواتب الإداريين';
      await runQuery(
        `
        INSERT INTO transactions (
          type, category, amount, transaction_date, description,
          payment_method, account_id, related_entity_type, related_entity_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          'EXPENSE',
          category,
          s.amount,
          s.payment_date,
          `راتب موظف`,
          'CASH',
          accountId,
          s.user_type === 'teacher' ? 'Teacher' : 'User',
          s.user_id,
          s.created_at,
        ],
      );
      results.salaries++;
    }

    // Migrate donations
    const donations = await allQuery("SELECT * FROM donations WHERE donation_type = 'Cash'");
    for (const d of donations) {
      await runQuery(
        `
        INSERT INTO transactions (
          type, category, amount, transaction_date, description,
          payment_method, account_id, related_person_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          'INCOME',
          'التبرعات النقدية',
          d.amount,
          d.donation_date,
          d.notes || 'تبرع نقدي',
          'CASH',
          accountId,
          d.donor_name,
          d.created_at,
        ],
      );
      results.donations++;
    }

    // Calculate balance
    const totalIncome = await getQuery(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'INCOME'",
    );
    const totalExpenses = await getQuery(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'EXPENSE'",
    );
    const balance = (totalIncome.total || 0) - (totalExpenses.total || 0);

    await runQuery('UPDATE accounts SET current_balance = ? WHERE id = ?', [balance, accountId]);
    await runQuery('COMMIT;');

    return {
      success: true,
      ...results,
      totalMigrated: results.payments + results.expenses + results.salaries + results.donations,
      finalBalance: balance,
    };
  } catch (error) {
    await runQuery('ROLLBACK;');
    throw error;
  }
}

async function verifyMigration() {
  const oldPaymentsTotal = await getQuery('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
  const newPaymentsTotal = await getQuery(
    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE category = 'رسوم الطلاب'",
  );
  const paymentsMatch = Math.abs(oldPaymentsTotal.total - newPaymentsTotal.total) < 0.01;

  return {
    paymentsMatch,
    oldPaymentsTotal: oldPaymentsTotal.total,
    newPaymentsTotal: newPaymentsTotal.total,
  };
}

// Run tests
runMigrationTests()
  .then(() => {
    console.log('\n--- Financial Migration Test Completed Successfully ---');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n--- Financial Migration Test Failed ---');
    console.error(error);
    process.exit(1);
  });
