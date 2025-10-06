/**
 * @fileoverview Migration script to convert legacy financial data to unified transactions
 * @author Quran Branch Manager Team
 * @version 2.0.0
 */

const db = require('../../db/db');
const { error: logError, info: logInfo } = require('../logger');

/**
 * Migrates existing financial data to unified transactions table
 * Converts: payments, expenses, salaries, donations → transactions
 * 
 * @returns {Promise<Object>} Migration results with counts
 */
async function migrateToUnifiedTransactions() {
  logInfo('Starting migration to unified transactions...');
  
  const results = {
    payments: 0,
    expenses: 0,
    salaries: 0,
    donations: 0,
    errors: []
  };

  try {
    await db.runQuery('BEGIN TRANSACTION;');

    // Get default cash account
    const cashAccount = await db.getQuery("SELECT id FROM accounts WHERE name = 'الخزينة' LIMIT 1");
    const accountId = cashAccount ? cashAccount.id : 1;

    // ============================================
    // 1. Migrate Payments → Income Transactions
    // ============================================
    try {
      const payments = await db.allQuery('SELECT * FROM payments');
      logInfo(`Migrating ${payments.length} payments...`);

      for (const p of payments) {
        await db.runQuery(`
          INSERT INTO transactions (
            type, category, amount, transaction_date, description,
            payment_method, voucher_number, account_id, related_person_name,
            related_entity_type, related_entity_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'INCOME',
          'رسوم الطلاب',
          p.amount,
          p.payment_date,
          p.notes || 'رسوم الطالب',
          p.payment_method || 'CASH',
          p.receipt_number,
          accountId,
          null, // Will be populated from student_id join if needed
          'Student',
          p.student_id,
          p.created_at
        ]);
        results.payments++;
      }
    } catch (err) {
      logError('Error migrating payments:', err);
      results.errors.push(`Payments: ${err.message}`);
    }

    // ============================================
    // 2. Migrate Expenses → Expense Transactions
    // ============================================
    try {
      const expenses = await db.allQuery('SELECT * FROM expenses');
      logInfo(`Migrating ${expenses.length} expenses...`);

      for (const e of expenses) {
        await db.runQuery(`
          INSERT INTO transactions (
            type, category, amount, transaction_date, description,
            payment_method, account_id, related_person_name, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'EXPENSE',
          e.category || 'مصاريف أخرى',
          e.amount,
          e.expense_date,
          e.description || 'مصروف',
          'CASH',
          accountId,
          e.responsible_person,
          e.created_at
        ]);
        results.expenses++;
      }
    } catch (err) {
      logError('Error migrating expenses:', err);
      results.errors.push(`Expenses: ${err.message}`);
    }

    // ============================================
    // 3. Migrate Salaries → Expense Transactions
    // ============================================
    try {
      const salaries = await db.allQuery('SELECT * FROM salaries');
      logInfo(`Migrating ${salaries.length} salaries...`);

      for (const s of salaries) {
        const category = s.user_type === 'teacher' ? 'رواتب المعلمين' : 'رواتب الإداريين';
        
        await db.runQuery(`
          INSERT INTO transactions (
            type, category, amount, transaction_date, description,
            payment_method, account_id, related_person_name,
            related_entity_type, related_entity_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'EXPENSE',
          category,
          s.amount,
          s.payment_date,
          `راتب ${s.employee_name || 'موظف'}`,
          'CASH',
          accountId,
          s.employee_name,
          s.user_type === 'teacher' ? 'Teacher' : 'User',
          s.user_id,
          s.created_at
        ]);
        results.salaries++;
      }
    } catch (err) {
      logError('Error migrating salaries:', err);
      results.errors.push(`Salaries: ${err.message}`);
    }

    // ============================================
    // 4. Migrate Cash Donations → Income Transactions
    // ============================================
    try {
      const donations = await db.allQuery("SELECT * FROM donations WHERE donation_type = 'Cash'");
      logInfo(`Migrating ${donations.length} cash donations...`);

      for (const d of donations) {
        await db.runQuery(`
          INSERT INTO transactions (
            type, category, amount, transaction_date, description,
            payment_method, account_id, related_person_name, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'INCOME',
          'التبرعات النقدية',
          d.amount,
          d.donation_date,
          d.notes || 'تبرع نقدي',
          'CASH',
          accountId,
          d.donor_name,
          d.created_at
        ]);
        results.donations++;
      }
    } catch (err) {
      logError('Error migrating donations:', err);
      results.errors.push(`Donations: ${err.message}`);
    }

    // ============================================
    // 5. Calculate and Update Account Balance
    // ============================================
    const totalIncome = await db.getQuery(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'INCOME'"
    );
    const totalExpenses = await db.getQuery(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'EXPENSE'"
    );
    
    const balance = (totalIncome.total || 0) - (totalExpenses.total || 0);
    
    await db.runQuery(
      'UPDATE accounts SET current_balance = ? WHERE id = ?',
      [balance, accountId]
    );

    await db.runQuery('COMMIT;');

    logInfo('Migration completed successfully!');
    logInfo(`Migrated: ${results.payments} payments, ${results.expenses} expenses, ${results.salaries} salaries, ${results.donations} donations`);
    logInfo(`Final balance: ${balance} TND`);

    return {
      success: true,
      ...results,
      totalMigrated: results.payments + results.expenses + results.salaries + results.donations,
      finalBalance: balance
    };

  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('Migration failed:', error);
    throw error;
  }
}

/**
 * Verifies migration data integrity
 * Compares old totals with new totals
 * 
 * @returns {Promise<Object>} Verification results
 */
async function verifyMigration() {
  logInfo('Verifying migration data integrity...');

  try {
    // Compare payments
    const oldPaymentsTotal = await db.getQuery('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
    const newPaymentsTotal = await db.getQuery(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE category = 'رسوم الطلاب'"
    );

    const paymentsMatch = Math.abs(oldPaymentsTotal.total - newPaymentsTotal.total) < 0.01;

    logInfo(`Payments verification: ${paymentsMatch ? 'PASSED' : 'FAILED'}`);
    logInfo(`  Old: ${oldPaymentsTotal.total} TND, New: ${newPaymentsTotal.total} TND`);

    return {
      paymentsMatch,
      oldPaymentsTotal: oldPaymentsTotal.total,
      newPaymentsTotal: newPaymentsTotal.total
    };

  } catch (error) {
    logError('Verification failed:', error);
    throw error;
  }
}

module.exports = {
  migrateToUnifiedTransactions,
  verifyMigration
};
