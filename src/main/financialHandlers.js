const { ipcMain } = require('electron');
const path = require('path');
// const fs = require('fs');
// const path = require('path');
// const PDFDocument = require('pdfkit');
// const ExcelJS = require('exceljs');
const { allQuery, runQuery, getQuery } = require(path.join(__dirname, '..', 'db', 'db.js'));

// --- Generic Error Handler ---
function createHandler(handler) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      console.error(`Error in handler ${handler.name}:`, err.message);
      // Re-throw the error to be caught by the renderer process
      throw new Error(err.message || 'An unexpected error occurred in the main process.');
    }
  };
}

// --- Expense Handlers ---
async function handleGetExpenses() {
  return allQuery('SELECT * FROM expenses ORDER BY expense_date DESC');
}
async function handleAddExpense(event, expense) {
  const { category, amount, expense_date, responsible_person, description } = expense;
  const sql = `INSERT INTO expenses (category, amount, expense_date, responsible_person, description) VALUES (?, ?, ?, ?, ?)`;
  const result = await runQuery(sql, [
    category,
    amount,
    expense_date,
    responsible_person,
    description,
  ]);
  return getQuery('SELECT * FROM expenses WHERE id = ?', [result.id]);
}
async function handleUpdateExpense(event, expense) {
  const { id, category, amount, expense_date, responsible_person, description } = expense;
  const sql = `UPDATE expenses SET category = ?, amount = ?, expense_date = ?, responsible_person = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await runQuery(sql, [category, amount, expense_date, responsible_person, description, id]);
  return getQuery('SELECT * FROM expenses WHERE id = ?', [id]);
}
async function handleDeleteExpense(event, expenseId) {
  await runQuery('DELETE FROM expenses WHERE id = ?', [expenseId]);
  return { id: expenseId };
}

// --- Donation Handlers ---
async function handleGetDonations() {
  return allQuery('SELECT * FROM donations ORDER BY donation_date DESC');
}
async function handleAddDonation(event, donation) {
  const { donor_name, amount, donation_date, notes, donation_type, description } = donation;
  const sql = `INSERT INTO donations (donor_name, amount, donation_date, notes, donation_type, description) VALUES (?, ?, ?, ?, ?, ?)`;
  const result = await runQuery(sql, [
    donor_name,
    amount,
    donation_date,
    notes,
    donation_type,
    description,
  ]);
  return getQuery('SELECT * FROM donations WHERE id = ?', [result.id]);
}
async function handleUpdateDonation(event, donation) {
  const { id, donor_name, amount, donation_date, notes, donation_type, description } = donation;
  const sql = `UPDATE donations SET donor_name = ?, amount = ?, donation_date = ?, notes = ?, donation_type = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await runQuery(sql, [donor_name, amount, donation_date, notes, donation_type, description, id]);
  return getQuery('SELECT * FROM donations WHERE id = ?', [id]);
}
async function handleDeleteDonation(event, donationId) {
  await runQuery('DELETE FROM donations WHERE id = ?', [donationId]);
  return { id: donationId };
}

// --- Salary Handlers ---
async function handleGetSalaries() {
  const sql = `
    SELECT s.id, s.teacher_id, t.name as teacher_name, s.amount, s.payment_date, s.notes
    FROM salaries s
    JOIN teachers t ON s.teacher_id = t.id
    ORDER BY s.payment_date DESC
  `;
  return allQuery(sql);
}
async function handleAddSalary(event, salary) {
  const { teacher_id, amount, payment_date, notes } = salary;
  const sql = `INSERT INTO salaries (teacher_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)`;
  const result = await runQuery(sql, [teacher_id, amount, payment_date, notes]);
  return getQuery(
    'SELECT s.id, s.teacher_id, t.name as teacher_name, s.amount, s.payment_date, s.notes FROM salaries s JOIN teachers t ON s.teacher_id = t.id WHERE s.id = ?',
    [result.id],
  );
}
async function handleUpdateSalary(event, salary) {
  const { id, teacher_id, amount, payment_date, notes } = salary;
  const sql = `UPDATE salaries SET teacher_id = ?, amount = ?, payment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await runQuery(sql, [teacher_id, amount, payment_date, notes, id]);
  return getQuery(
    'SELECT s.id, s.teacher_id, t.name as teacher_name, s.amount, s.payment_date, s.notes FROM salaries s JOIN teachers t ON s.teacher_id = t.id WHERE s.id = ?',
    [id],
  );
}
async function handleDeleteSalary(event, salaryId) {
  await runQuery('DELETE FROM salaries WHERE id = ?', [salaryId]);
  return { id: salaryId };
}

// --- Payment Handlers ---
async function handleGetPayments() {
  const sql = `
    SELECT p.id, p.student_id, s.name as student_name, p.amount, p.payment_date, p.payment_method, p.notes
    FROM payments p
    JOIN students s ON p.student_id = s.id
    ORDER BY p.payment_date DESC
  `;
  return allQuery(sql);
}
async function handleAddPayment(event, payment) {
  const { student_id, amount, payment_date, payment_method, notes } = payment;
  const sql = `INSERT INTO payments (student_id, amount, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?)`;
  const result = await runQuery(sql, [student_id, amount, payment_date, payment_method, notes]);
  return getQuery(
    'SELECT p.id, p.student_id, s.name as student_name, p.amount, p.payment_date, p.payment_method, p.notes FROM payments p JOIN students s ON p.student_id = s.id WHERE p.id = ?',
    [result.id],
  );
}
async function handleUpdatePayment(event, payment) {
  const { id, student_id, amount, payment_date, payment_method, notes } = payment;
  const sql = `UPDATE payments SET student_id = ?, amount = ?, payment_date = ?, payment_method = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await runQuery(sql, [student_id, amount, payment_date, payment_method, notes, id]);
  return getQuery(
    'SELECT p.id, p.student_id, s.name as student_name, p.amount, p.payment_date, p.payment_method, p.notes FROM payments p JOIN students s ON p.student_id = s.id WHERE p.id = ?',
    [id],
  );
}
async function handleDeletePayment(event, paymentId) {
  await runQuery('DELETE FROM payments WHERE id = ?', [paymentId]);
  return { id: paymentId };
}

// --- Reporting Handlers ---
async function handleGetStatementOfActivities() {
  const startOfMonth = new Date(new Date().setDate(1)).toISOString().split('T')[0] + ' 00:00:00';
  const now = new Date().toISOString();

  // Statement of Activities Data
  const feesSql = `SELECT SUM(amount) as total FROM payments WHERE payment_date BETWEEN ? AND ?`;
  const donationsSql = `SELECT SUM(amount) as total FROM donations WHERE donation_type = 'Cash' AND donation_date BETWEEN ? AND ?`;
  const salariesSql = `SELECT SUM(amount) as total FROM salaries WHERE payment_date BETWEEN ? AND ?`;
  const expensesSql = `SELECT category, SUM(amount) as total FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY category`;

  // Recent Transactions Data
  const recentTransactionsSql = `
        SELECT date, type, details, amount FROM (
            SELECT payment_date as date, 'دفعة رسوم' as type, 'دفعة من الطالب ' || s.name as details, amount FROM payments p JOIN students s ON p.student_id = s.id
            UNION ALL
            SELECT donation_date as date, 'تبرع نقدي' as type, 'تبرع من ' || donor_name as details, amount FROM donations WHERE donation_type = 'Cash'
            UNION ALL
            SELECT donation_date as date, 'تبرع عيني' as type, description as details, NULL as amount FROM donations WHERE donation_type = 'In-kind'
            UNION ALL
            SELECT payment_date as date, 'راتب' as type, 'راتب للمعلم ' || t.name as details, amount FROM salaries s JOIN teachers t ON s.teacher_id = t.id
            UNION ALL
            SELECT expense_date as date, 'مصروف' as type, category as details, amount FROM expenses
        )
        ORDER BY date DESC
        LIMIT 10;
    `;

  const [
    fees,
    donations,
    salaries,
    expenses,
    recentTransactions
  ] = await Promise.all([
    getQuery(feesSql, [startOfMonth, now]),
    getQuery(donationsSql, [startOfMonth, now]),
    getQuery(salariesSql, [startOfMonth, now]),
    allQuery(expensesSql, [startOfMonth, now]),
    allQuery(recentTransactionsSql),
  ]);

  return {
    studentFees: fees?.total || 0,
    cashDonations: donations?.total || 0,
    salaries: salaries?.total || 0,
    expensesByCategory: expenses,
    recentTransactions,
  };
}

async function handleGetMonthlySnapshot() {
  const startOfMonth = new Date(new Date().setDate(1)).toISOString().split('T')[0] + ' 00:00:00';
  const now = new Date().toISOString();

  const incomeSql = `SELECT SUM(amount) as total FROM payments WHERE payment_date BETWEEN ? AND ?`;
  const expensesSql = `SELECT SUM(amount) as total FROM expenses WHERE expense_date BETWEEN ? AND ?`;
  const salariesSql = `SELECT SUM(amount) as total FROM salaries WHERE payment_date BETWEEN ? AND ?`;
  const paymentCountSql = `SELECT COUNT(*) as count FROM payments WHERE payment_date BETWEEN ? AND ?`;
  const largestExpenseSql = `SELECT MAX(amount) as max FROM expenses WHERE expense_date BETWEEN ? AND ?`;

  const [monthlyIncome, monthlyExpenses, monthlySalaries, paymentCount, largestExpense] =
    await Promise.all([
      getQuery(incomeSql, [startOfMonth, now]),
      getQuery(expensesSql, [startOfMonth, now]),
      getQuery(salariesSql, [startOfMonth, now]),
      getQuery(paymentCountSql, [startOfMonth, now]),
      getQuery(largestExpenseSql, [startOfMonth, now]),
    ]);

  return {
    totalIncomeThisMonth: monthlyIncome?.total || 0,
    totalExpensesThisMonth: (monthlyExpenses?.total || 0) + (monthlySalaries?.total || 0),
    paymentsThisMonth: paymentCount?.count || 0,
    largestExpenseThisMonth: largestExpense?.max || 0,
  };
}

async function handleGetFinancialSummary() {
  const incomeSql = `
        SELECT 'Payments' as source, SUM(amount) as total FROM payments
        UNION ALL
        SELECT 'Donations' as source, SUM(amount) as total FROM donations WHERE donation_type = 'Cash'
    `;
  const expensesSql = `SELECT 'Expenses' as source, SUM(amount) as total FROM expenses`;
  const salariesSql = `SELECT 'Salaries' as source, SUM(amount) as total FROM salaries`;

  const [income, expenses, salaries] = await Promise.all([
    allQuery(incomeSql),
    allQuery(expensesSql),
    allQuery(salariesSql),
  ]);

  const totalIncome = income.reduce((acc, item) => acc + (item.total || 0), 0);
  const totalExpenses = (expenses[0]?.total || 0) + (salaries[0]?.total || 0);

  return {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    incomeBreakdown: income,
    expenseBreakdown: [...expenses, ...salaries],
  };
}

// --- PDF Report Generation (Disabled) ---
// const FONT_REGULAR = path.join(app.getAppPath(), 'src/renderer/assets/fonts/cairo-v30-arabic_latin-regular.woff2');
// const FONT_BOLD = path.join(app.getAppPath(), 'src/renderer/assets/fonts/cairo-v30-arabic_latin-700.woff2');
// ... (rest of the PDF generation code is commented out)

// --- Excel Report Generation (Disabled) ---
// async function handleGenerateExcelReport() { ... }

function registerFinancialHandlers() {
  ipcMain.handle('get-expenses', createHandler(handleGetExpenses));
  ipcMain.handle('add-expense', createHandler(handleAddExpense));
  ipcMain.handle('update-expense', createHandler(handleUpdateExpense));
  ipcMain.handle('delete-expense', createHandler(handleDeleteExpense));

  ipcMain.handle('get-donations', createHandler(handleGetDonations));
  ipcMain.handle('add-donation', createHandler(handleAddDonation));
  ipcMain.handle('update-donation', createHandler(handleUpdateDonation));
  ipcMain.handle('delete-donation', createHandler(handleDeleteDonation));

  ipcMain.handle('get-salaries', createHandler(handleGetSalaries));
  ipcMain.handle('add-salary', createHandler(handleAddSalary));
  ipcMain.handle('update-salary', createHandler(handleUpdateSalary));
  ipcMain.handle('delete-salary', createHandler(handleDeleteSalary));

  ipcMain.handle('get-payments', createHandler(handleGetPayments));
  ipcMain.handle('add-payment', createHandler(handleAddPayment));
  ipcMain.handle('update-payment', createHandler(handleUpdatePayment));
  ipcMain.handle('delete-payment', createHandler(handleDeletePayment));

  ipcMain.handle('get-financial-summary', createHandler(handleGetFinancialSummary));
  ipcMain.handle('get-monthly-snapshot', createHandler(handleGetMonthlySnapshot));
  ipcMain.handle('get-statement-of-activities', createHandler(handleGetStatementOfActivities));
  // ipcMain.handle('generate-pdf-report', createHandler(handleGeneratePdfReport));
  // ipcMain.handle('generate-excel-report', createHandler(handleGenerateExcelReport));
}

module.exports = {
  registerFinancialHandlers,
  handleGetExpenses,
  handleAddExpense,
  handleUpdateExpense,
  handleDeleteExpense,
  handleGetDonations,
  handleAddDonation,
  handleUpdateDonation,
  handleDeleteDonation,
  handleGetSalaries,
  handleAddSalary,
  handleUpdateSalary,
  handleDeleteSalary,
  handleGetPayments,
  handleAddPayment,
  handleUpdatePayment,
  handleDeletePayment,
  handleGetFinancialSummary,
  handleGetMonthlySnapshot,
  handleGetStatementOfActivities,
};
