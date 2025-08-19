const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { allQuery, runQuery, getQuery } = require('../db/db');

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
  const result = await runQuery(sql, [category, amount, expense_date, responsible_person, description]);
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
  const result = await runQuery(sql, [donor_name, amount, donation_date, notes, donation_type, description]);
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
  return getQuery('SELECT s.id, s.teacher_id, t.name as teacher_name, s.amount, s.payment_date, s.notes FROM salaries s JOIN teachers t ON s.teacher_id = t.id WHERE s.id = ?', [result.id]);
}
async function handleUpdateSalary(event, salary) {
  const { id, teacher_id, amount, payment_date, notes } = salary;
  const sql = `UPDATE salaries SET teacher_id = ?, amount = ?, payment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await runQuery(sql, [teacher_id, amount, payment_date, notes, id]);
  return getQuery('SELECT s.id, s.teacher_id, t.name as teacher_name, s.amount, s.payment_date, s.notes FROM salaries s JOIN teachers t ON s.teacher_id = t.id WHERE s.id = ?', [id]);
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
  return getQuery('SELECT p.id, p.student_id, s.name as student_name, p.amount, p.payment_date, p.payment_method, p.notes FROM payments p JOIN students s ON p.student_id = s.id WHERE p.id = ?', [result.id]);
}
async function handleUpdatePayment(event, payment) {
  const { id, student_id, amount, payment_date, payment_method, notes } = payment;
  const sql = `UPDATE payments SET student_id = ?, amount = ?, payment_date = ?, payment_method = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await runQuery(sql, [student_id, amount, payment_date, payment_method, notes, id]);
  return getQuery('SELECT p.id, p.student_id, s.name as student_name, p.amount, p.payment_date, p.payment_method, p.notes FROM payments p JOIN students s ON p.student_id = s.id WHERE p.id = ?', [id]);
}
async function handleDeletePayment(event, paymentId) {
  await runQuery('DELETE FROM payments WHERE id = ?', [paymentId]);
  return { id: paymentId };
}

// --- Reporting Handlers ---
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
        allQuery(salariesSql)
    ]);

    const totalIncome = income.reduce((acc, item) => acc + (item.total || 0), 0);
    const totalExpenses = (expenses[0]?.total || 0) + (salaries[0]?.total || 0);

    return {
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
        incomeBreakdown: income,
        expenseBreakdown: [...expenses, ...salaries]
    };
}


// --- PDF Report Generation ---
const FONT_REGULAR = path.join(app.getAppPath(), 'src/renderer/assets/fonts/cairo-v30-arabic_latin-regular.woff2');
const FONT_BOLD = path.join(app.getAppPath(), 'src/renderer/assets/fonts/cairo-v30-arabic_latin-700.woff2');

function addReportHeader(doc, title) {
  doc.font(FONT_BOLD).fontSize(20).text('تقرير مالي - مدير الفروع', { align: 'center' });
  doc.font(FONT_REGULAR).fontSize(16).text(title, { align: 'center' });
  doc.moveDown(2);
}

function addReportFooter(doc) {
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(10).text(`صفحة ${i + 1} من ${pageCount}`, 50, doc.page.height - 50, { align: 'center' });
  }
}

async function handleGeneratePdfReport() {
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, `Financial-Report-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50, layout: 'portrait', size: 'A4' });
    doc.pipe(fs.createWriteStream(filePath));
    doc.registerFont('Cairo-Regular', FONT_REGULAR);
    doc.registerFont('Cairo-Bold', FONT_BOLD);
    doc.font('Cairo-Regular').rtl();

    addReportHeader(doc, 'ملخص مالي شامل');

    const [summary, payments, salaries, donations, expenses] = await Promise.all([
        handleGetFinancialSummary(),
        handleGetPayments(),
        handleGetSalaries(),
        handleGetDonations(),
        handleGetExpenses()
    ]);

    doc.font('Cairo-Bold').fontSize(14).text('ملخص عام:', { align: 'right' });
    doc.font('Cairo-Regular').fontSize(12).text(`إجمالي الدخل: ${summary.totalIncome.toFixed(2)}`, { align: 'right' });
    doc.font('Cairo-Regular').fontSize(12).text(`إجمالي المصروفات: ${summary.totalExpenses.toFixed(2)}`, { align: 'right' });
    doc.font('Cairo-Bold').fontSize(12).text(`الرصيد: ${summary.balance.toFixed(2)}`, { align: 'right' });
    doc.moveDown(2);

    const drawTable = (title, headers, data) => {
        if (doc.y > 650) doc.addPage().rtl();
        doc.font('Cairo-Bold').fontSize(14).text(title, { align: 'right' });
        doc.moveDown();
        const table = {
            headers: headers,
            rows: data,
        };
        doc.table(table, {
            prepareHeader: () => doc.font('Cairo-Bold'),
            prepareRow: () => doc.font('Cairo-Regular'),
        });
    };

    drawTable('الرسوم الدراسية', ['ملاحظات', 'طريقة الدفع', 'التاريخ', 'المبلغ', 'الطالب'], payments.map(p => [p.notes, p.payment_method, new Date(p.payment_date).toLocaleDateString(), p.amount.toFixed(2), p.student_name]));
    drawTable('الرواتب', ['ملاحظات', 'التاريخ', 'المبلغ', 'المعلم'], salaries.map(s => [s.notes, new Date(s.payment_date).toLocaleDateString(), s.amount.toFixed(2), s.teacher_name]));
    drawTable('التبرعات', ['ملاحظات', 'الوصف', 'المبلغ', 'النوع', 'التاريخ', 'المتبرع'], donations.map(d => [d.notes, d.description, d.donation_type === 'Cash' ? (d.amount || 0).toFixed(2) : '-', d.donation_type === 'Cash' ? 'نقدي' : 'عيني', new Date(d.donation_date).toLocaleDateString(), d.donor_name]));
    drawTable('المصاريف', ['الوصف', 'المسؤول', 'التاريخ', 'المبلغ', 'الفئة'], expenses.map(e => [e.description, e.responsible_person, new Date(e.expense_date).toLocaleDateString(), e.amount.toFixed(2), e.category]));

    addReportFooter(doc);
    doc.end();
    return { success: true, path: filePath };
}


// --- Excel Report Generation ---
async function handleGetChartData() {
  const monthlyAggSql = `
    SELECT
      strftime('%Y-%m', date) as month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as totalIncome,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as totalExpense
    FROM (
      SELECT amount, payment_date as date, 'income' as type FROM payments
      UNION ALL
      SELECT amount, donation_date as date, 'income' as type FROM donations WHERE donation_type = 'Cash'
      UNION ALL
      SELECT amount, expense_date as date, 'expense' as type FROM expenses
      UNION ALL
      SELECT amount, payment_date as date, 'expense' as type FROM salaries
    )
    GROUP BY month
    ORDER BY month;
  `;
  const expenseCatSql = `SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC;`;
  const incomeSourceSql = `
      SELECT 'الرسوم الدراسية' as source, SUM(amount) as total FROM payments
      UNION ALL
      SELECT 'التبرعات النقدية' as source, SUM(amount) as total FROM donations WHERE donation_type = 'Cash'
  `;
  const [timeSeriesData, expenseCategoryData, incomeSourceData] = await Promise.all([
    allQuery(monthlyAggSql),
    allQuery(expenseCatSql),
    allQuery(incomeSourceSql)
  ]);
  return { timeSeriesData, expenseCategoryData, incomeSourceData };
}


async function handleGenerateExcelReport() {
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, `Financial-Report-${Date.now()}.xlsx`);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Quran Branch Manager';
    workbook.created = new Date();

    const summary = await handleGetFinancialSummary();
    const payments = await handleGetPayments();
    const salaries = await handleGetSalaries();
    const donations = await handleGetDonations();
    const expenses = await handleGetExpenses();

    const summarySheet = workbook.addWorksheet('ملخص مالي');
    summarySheet.addRow(['إجمالي الدخل', summary.totalIncome.toFixed(2)]);
    summarySheet.addRow(['إجمالي المصروفات', summary.totalExpenses.toFixed(2)]);
    summarySheet.addRow(['الرصيد', summary.balance.toFixed(2)]);

    const paymentsSheet = workbook.addWorksheet('الرسوم الدراسية');
    paymentsSheet.columns = [{ header: 'الطالب', key: 'student' }, { header: 'المبلغ', key: 'amount' }, { header: 'تاريخ الدفع', key: 'date' }];
    payments.forEach(p => paymentsSheet.addRow({ student: p.student_name, amount: p.amount, date: new Date(p.payment_date).toLocaleDateString() }));

    const salariesSheet = workbook.addWorksheet('الرواتب');
    salariesSheet.columns = [{ header: 'المعلم', key: 'teacher' }, { header: 'المبلغ', key: 'amount' }, { header: 'تاريخ الدفع', key: 'date' }];
    salaries.forEach(s => salariesSheet.addRow({ teacher: s.teacher_name, amount: s.amount, date: new Date(s.payment_date).toLocaleDateString() }));

    const donationsSheet = workbook.addWorksheet('التبرعات');
    donationsSheet.columns = [{ header: 'المتبرع', key: 'donor' }, { header: 'النوع', key: 'type' }, { header: 'القيمة/الوصف', key: 'value' }, { header: 'التاريخ', key: 'date' }];
    donations.forEach(d => donationsSheet.addRow({ donor: d.donor_name, type: d.donation_type === 'Cash' ? 'نقدي' : 'عيني', value: d.donation_type === 'Cash' ? d.amount : d.description, date: new Date(d.donation_date).toLocaleDateString() }));

    const expensesSheet = workbook.addWorksheet('المصاريف');
    expensesSheet.columns = [{ header: 'الفئة', key: 'category' }, { header: 'المبلغ', key: 'amount' }, { header: 'التاريخ', key: 'date' }];
    expenses.forEach(e => expensesSheet.addRow({ category: e.category, amount: e.amount, date: new Date(e.expense_date).toLocaleDateString() }));

    await workbook.xlsx.writeFile(filePath);
    return { success: true, path: filePath };
}


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
  ipcMain.handle('generate-pdf-report', createHandler(handleGeneratePdfReport));
  ipcMain.handle('generate-excel-report', createHandler(handleGenerateExcelReport));
  ipcMain.handle('get-chart-data', createHandler(handleGetChartData));
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
  handleGetChartData,
};
