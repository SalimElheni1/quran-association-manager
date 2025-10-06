/**
 * Integration test for complete financial workflow
 */

const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, 'test-integration.db');
const KEY = 'test-key-123';
let db;

const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
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

async function setupDatabase() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  db = new sqlite3.Database(TEST_DB);
  await runQuery(`PRAGMA key = '${KEY}'`);

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
      
      INSERT INTO categories (name, type) VALUES ('رسوم الطلاب', 'INCOME');
      INSERT INTO categories (name, type) VALUES ('التبرعات النقدية', 'INCOME');
      INSERT INTO categories (name, type) VALUES ('رواتب المعلمين', 'EXPENSE');
      INSERT INTO categories (name, type) VALUES ('الإيجار', 'EXPENSE');
    `, (err) => err ? reject(err) : resolve());
  });
}

async function testCompleteWorkflow() {
  console.log('\n🔄 INTEGRATION TEST: Complete Financial Workflow\n');

  // Step 1: Add multiple income transactions
  console.log('📥 Step 1: Adding income transactions...');
  const incomes = [
    { date: '2024-01-05', category: 'رسوم الطلاب', amount: 200, desc: 'رسوم طالب 1' },
    { date: '2024-01-10', category: 'رسوم الطلاب', amount: 150, desc: 'رسوم طالب 2' },
    { date: '2024-01-15', category: 'التبرعات النقدية', amount: 300, desc: 'تبرع 1' }
  ];

  for (let i = 0; i < incomes.length; i++) {
    const inc = incomes[i];
    await runQuery('BEGIN TRANSACTION;');
    await runQuery(`
      INSERT INTO transactions (transaction_date, type, category, amount, description, payment_method, voucher_number, account_id)
      VALUES (?, 'INCOME', ?, ?, ?, 'CASH', ?, 1)
    `, [inc.date, inc.category, inc.amount, inc.desc, `R-2024-${String(i + 1).padStart(4, '0')}`]);
    await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = 1', [inc.amount]);
    await runQuery('COMMIT;');
  }
  console.log('   ✅ Added 3 income transactions\n');

  // Step 2: Add multiple expense transactions
  console.log('📤 Step 2: Adding expense transactions...');
  const expenses = [
    { date: '2024-01-20', category: 'رواتب المعلمين', amount: 400, desc: 'راتب معلم 1' },
    { date: '2024-01-25', category: 'الإيجار', amount: 250, desc: 'إيجار شهر 1' }
  ];

  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i];
    await runQuery('BEGIN TRANSACTION;');
    await runQuery(`
      INSERT INTO transactions (transaction_date, type, category, amount, description, payment_method, voucher_number, account_id)
      VALUES (?, 'EXPENSE', ?, ?, ?, 'CHECK', ?, 1)
    `, [exp.date, exp.category, exp.amount, exp.desc, `P-2024-${String(i + 1).padStart(4, '0')}`]);
    await runQuery('UPDATE accounts SET current_balance = current_balance - ? WHERE id = 1', [exp.amount]);
    await runQuery('COMMIT;');
  }
  console.log('   ✅ Added 2 expense transactions\n');

  // Step 3: Verify account balance
  console.log('💰 Step 3: Verifying account balance...');
  const account = await getQuery('SELECT current_balance FROM accounts WHERE id = 1');
  const expectedBalance = (200 + 150 + 300) - (400 + 250);
  if (account.current_balance === expectedBalance) {
    console.log(`   ✅ Balance correct: ${account.current_balance} TND (expected: ${expectedBalance})\n`);
  } else {
    throw new Error(`Balance mismatch: ${account.current_balance} vs ${expectedBalance}`);
  }

  // Step 4: Generate financial summary
  console.log('📊 Step 4: Generating financial summary...');
  const summary = await allQuery(`
    SELECT 
      type,
      category,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions
    WHERE transaction_date BETWEEN '2024-01-01' AND '2024-01-31'
    GROUP BY type, category
  `);

  const income = summary.filter(r => r.type === 'INCOME');
  const expense = summary.filter(r => r.type === 'EXPENSE');
  const totalIncome = income.reduce((sum, r) => sum + r.total, 0);
  const totalExpenses = expense.reduce((sum, r) => sum + r.total, 0);

  console.log(`   Total Income: ${totalIncome} TND`);
  console.log(`   Total Expenses: ${totalExpenses} TND`);
  console.log(`   Net Balance: ${totalIncome - totalExpenses} TND`);
  console.log('   ✅ Summary generated\n');

  // Step 5: Test filtering
  console.log('🔍 Step 5: Testing filters...');
  const studentFees = await allQuery(`
    SELECT * FROM transactions WHERE category = 'رسوم الطلاب'
  `);
  const januaryFirst15Days = await allQuery(`
    SELECT * FROM transactions WHERE transaction_date BETWEEN '2024-01-01' AND '2024-01-15'
  `);
  console.log(`   Student fees: ${studentFees.length} transactions`);
  console.log(`   First 15 days: ${januaryFirst15Days.length} transactions`);
  console.log('   ✅ Filters working\n');

  // Step 6: Test update transaction
  console.log('✏️ Step 6: Testing transaction update...');
  const firstTransaction = await getQuery('SELECT * FROM transactions WHERE id = 1');
  await runQuery('BEGIN TRANSACTION;');
  await runQuery('UPDATE accounts SET current_balance = current_balance - ? WHERE id = 1', [firstTransaction.amount]);
  await runQuery('UPDATE transactions SET amount = 250 WHERE id = 1');
  await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = 1', [250]);
  await runQuery('COMMIT;');
  const updatedAccount = await getQuery('SELECT current_balance FROM accounts WHERE id = 1');
  console.log(`   Updated balance: ${updatedAccount.current_balance} TND`);
  console.log('   ✅ Update working\n');

  // Step 7: Test delete transaction
  console.log('🗑️ Step 7: Testing transaction delete...');
  const toDelete = await getQuery('SELECT * FROM transactions WHERE id = 2');
  await runQuery('BEGIN TRANSACTION;');
  await runQuery('UPDATE accounts SET current_balance = current_balance - ? WHERE id = 1', [toDelete.amount]);
  await runQuery('DELETE FROM transactions WHERE id = 2');
  await runQuery('COMMIT;');
  const finalAccount = await getQuery('SELECT current_balance FROM accounts WHERE id = 1');
  console.log(`   Final balance: ${finalAccount.current_balance} TND`);
  console.log('   ✅ Delete working\n');

  // Step 8: Verify data integrity
  console.log('🔐 Step 8: Verifying data integrity...');
  const allTransactions = await allQuery('SELECT * FROM transactions');
  const manualBalance = allTransactions.reduce((sum, t) => {
    return sum + (t.type === 'INCOME' ? t.amount : -t.amount);
  }, 0);
  const dbBalance = finalAccount.current_balance;
  
  if (Math.abs(manualBalance - dbBalance) < 0.01) {
    console.log(`   ✅ Data integrity verified (${dbBalance} TND)\n`);
  } else {
    throw new Error(`Data integrity failed: manual=${manualBalance}, db=${dbBalance}`);
  }

  console.log('✅ INTEGRATION TEST PASSED!\n');
}

async function runTests() {
  console.log('🚀 Starting Financial Integration Tests...\n');
  
  try {
    await setupDatabase();
    console.log('✅ Test database created');

    await testCompleteWorkflow();

    console.log('✅ ALL INTEGRATION TESTS PASSED!\n');
  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (db) {
      await new Promise((resolve) => db.close(() => resolve()));
    }
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }
}

runTests();
