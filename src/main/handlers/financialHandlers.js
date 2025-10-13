/**
 * @fileoverview Unified financial transaction IPC handlers
 * @author Quran Branch Manager Team
 * @version 2.0.0
 */

const { ipcMain } = require('electron');
const db = require('../../db/db');
const { transactionValidationSchema } = require('../validationSchemas');
const { error: logError } = require('../logger');
const { requireRoles } = require('../authMiddleware');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generates matricule for transaction
 */
async function generateMatricule(type, transactionDate) {
  const year = new Date(transactionDate).getFullYear();
  const prefix = type === 'INCOME' ? 'I' : 'E';

  const lastTransaction = await db.getQuery(
    `SELECT matricule FROM transactions 
     WHERE type = ? AND matricule LIKE ? 
     ORDER BY id DESC LIMIT 1`,
    [type, `${prefix}-${year}-%`],
  );

  let sequence = 1;
  if (lastTransaction?.matricule) {
    const lastSeq = parseInt(lastTransaction.matricule.split('-')[2]);
    sequence = lastSeq + 1;
  }

  return `${prefix}-${year}-${sequence.toString().padStart(3, '0')}`;
}

/**
 * Updates account balance after transaction
 */
async function updateAccountBalance(accountId, transactionType, amount) {
  const adjustment = transactionType === 'INCOME' ? amount : -amount;
  await db.runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?', [
    adjustment,
    accountId,
  ]);
}

/**
 * Validates 500 TND cash limit rule
 */
function validate500TndRule(amount, paymentMethod) {
  if (amount > 500 && paymentMethod === 'CASH') {
    throw new Error('المبالغ التي تتجاوز 500 دينار يجب أن تكون عبر شيك أو تحويل بنكي');
  }
}

// ============================================
// TRANSACTION HANDLERS
// ============================================

async function handleGetTransactions(event, filters) {
  try {
    // Check if transactions table exists
    const tableCheck = await db.getQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'",
    );

    if (!tableCheck) {
      // Table doesn't exist yet, return empty array
      return [];
    }

    const { type, category, startDate, endDate, accountId, searchTerm } = filters || {};

    let sql = `
      SELECT t.*, a.name as account_name, u.username as created_by
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN users u ON t.created_by_user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      sql += ' AND t.type = ?';
      params.push(type);
    }
    if (category) {
      sql += ' AND t.category = ?';
      params.push(category);
    }
    if (startDate && endDate) {
      sql += ' AND t.transaction_date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }
    if (accountId) {
      sql += ' AND t.account_id = ?';
      params.push(accountId);
    }
    if (searchTerm) {
      sql +=
        ' AND (t.description LIKE ? OR t.related_person_name LIKE ? OR t.voucher_number LIKE ?)';
      params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }

    sql += ' ORDER BY t.transaction_date DESC, t.id DESC';

    return await db.allQuery(sql, params);
  } catch (error) {
    logError('Error in handleGetTransactions:', error);
    return [];
  }
}

async function handleAddTransaction(event, transaction) {
  try {
    await db.runQuery('BEGIN TRANSACTION;');

    // Validate 500 TND rule
    validate500TndRule(transaction.amount, transaction.payment_method);

    // Validate data
    const validatedData = await transactionValidationSchema.validateAsync(transaction, {
      abortEarly: false,
      stripUnknown: false,
    });

    // Generate matricule
    const matricule = await generateMatricule(validatedData.type, validatedData.transaction_date);

    // Insert transaction
    const sql = `
      INSERT INTO transactions (
        matricule, type, category, amount, transaction_date, description,
        payment_method, check_number, voucher_number, account_id,
        related_person_name, related_entity_type, related_entity_id,
        requires_dual_signature, created_by_user_id, receipt_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.runQuery(sql, [
      matricule,
      validatedData.type,
      validatedData.category,
      validatedData.amount,
      new Date(validatedData.transaction_date).toISOString().split('T')[0],
      validatedData.description,
      validatedData.payment_method,
      validatedData.check_number || null,
      validatedData.voucher_number,
      validatedData.account_id,
      validatedData.related_person_name || null,
      validatedData.related_entity_type || null,
      validatedData.related_entity_id || null,
      validatedData.amount > 500 ? 1 : 0,
      event.sender.userId || null,
      validatedData.receipt_type || null,
    ]);

    // Update account balance
    await updateAccountBalance(validatedData.account_id, validatedData.type, validatedData.amount);

    await db.runQuery('COMMIT;');

    return await db.getQuery('SELECT * FROM transactions WHERE id = ?', [result.id]);
  } catch (error) {
    await db.runQuery('ROLLBACK;');
    if (error.isJoi) {
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    }
    if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('voucher_number')) {
      throw new Error('رقم الوصل موجود مسبقاً. الرجاء استخدام رقم آخر');
    }
    logError('Error in handleAddTransaction:', error);
    throw new Error(error.message || 'فشل في إضافة العملية المالية');
  }
}

async function handleUpdateTransaction(event, id, transaction) {
  try {
    await db.runQuery('BEGIN TRANSACTION;');

    // Validate 500 TND rule
    validate500TndRule(transaction.amount, transaction.payment_method);

    // Get old transaction to reverse balance
    const oldTransaction = await db.getQuery('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!oldTransaction) {
      throw new Error('العملية المالية غير موجودة');
    }

    // Validate data
    const validatedData = await transactionValidationSchema.validateAsync(transaction, {
      abortEarly: false,
      stripUnknown: false,
    });

    // Reverse old balance
    await updateAccountBalance(
      oldTransaction.account_id,
      oldTransaction.type,
      -oldTransaction.amount,
    );

    // Update transaction
    const sql = `
      UPDATE transactions SET
        category = ?, amount = ?, transaction_date = ?, description = ?,
        payment_method = ?, check_number = ?, account_id = ?,
        related_person_name = ?, related_entity_type = ?, related_entity_id = ?,
        requires_dual_signature = ?, receipt_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.runQuery(sql, [
      validatedData.category,
      validatedData.amount,
      new Date(validatedData.transaction_date).toISOString().split('T')[0],
      validatedData.description,
      validatedData.payment_method,
      validatedData.check_number || null,
      validatedData.account_id,
      validatedData.related_person_name || null,
      validatedData.related_entity_type || null,
      validatedData.related_entity_id || null,
      validatedData.amount > 500 ? 1 : 0,
      validatedData.receipt_type || null,
      id,
    ]);

    // Apply new balance
    await updateAccountBalance(validatedData.account_id, oldTransaction.type, validatedData.amount);

    await db.runQuery('COMMIT;');

    return await db.getQuery('SELECT * FROM transactions WHERE id = ?', [id]);
  } catch (error) {
    await db.runQuery('ROLLBACK;');
    if (error.isJoi) {
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    }
    logError('Error in handleUpdateTransaction:', error);
    throw new Error(error.message || 'فشل في تحديث العملية المالية');
  }
}

async function handleDeleteTransaction(event, transactionId) {
  try {
    await db.runQuery('BEGIN TRANSACTION;');

    const transaction = await db.getQuery('SELECT * FROM transactions WHERE id = ?', [
      transactionId,
    ]);
    if (!transaction) {
      throw new Error('العملية المالية غير موجودة');
    }

    // Reverse balance
    await updateAccountBalance(transaction.account_id, transaction.type, -transaction.amount);

    await db.runQuery('DELETE FROM transactions WHERE id = ?', [transactionId]);

    await db.runQuery('COMMIT;');

    return { id: transactionId };
  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('Error in handleDeleteTransaction:', error);
    throw new Error('فشل في حذف العملية المالية');
  }
}

// ============================================
// REPORT HANDLERS
// ============================================

async function handleGetFinancialSummary(_event, period) {
  try {
    const tableCheck = await db.getQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'",
    );

    if (!tableCheck) {
      return {
        totalIncome: 0,
        totalExpenses: 0,
        balance: 0,
        transactionCount: 0,
        incomeByCategory: [],
        expensesByCategory: [],
        recentTransactions: [],
      };
    }

    const { startDate, endDate } = period;

    // Get income grouped by receipt_type only
    const incomeSql = `
      SELECT 
        receipt_type as category,
        SUM(amount) as total,
        COUNT(*) as count
      FROM transactions
      WHERE transaction_date BETWEEN ? AND ? AND type = 'INCOME' AND receipt_type IS NOT NULL
      GROUP BY receipt_type
    `;

    // Get expenses grouped by category
    const expenseSql = `
      SELECT 
        category,
        SUM(amount) as total,
        COUNT(*) as count
      FROM transactions
      WHERE transaction_date BETWEEN ? AND ? AND type = 'EXPENSE'
      GROUP BY category
    `;

    const income = await db.allQuery(incomeSql, [startDate, endDate]);
    const expenses = await db.allQuery(expenseSql, [startDate, endDate]);

    const totalIncome = income.reduce((sum, r) => sum + r.total, 0);
    const totalExpenses = expenses.reduce((sum, r) => sum + r.total, 0);
    const transactionCount =
      income.reduce((sum, r) => sum + r.count, 0) + expenses.reduce((sum, r) => sum + r.count, 0);

    const recentTransactions = await db.allQuery(
      `SELECT * FROM transactions 
       WHERE transaction_date BETWEEN ? AND ?
       ORDER BY transaction_date DESC, id DESC 
       LIMIT 10`,
      [startDate, endDate],
    );

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      transactionCount,
      incomeByCategory: income,
      expensesByCategory: expenses,
      recentTransactions,
    };
  } catch (error) {
    logError('Error in handleGetFinancialSummary:', error);
    return {
      totalIncome: 0,
      totalExpenses: 0,
      balance: 0,
      transactionCount: 0,
      incomeByCategory: [],
      expensesByCategory: [],
      recentTransactions: [],
    };
  }
}

// ============================================
// ACCOUNT HANDLERS
// ============================================

async function handleGetAccounts(_event) {
  try {
    const tableCheck = await db.getQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'",
    );
    if (!tableCheck) return [];
    return await db.allQuery('SELECT * FROM accounts WHERE is_active = 1 ORDER BY name');
  } catch (error) {
    logError('Error in handleGetAccounts:', error);
    return [];
  }
}

async function handleAddAccount(event, account) {
  try {
    const { name, type, account_number, initial_balance } = account;

    const sql = `
      INSERT INTO accounts (name, type, account_number, initial_balance, current_balance)
      VALUES (?, ?, ?, ?, ?)
    `;

    const result = await db.runQuery(sql, [
      name,
      type,
      account_number || null,
      initial_balance || 0,
      initial_balance || 0,
    ]);

    return await db.getQuery('SELECT * FROM accounts WHERE id = ?', [result.id]);
  } catch (error) {
    logError('Error in handleAddAccount:', error);
    throw new Error('فشل في إضافة الحساب');
  }
}

// ============================================
// CATEGORY HANDLERS
// ============================================

async function handleGetCategories(event, type) {
  try {
    let sql = 'SELECT * FROM categories WHERE is_active = 1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY name';
    return await db.allQuery(sql, params);
  } catch (error) {
    logError('Error in handleGetCategories:', error);
    return [];
  }
}

async function handleGetInKindCategories(event) {
  try {
    const tableCheck = await db.getQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='in_kind_categories'",
    );
    if (!tableCheck) return [];
    return await db.allQuery(
      'SELECT * FROM in_kind_categories WHERE is_active = 1 ORDER BY is_system, name',
    );
  } catch (error) {
    logError('Error in handleGetInKindCategories:', error);
    return [];
  }
}

async function handleAddInKindCategory(event, name) {
  try {
    const result = await db.runQuery(
      'INSERT INTO in_kind_categories (name, is_system, is_active) VALUES (?, 0, 1)',
      [name],
    );
    return await db.getQuery('SELECT * FROM in_kind_categories WHERE id = ?', [result.id]);
  } catch (error) {
    logError('Error in handleAddInKindCategory:', error);
    throw new Error('فشل في إضافة الفئة');
  }
}

async function handleUpdateInKindCategory(event, id, name) {
  try {
    const category = await db.getQuery('SELECT * FROM in_kind_categories WHERE id = ?', [id]);
    if (category.is_system) {
      throw new Error('لا يمكن تعديل الفئات الافتراضية');
    }
    await db.runQuery('UPDATE in_kind_categories SET name = ? WHERE id = ?', [name, id]);
    return await db.getQuery('SELECT * FROM in_kind_categories WHERE id = ?', [id]);
  } catch (error) {
    logError('Error in handleUpdateInKindCategory:', error);
    throw new Error(error.message || 'فشل في تحديث الفئة');
  }
}

async function handleDeleteInKindCategory(event, id) {
  try {
    const category = await db.getQuery('SELECT * FROM in_kind_categories WHERE id = ?', [id]);
    if (category.is_system) {
      throw new Error('لا يمكن حذف الفئات الافتراضية');
    }
    await db.runQuery('DELETE FROM in_kind_categories WHERE id = ?', [id]);
    return { id };
  } catch (error) {
    logError('Error in handleDeleteInKindCategory:', error);
    throw new Error(error.message || 'فشل في حذف الفئة');
  }
}

// ============================================
// EXPORT HANDLERS
// ============================================

const { dialog } = require('electron');
const fs = require('fs').promises;

async function handleExportFinancialReportPDF(event, data) {
  try {
    const { period, summary } = data;
    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ التقرير المالي',
      defaultPath: `financial-report-${period.startDate}-${period.endDate}.txt`,
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
    });

    if (!filePath) return { cancelled: true };

    // Enhanced text report
    let content = '='.repeat(60) + '\n';
    content += 'التقرير المالي\n';
    content += '='.repeat(60) + '\n\n';
    content += `الفترة: ${period.startDate} إلى ${period.endDate}\n\n`;
    content += '-'.repeat(60) + '\n';
    content += 'الملخص المالي\n';
    content += '-'.repeat(60) + '\n';
    content += `إجمالي المداخيل: ${summary.totalIncome?.toFixed(2) || 0} د.ت\n`;
    content += `إجمالي المصاريف: ${summary.totalExpenses?.toFixed(2) || 0} د.ت\n`;
    content += `الرصيد الصافي: ${((summary.totalIncome || 0) - (summary.totalExpenses || 0)).toFixed(2)} د.ت\n\n`;

    if (summary.incomeByCategory?.length > 0) {
      content += '-'.repeat(60) + '\n';
      content += 'المداخيل حسب الفئة\n';
      content += '-'.repeat(60) + '\n';
      summary.incomeByCategory.forEach((item) => {
        content += `${item.category}: ${item.total.toFixed(2)} د.ت\n`;
      });
      content += '\n';
    }

    if (summary.expensesByCategory?.length > 0) {
      content += '-'.repeat(60) + '\n';
      content += 'المصاريف حسب الفئة\n';
      content += '-'.repeat(60) + '\n';
      summary.expensesByCategory.forEach((item) => {
        content += `${item.category}: ${item.total.toFixed(2)} د.ت\n`;
      });
    }

    await fs.writeFile(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (error) {
    logError('Error exporting PDF:', error);
    throw new Error('فشل في تصدير التقرير');
  }
}

async function handleExportFinancialReportExcel(event, data) {
  try {
    const ExcelJS = require('exceljs');
    const { period, summary } = data;

    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ التقرير المالي',
      defaultPath: `financial-report-${period.startDate}-${period.endDate}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (!filePath) return { cancelled: true };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('التقرير المالي');

    // Header
    worksheet.addRow(['التقرير المالي']);
    worksheet.addRow([`الفترة: ${period.startDate} - ${period.endDate}`]);
    worksheet.addRow([]);

    // Summary
    worksheet.addRow(['الملخص المالي']);
    worksheet.addRow(['إجمالي المداخيل', summary.totalIncome?.toFixed(2) || 0]);
    worksheet.addRow(['إجمالي المصاريف', summary.totalExpenses?.toFixed(2) || 0]);
    worksheet.addRow([
      'الرصيد الصافي',
      ((summary.totalIncome || 0) - (summary.totalExpenses || 0)).toFixed(2),
    ]);
    worksheet.addRow([]);

    // Income by category
    if (summary.incomeByCategory?.length > 0) {
      worksheet.addRow(['المداخيل حسب الفئة']);
      worksheet.addRow(['الفئة', 'المبلغ']);
      summary.incomeByCategory.forEach((item) => {
        worksheet.addRow([item.category, item.total]);
      });
      worksheet.addRow([]);
    }

    // Expenses by category
    if (summary.expensesByCategory?.length > 0) {
      worksheet.addRow(['المصاريف حسب الفئة']);
      worksheet.addRow(['الفئة', 'المبلغ']);
      summary.expensesByCategory.forEach((item) => {
        worksheet.addRow([item.category, item.total]);
      });
    }

    await workbook.xlsx.writeFile(filePath);
    return { success: true, filePath };
  } catch (error) {
    logError('Error exporting Excel:', error);
    throw new Error('فشل في تصدير التقرير');
  }
}

// ============================================
// REGISTER HANDLERS
// ============================================

function registerFinancialHandlers() {
  // New unified transaction handlers
  ipcMain.handle(
    'transactions:get',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(handleGetTransactions),
  );
  ipcMain.handle(
    'transactions:add',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(handleAddTransaction),
  );
  ipcMain.handle(
    'transactions:update',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(handleUpdateTransaction),
  );
  ipcMain.handle(
    'transactions:delete',
    requireRoles(['Superadmin', 'Administrator'])(handleDeleteTransaction),
  );

  // Reports
  ipcMain.handle(
    'financial:get-summary',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(handleGetFinancialSummary),
  );
  ipcMain.handle(
    'financial:export-pdf',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(handleExportFinancialReportPDF),
  );
  ipcMain.handle(
    'financial:export-excel',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      handleExportFinancialReportExcel,
    ),
  );

  // Accounts
  ipcMain.handle(
    'accounts:get',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(handleGetAccounts),
  );
  ipcMain.handle('accounts:add', requireRoles(['Superadmin', 'Administrator'])(handleAddAccount));

  // Categories
  ipcMain.handle('categories:get', handleGetCategories);
  ipcMain.handle('in-kind-categories:get', handleGetInKindCategories);
  ipcMain.handle(
    'in-kind-categories:add',
    requireRoles(['Superadmin', 'Administrator'])(handleAddInKindCategory),
  );
  ipcMain.handle(
    'in-kind-categories:update',
    requireRoles(['Superadmin', 'Administrator'])(handleUpdateInKindCategory),
  );
  ipcMain.handle(
    'in-kind-categories:delete',
    requireRoles(['Superadmin', 'Administrator'])(handleDeleteInKindCategory),
  );
}

module.exports = {
  registerFinancialHandlers,
  handleGetTransactions,
  handleAddTransaction,
  handleUpdateTransaction,
  handleDeleteTransaction,
  handleGetFinancialSummary,
  handleGetAccounts,
  handleAddAccount,
  handleGetCategories,
  handleGetInKindCategories,
  handleAddInKindCategory,
  handleUpdateInKindCategory,
  handleDeleteInKindCategory,
  handleExportFinancialReportPDF,
  handleExportFinancialReportExcel,
};
