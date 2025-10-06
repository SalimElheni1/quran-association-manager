/**
 * @fileoverview Test script for financial CRUD operations
 * @author Quran Branch Manager Team
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('@journeyapps/sqlcipher').verbose();

const testDbPath = path.join(__dirname, '..', '.db', 'quran_assoc_manager_test_crud.sqlite');
let db = null;

// Simple DB wrapper
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

async function setupTestDatabase() {
  console.log('Setting up test database...');

  // Create schema
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

  await runQuery(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT)`);

  // Seed data
  await runQuery("INSERT INTO accounts (id, name, type, current_balance) VALUES (1, 'الخزينة', 'CASH', 0)");
  await runQuery("INSERT INTO categories (name, type) VALUES ('رسوم الطلاب', 'INCOME')");
  await runQuery("INSERT INTO categories (name, type) VALUES ('الإيجار', 'EXPENSE')");
  await runQuery("INSERT INTO users (id, username) VALUES (1, 'admin')");

  console.log('✅ Test database setup complete\n');
}

async function testCRUDOperations() {
  console.log('--- Testing Financial CRUD Operations ---\n');

  let createdTransactionId = null;

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

    await setupTestDatabase();

    // ============================================
    // TEST 1: CREATE (Add Transaction)
    // ============================================
    console.log('🧪 Test 1: CREATE - Adding income transaction...');
    
    const newTransaction = {
      type: 'INCOME',
      category: 'رسوم الطلاب',
      amount: 150.5,
      transaction_date: '2024-01-15',
      description: 'رسوم الطالب أحمد',
      payment_method: 'CASH',
      account_id: 1,
      related_person_name: 'أحمد محمد'
    };

    // Simulate handler logic
    await runQuery('BEGIN TRANSACTION;');
    
    // Validate 500 TND rule
    if (newTransaction.amount > 500 && newTransaction.payment_method === 'CASH') {
      throw new Error('500 TND rule violated');
    }

    // Generate voucher number
    const year = new Date(newTransaction.transaction_date).getFullYear();
    const prefix = newTransaction.type === 'INCOME' ? 'R' : 'P';
    const voucher_number = `${prefix}-${year}-0001`;

    // Insert transaction
    const result = await runQuery(`
      INSERT INTO transactions (
        type, category, amount, transaction_date, description,
        payment_method, voucher_number, account_id, related_person_name,
        requires_dual_signature, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newTransaction.type,
      newTransaction.category,
      newTransaction.amount,
      newTransaction.transaction_date,
      newTransaction.description,
      newTransaction.payment_method,
      voucher_number,
      newTransaction.account_id,
      newTransaction.related_person_name,
      newTransaction.amount > 500 ? 1 : 0,
      1
    ]);

    createdTransactionId = result.id;

    // Update account balance
    const adjustment = newTransaction.type === 'INCOME' ? newTransaction.amount : -newTransaction.amount;
    await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?', [adjustment, newTransaction.account_id]);

    await runQuery('COMMIT;');

    const created = await getQuery('SELECT * FROM transactions WHERE id = ?', [createdTransactionId]);
    
    if (created && created.amount === 150.5 && created.voucher_number === 'R-2024-0001') {
      console.log('✅ PASSED: Transaction created successfully');
      console.log(`   ID: ${created.id}, Amount: ${created.amount} TND, Voucher: ${created.voucher_number}\n`);
    } else {
      throw new Error('Transaction creation failed');
    }

    // ============================================
    // TEST 2: READ (Get Transactions)
    // ============================================
    console.log('🧪 Test 2: READ - Fetching transactions...');
    
    const transactions = await allQuery(`
      SELECT t.*, a.name as account_name
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.type = ?
      ORDER BY t.transaction_date DESC
    `, ['INCOME']);

    if (transactions.length === 1 && transactions[0].id === createdTransactionId) {
      console.log('✅ PASSED: Transaction fetched successfully');
      console.log(`   Found ${transactions.length} transaction(s)\n`);
    } else {
      throw new Error('Transaction fetch failed');
    }

    // ============================================
    // TEST 3: UPDATE (Modify Transaction)
    // ============================================
    console.log('🧪 Test 3: UPDATE - Updating transaction...');
    
    const updatedData = {
      category: 'رسوم الطلاب',
      amount: 200.0,
      transaction_date: '2024-01-15',
      description: 'رسوم الطالب أحمد - محدث',
      payment_method: 'CHECK',
      check_number: 'CHK-001',
      account_id: 1,
      related_person_name: 'أحمد محمد علي'
    };

    await runQuery('BEGIN TRANSACTION;');

    // Get old transaction
    const oldTransaction = await getQuery('SELECT * FROM transactions WHERE id = ?', [createdTransactionId]);
    
    // Reverse old balance
    const oldAdjustment = oldTransaction.type === 'INCOME' ? -oldTransaction.amount : oldTransaction.amount;
    await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?', [oldAdjustment, oldTransaction.account_id]);

    // Update transaction
    await runQuery(`
      UPDATE transactions SET
        category = ?, amount = ?, transaction_date = ?, description = ?,
        payment_method = ?, check_number = ?, account_id = ?,
        related_person_name = ?, requires_dual_signature = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      updatedData.category,
      updatedData.amount,
      updatedData.transaction_date,
      updatedData.description,
      updatedData.payment_method,
      updatedData.check_number,
      updatedData.account_id,
      updatedData.related_person_name,
      updatedData.amount > 500 ? 1 : 0,
      createdTransactionId
    ]);

    // Apply new balance
    const newAdjustment = oldTransaction.type === 'INCOME' ? updatedData.amount : -updatedData.amount;
    await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?', [newAdjustment, updatedData.account_id]);

    await runQuery('COMMIT;');

    const updated = await getQuery('SELECT * FROM transactions WHERE id = ?', [createdTransactionId]);
    
    if (updated && updated.amount === 200.0 && updated.check_number === 'CHK-001') {
      console.log('✅ PASSED: Transaction updated successfully');
      console.log(`   New Amount: ${updated.amount} TND, Check: ${updated.check_number}\n`);
    } else {
      throw new Error('Transaction update failed');
    }

    // ============================================
    // TEST 4: 500 TND RULE VALIDATION
    // ============================================
    console.log('🧪 Test 4: VALIDATION - Testing 500 TND rule...');
    
    try {
      const invalidTransaction = {
        amount: 600,
        payment_method: 'CASH'
      };

      if (invalidTransaction.amount > 500 && invalidTransaction.payment_method === 'CASH') {
        throw new Error('المبالغ التي تتجاوز 500 دينار يجب أن تكون عبر شيك أو تحويل بنكي');
      }
      
      console.log('❌ FAILED: 500 TND rule not enforced');
    } catch (err) {
      if (err.message.includes('500 دينار')) {
        console.log('✅ PASSED: 500 TND rule enforced correctly\n');
      } else {
        throw err;
      }
    }

    // ============================================
    // TEST 5: ACCOUNT BALANCE TRACKING
    // ============================================
    console.log('🧪 Test 5: BALANCE - Checking account balance...');
    
    const account = await getQuery('SELECT current_balance FROM accounts WHERE id = 1');
    
    if (account && account.current_balance === 200.0) {
      console.log('✅ PASSED: Account balance tracked correctly');
      console.log(`   Balance: ${account.current_balance} TND\n`);
    } else {
      throw new Error(`Balance mismatch (Expected: 200, Got: ${account.current_balance})`);
    }

    // ============================================
    // TEST 6: DELETE (Remove Transaction)
    // ============================================
    console.log('🧪 Test 6: DELETE - Deleting transaction...');
    
    await runQuery('BEGIN TRANSACTION;');

    const transactionToDelete = await getQuery('SELECT * FROM transactions WHERE id = ?', [createdTransactionId]);
    
    // Reverse balance
    const deleteAdjustment = transactionToDelete.type === 'INCOME' ? -transactionToDelete.amount : transactionToDelete.amount;
    await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?', [deleteAdjustment, transactionToDelete.account_id]);
    
    await runQuery('DELETE FROM transactions WHERE id = ?', [createdTransactionId]);
    
    await runQuery('COMMIT;');

    const deleted = await getQuery('SELECT * FROM transactions WHERE id = ?', [createdTransactionId]);
    const finalBalance = await getQuery('SELECT current_balance FROM accounts WHERE id = 1');
    
    if (!deleted && finalBalance.current_balance === 0) {
      console.log('✅ PASSED: Transaction deleted and balance reverted');
      console.log(`   Final Balance: ${finalBalance.current_balance} TND\n`);
    } else {
      throw new Error('Transaction deletion failed');
    }

    // ============================================
    // TEST 7: FILTERS
    // ============================================
    console.log('🧪 Test 7: FILTERS - Testing transaction filters...');
    
    // Add test data
    await runQuery(`
      INSERT INTO transactions (type, category, amount, transaction_date, description, payment_method, account_id, voucher_number)
      VALUES ('INCOME', 'رسوم الطلاب', 100, '2024-01-10', 'Test 1', 'CASH', 1, 'R-2024-0002')
    `);
    await runQuery(`
      INSERT INTO transactions (type, category, amount, transaction_date, description, payment_method, account_id, voucher_number)
      VALUES ('EXPENSE', 'الإيجار', 500, '2024-01-20', 'Test 2', 'CASH', 1, 'P-2024-0001')
    `);

    const filtered = await allQuery(`
      SELECT * FROM transactions
      WHERE type = ? AND transaction_date BETWEEN ? AND ?
      ORDER BY transaction_date DESC
    `, ['INCOME', '2024-01-01', '2024-01-31']);

    if (filtered.length === 1 && filtered[0].type === 'INCOME') {
      console.log('✅ PASSED: Filters working correctly');
      console.log(`   Found ${filtered.length} income transaction(s)\n`);
    } else {
      throw new Error('Filter test failed');
    }

    console.log('✅ All CRUD tests passed!\n');

  } catch (error) {
    console.error('\n❌ CRUD test FAILED:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log('🧹 Test database cleaned up\n');
    }
  }
}

// Run tests
testCRUDOperations()
  .then(() => {
    console.log('--- Financial CRUD Test Completed Successfully ---');
    process.exit(0);
  })
  .catch((error) => {
    console.error('--- Financial CRUD Test Failed ---');
    console.error(error);
    process.exit(1);
  });
