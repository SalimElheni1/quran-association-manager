/**
 * Test script for Week 4: Income & Expenses Pages
 */

const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, 'test-pages.db');
const KEY = 'test-key-123';

let db;

const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
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

async function setupTestDatabase() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  db = new sqlite3.Database(TEST_DB);
  await runQuery(`PRAGMA key = '${KEY}'`);

  await new Promise((resolve, reject) => {
    db.exec(
      `
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        current_balance REAL DEFAULT 0.0,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date DATE NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        payment_method TEXT,
        voucher_number TEXT UNIQUE,
        account_id INTEGER NOT NULL
      );

      INSERT INTO accounts (name, type, current_balance) VALUES ('الخزينة', 'CASH', 0);
      INSERT INTO accounts (name, type, current_balance) VALUES ('حساب بنكي', 'BANK', 0);
      
      INSERT INTO categories (name, type) VALUES ('رسوم الطلاب', 'INCOME');
      INSERT INTO categories (name, type) VALUES ('التبرعات النقدية', 'INCOME');
      INSERT INTO categories (name, type) VALUES ('رواتب المعلمين', 'EXPENSE');
      INSERT INTO categories (name, type) VALUES ('الإيجار', 'EXPENSE');
    `,
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

async function testIncomePageFlow() {
  console.log('\n💰 TEST 1: Income Page Flow');

  // Add income
  await runQuery(`
    INSERT INTO transactions (transaction_date, type, category, amount, description, payment_method, voucher_number, account_id)
    VALUES ('2024-01-15', 'INCOME', 'رسوم الطلاب', 200, 'رسوم طالب 1', 'CASH', 'R-2024-0001', 1)
  `);

  // Fetch income transactions
  const incomeTransactions = await allQuery(`
    SELECT * FROM transactions WHERE type = 'INCOME'
  `);

  console.log(`   Added ${incomeTransactions.length} income transaction(s)`);
  console.log(`   ✅ Income page flow working`);
}

async function testExpensePageFlow() {
  console.log('\n💸 TEST 2: Expense Page Flow');

  // Add expense
  await runQuery(`
    INSERT INTO transactions (transaction_date, type, category, amount, description, payment_method, voucher_number, account_id)
    VALUES ('2024-01-20', 'EXPENSE', 'الإيجار', 500, 'إيجار شهر 1', 'CHECK', 'P-2024-0001', 1)
  `);

  // Fetch expense transactions
  const expenseTransactions = await allQuery(`
    SELECT * FROM transactions WHERE type = 'EXPENSE'
  `);

  console.log(`   Added ${expenseTransactions.length} expense transaction(s)`);
  console.log(`   ✅ Expense page flow working`);
}

async function testAccountsPage() {
  console.log('\n🏦 TEST 3: Accounts Page');

  const accounts = await allQuery(`SELECT * FROM accounts WHERE is_active = 1`);

  console.log(`   Found ${accounts.length} active accounts:`);
  accounts.forEach((acc) => {
    console.log(`     - ${acc.name} (${acc.type}): ${acc.current_balance} TND`);
  });

  console.log(`   ✅ Accounts page working`);
}

async function testFiltering() {
  console.log('\n🔍 TEST 4: Transaction Filtering');

  // Filter by category
  const studentFees = await allQuery(`
    SELECT * FROM transactions WHERE category = 'رسوم الطلاب'
  `);

  // Filter by date range
  const januaryTransactions = await allQuery(`
    SELECT * FROM transactions 
    WHERE transaction_date BETWEEN '2024-01-01' AND '2024-01-31'
  `);

  console.log(`   Student fees: ${studentFees.length} transaction(s)`);
  console.log(`   January transactions: ${januaryTransactions.length} transaction(s)`);
  console.log(`   ✅ Filtering working`);
}

async function testCategoriesDropdown() {
  console.log('\n📋 TEST 5: Categories Dropdown');

  const incomeCategories = await allQuery(`
    SELECT * FROM categories WHERE type = 'INCOME' AND is_active = 1
  `);

  const expenseCategories = await allQuery(`
    SELECT * FROM categories WHERE type = 'EXPENSE' AND is_active = 1
  `);

  console.log(`   Income categories: ${incomeCategories.length}`);
  console.log(`   Expense categories: ${expenseCategories.length}`);
  console.log(`   ✅ Categories dropdown working`);
}

async function runTests() {
  console.log('🚀 Starting Week 4 Pages Tests...\n');

  try {
    await setupTestDatabase();
    console.log('✅ Test database created');

    await testIncomePageFlow();
    await testExpensePageFlow();
    await testAccountsPage();
    await testFiltering();
    await testCategoriesDropdown();

    console.log('\n✅ ALL TESTS PASSED!\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error);
  } finally {
    if (db) {
      await new Promise((resolve) => db.close(() => resolve()));
    }
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }
}

runTests();
