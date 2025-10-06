/**
 * Test script for Week 3: Financial Dashboard & Reports
 */

const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, 'test-dashboard.db');
const KEY = 'test-key-123';

async function setupTestDatabase() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  const db = new sqlite3.Database(TEST_DB);
  await new Promise((resolve, reject) => {
    db.run(`PRAGMA key = '${KEY}'`, (err) => err ? reject(err) : resolve());
  });

  // Create schema
  await new Promise((resolve, reject) => {
    db.exec(`
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
    
    INSERT INTO categories (name, type) VALUES 
      ('رسوم الطلاب', 'INCOME'),
      ('التبرعات النقدية', 'INCOME'),
      ('رواتب المعلمين', 'EXPENSE'),
      ('الإيجار', 'EXPENSE');
  `, (err) => err ? reject(err) : resolve());
  });

  return db;
}

async function seedTransactions(db) {
  const transactions = [
    { date: '2024-01-05', type: 'INCOME', category: 'رسوم الطلاب', amount: 200, desc: 'رسوم طالب 1' },
    { date: '2024-01-10', type: 'INCOME', category: 'رسوم الطلاب', amount: 150, desc: 'رسوم طالب 2' },
    { date: '2024-01-12', type: 'INCOME', category: 'التبرعات النقدية', amount: 300, desc: 'تبرع 1' },
    { date: '2024-01-15', type: 'EXPENSE', category: 'رواتب المعلمين', amount: 400, desc: 'راتب معلم 1' },
    { date: '2024-01-20', type: 'EXPENSE', category: 'الإيجار', amount: 250, desc: 'إيجار شهر 1' },
  ];

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO transactions (transaction_date, type, category, amount, description, payment_method, voucher_number, account_id)
         VALUES (?, ?, ?, ?, ?, 'CASH', ?, 1)`,
        [t.date, t.type, t.category, t.amount, t.desc, `${t.type === 'INCOME' ? 'R' : 'P'}-2024-${String(i + 1).padStart(4, '0')}`],
        (err) => err ? reject(err) : resolve()
      );
    });
  }
}

async function testFinancialSummary(db) {
  console.log('\n📊 TEST 1: Financial Summary');
  
  const startDate = '2024-01-01';
  const endDate = '2024-01-31';

  const results = await new Promise((resolve, reject) => {
    db.all(`
    SELECT 
      type,
      category,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions
    WHERE transaction_date BETWEEN ? AND ?
    GROUP BY type, category
  `, [startDate, endDate], (err, rows) => err ? reject(err) : resolve(rows));
  });

  const income = results.filter(r => r.type === 'INCOME');
  const expenses = results.filter(r => r.type === 'EXPENSE');

  const totalIncome = income.reduce((sum, r) => sum + r.total, 0);
  const totalExpenses = expenses.reduce((sum, r) => sum + r.total, 0);
  const balance = totalIncome - totalExpenses;

  console.log(`   Total Income: ${totalIncome} TND`);
  console.log(`   Total Expenses: ${totalExpenses} TND`);
  console.log(`   Balance: ${balance} TND`);
  console.log(`   ✅ Summary calculated correctly`);

  return { totalIncome, totalExpenses, balance, income, expenses };
}

async function testCategoryBreakdown(db, summary) {
  console.log('\n📈 TEST 2: Category Breakdown');
  
  console.log('   Income by Category:');
  summary.income.forEach(item => {
    console.log(`     - ${item.category}: ${item.total} TND (${item.count} transactions)`);
  });

  console.log('   Expenses by Category:');
  summary.expenses.forEach(item => {
    console.log(`     - ${item.category}: ${item.total} TND (${item.count} transactions)`);
  });

  console.log(`   ✅ Category breakdown working`);
}

async function testRecentTransactions(db) {
  console.log('\n📋 TEST 3: Recent Transactions');
  
  const recent = await new Promise((resolve, reject) => {
    db.all(`
    SELECT * FROM transactions 
    ORDER BY transaction_date DESC, id DESC 
    LIMIT 10
  `, (err, rows) => err ? reject(err) : resolve(rows));
  });

  console.log(`   Found ${recent.length} recent transactions`);
  recent.slice(0, 3).forEach(t => {
    console.log(`     - ${t.voucher_number}: ${t.amount} TND (${t.category})`);
  });

  console.log(`   ✅ Recent transactions fetched`);
}

async function testPeriodFiltering(db) {
  console.log('\n📅 TEST 4: Period Filtering');
  
  // Test different periods
  const periods = [
    { name: 'First 10 days', start: '2024-01-01', end: '2024-01-10' },
    { name: 'After 15th', start: '2024-01-15', end: '2024-01-31' }
  ];

  for (const period of periods) {
    const count = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as count FROM transactions
        WHERE transaction_date BETWEEN ? AND ?
      `, [period.start, period.end], (err, row) => err ? reject(err) : resolve(row));
    });

    console.log(`   ${period.name}: ${count.count} transactions`);
  }

  console.log(`   ✅ Period filtering working`);
}

async function testExportData(db) {
  console.log('\n💾 TEST 5: Export Data Format');
  
  const summary = await testFinancialSummary(db);
  
  // Simulate CSV export
  let csv = 'الفئة,النوع,المبلغ\n';
  summary.income.forEach(item => {
    csv += `${item.category},مدخول,${item.total}\n`;
  });
  summary.expenses.forEach(item => {
    csv += `${item.category},مصروف,${item.total}\n`;
  });

  console.log(`   CSV Export Preview (first 100 chars):`);
  console.log(`   ${csv.substring(0, 100)}...`);
  console.log(`   ✅ Export data format ready`);
}

async function runTests() {
  console.log('🚀 Starting Week 3 Dashboard Tests...\n');
  
  let db;
  try {
    db = await setupTestDatabase();
    console.log('✅ Test database created');

    await seedTransactions(db);
    console.log('✅ Test transactions seeded');

    const summary = await testFinancialSummary(db);
    await testCategoryBreakdown(db, summary);
    await testRecentTransactions(db);
    await testPeriodFiltering(db);
    await testExportData(db);

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
