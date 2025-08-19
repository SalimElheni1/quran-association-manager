const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { allQuery, runQuery, getQuery } = require('../db/db');

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
  const { donor_name, amount, donation_date, notes } = donation;
  const sql = `INSERT INTO donations (donor_name, amount, donation_date, notes) VALUES (?, ?, ?, ?)`;
  const result = await runQuery(sql, [donor_name, amount, donation_date, notes]);
  return getQuery('SELECT * FROM donations WHERE id = ?', [result.id]);
}
async function handleUpdateDonation(event, donation) {
  const { id, donor_name, amount, donation_date, notes } = donation;
  const sql = `UPDATE donations SET donor_name = ?, amount = ?, donation_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await runQuery(sql, [donor_name, amount, donation_date, notes, id]);
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
        SELECT 'Donations' as source, SUM(amount) as total FROM donations
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
  // Placeholder for logos, if they become available
  // doc.image(path.join(app.getAppPath(), 'path/to/logo.png'), 50, 40, { width: 50 });
  doc.font(FONT_BOLD).fontSize(20).text('تقرير مالي - مدير الفروع', { align: 'center' });
  doc.font(FONT_REGULAR).fontSize(16).text(title, { align: 'center' });
  doc.moveDown(2);
}

function addReportFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(10)
      .text(`صفحة ${i + 1} من ${range.count}`, 50, doc.page.height - 50, {
        align: 'center',
        lineBreak: false,
      });
  }
}

async function handleGeneratePdfReport() {
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, `Financial-Report-${Date.now()}.pdf`);

    const doc = new PDFDocument({ margin: 50, layout: 'portrait', size: 'A4' });
    doc.pipe(fs.createWriteStream(filePath));

    // Register fonts
    doc.registerFont('Cairo-Regular', FONT_REGULAR);
    doc.registerFont('Cairo-Bold', FONT_BOLD);

    // Set text direction to RTL for the whole document
    doc.font('Cairo-Regular').rtl();

    addReportHeader(doc, 'ملخص مالي شامل');

    const summary = await handleGetFinancialSummary();
    const payments = await handleGetPayments();
    const salaries = await handleGetSalaries();
    const donations = await handleGetDonations();
    const expenses = await handleGetExpenses();

    doc.font('Cairo-Bold').fontSize(14).text('ملخص عام:', { align: 'right' });
    doc.font('Cairo-Regular').fontSize(12).text(`إجمالي الدخل: ${summary.totalIncome.toFixed(2)}`, { align: 'right' });
    doc.font('Cairo-Regular').fontSize(12).text(`إجمالي المصروفات: ${summary.totalExpenses.toFixed(2)}`, { align: 'right' });
    doc.font('Cairo-Bold').fontSize(12).text(`الرصيد: ${summary.balance.toFixed(2)}`, { align: 'right' });
    doc.moveDown(2);

    // Function to draw a table
    const drawTable = (title, headers, data, columnWidths) => {
        doc.font('Cairo-Bold').fontSize(14).text(title, { align: 'right' });
        doc.moveDown();

        const tableTop = doc.y;
        const headerY = tableTop + 15;
        const rowHeight = 25;
        let currentX = doc.page.width - doc.page.margins.right;

        // Draw headers
        headers.forEach((header, i) => {
            doc.font('Cairo-Bold').text(header, currentX - columnWidths[i] + 5, headerY, { width: columnWidths[i] - 10, align: 'right' });
            currentX -= columnWidths[i];
        });
        doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.moveDown();

        // Draw rows
        data.forEach(row => {
            let rowY = doc.y;
            currentX = doc.page.width - doc.page.margins.right;
            if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom) {
                doc.addPage();
                rowY = doc.y;
            }
            row.forEach((cell, i) => {
                doc.font('Cairo-Regular').text(cell.toString(), currentX - columnWidths[i] + 5, rowY + 5, { width: columnWidths[i] - 10, align: 'right' });
                currentX -= columnWidths[i];
            });
            doc.moveTo(doc.page.margins.left, doc.y + rowHeight).lineTo(doc.page.width - doc.page.margins.right, doc.y + rowHeight).stroke();
            doc.y += rowHeight;
        });
        doc.moveDown(2);
    };

    // Payments Table
    drawTable('الرسوم الدراسية', ['الطالب', 'المبلغ', 'التاريخ'], payments.map(p => [p.student_name, p.amount.toFixed(2), new Date(p.payment_date).toLocaleDateString()]), [200, 100, 200]);
    // Salaries Table
    drawTable('الرواتب', ['المعلم', 'المبلغ', 'التاريخ'], salaries.map(s => [s.teacher_name, s.amount.toFixed(2), new Date(s.payment_date).toLocaleDateString()]), [200, 100, 200]);
    // Donations Table
    drawTable('التبرعات', ['المتبرع', 'المبلغ', 'التاريخ'], donations.map(d => [d.donor_name, d.amount.toFixed(2), new Date(d.donation_date).toLocaleDateString()]), [200, 100, 200]);
    // Expenses Table
    drawTable('المصاريف', ['الفئة', 'المبلغ', 'التاريخ'], expenses.map(e => [e.category, e.amount.toFixed(2), new Date(e.expense_date).toLocaleDateString()]), [200, 100, 200]);

    addReportFooter(doc);
    doc.end();
    return { success: true, path: filePath };
}


// --- Excel Report Generation ---
async function handleGetChartData() {
  try {
    // 1. Income vs Expenses over time (monthly)
    const monthlyAggSql = `
      SELECT
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as totalIncome,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as totalExpense
      FROM (
        SELECT amount, payment_date as date, 'income' as type FROM payments
        UNION ALL
        SELECT amount, donation_date as date, 'income' as type FROM donations
        UNION ALL
        SELECT amount, expense_date as date, 'expense' as type FROM expenses
        UNION ALL
        SELECT amount, payment_date as date, 'expense' as type FROM salaries
      )
      GROUP BY month
      ORDER BY month;
    `;
    const timeSeriesData = await allQuery(monthlyAggSql);

    // 2. Expense category breakdown (pie chart)
    const expenseCatSql = `
      SELECT category, SUM(amount) as total
      FROM expenses
      GROUP BY category
      ORDER BY total DESC;
    `;
    const expenseCategoryData = await allQuery(expenseCatSql);

    // 3. Income source breakdown (bar chart)
    const incomeSourceSql = `
        SELECT 'الرسوم الدراسية' as source, SUM(amount) as total FROM payments
        UNION ALL
        SELECT 'التبرعات' as source, SUM(amount) as total FROM donations
    `;
    const incomeSourceData = await allQuery(incomeSourceSql);


    return { timeSeriesData, expenseCategoryData, incomeSourceData };
  } catch (error) {
    console.error('Error fetching chart data:', error);
    throw error;
  }
}


async function handleGenerateExcelReport() {
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, `Financial-Report-${Date.now()}.xlsx`);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Quran Branch Manager';
    workbook.created = new Date();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('ملخص مالي');
    const summary = await handleGetFinancialSummary();
    summarySheet.addRow(['إجمالي الدخل', summary.totalIncome.toFixed(2)]);
    summarySheet.addRow(['إجمالي المصروفات', summary.totalExpenses.toFixed(2)]);
    summarySheet.addRow(['الرصيد', summary.balance.toFixed(2)]);

    // Function to add a data sheet
    const addDataSheet = (sheetName, headers, data) => {
        const sheet = workbook.addWorksheet(sheetName);
        sheet.addRow(headers);
        data.forEach(row => sheet.addRow(Object.values(row)));
    };

    // Add data sheets
    const payments = await handleGetPayments();
    addDataSheet('الرسوم الدراسية', ['ID', 'الطالب', 'المبلغ', 'تاريخ الدفع', 'طريقة الدفع', 'ملاحظات'], payments.map(p => ({ id: p.id, student: p.student_name, amount: p.amount, date: new Date(p.payment_date).toLocaleDateString(), method: p.payment_method, notes: p.notes })));

    const salaries = await handleGetSalaries();
    addDataSheet('الرواتب', ['ID', 'المعلم', 'المبلغ', 'تاريخ الدفع', 'ملاحظات'], salaries.map(s => ({ id: s.id, teacher: s.teacher_name, amount: s.amount, date: new Date(s.payment_date).toLocaleDateString(), notes: s.notes })));

    const donations = await handleGetDonations();
    addDataSheet('التبرعات', ['ID', 'المتبرع', 'المبلغ', 'تاريخ التبرع', 'ملاحظات'], donations.map(d => ({ id: d.id, donor: d.donor_name, amount: d.amount, date: new Date(d.donation_date).toLocaleDateString(), notes: d.notes })));

    const expenses = await handleGetExpenses();
    addDataSheet('المصاريف', ['ID', 'الفئة', 'المبلغ', 'تاريخ الصرف', 'المسؤول', 'الوصف'], expenses.map(e => ({ id: e.id, category: e.category, amount: e.amount, date: new Date(e.expense_date).toLocaleDateString(), responsible: e.responsible_person, desc: e.description })));

    await workbook.xlsx.writeFile(filePath);
    return { success: true, path: filePath };
}


function registerFinancialHandlers() {
  // Expenses
  ipcMain.handle('get-expenses', handleGetExpenses);
  ipcMain.handle('add-expense', handleAddExpense);
  ipcMain.handle('update-expense', handleUpdateExpense);
  ipcMain.handle('delete-expense', handleDeleteExpense);
  // Donations
  ipcMain.handle('get-donations', handleGetDonations);
  ipcMain.handle('add-donation', handleAddDonation);
  ipcMain.handle('update-donation', handleUpdateDonation);
  ipcMain.handle('delete-donation', handleDeleteDonation);
  // Salaries
  ipcMain.handle('get-salaries', handleGetSalaries);
  ipcMain.handle('add-salary', handleAddSalary);
  ipcMain.handle('update-salary', handleUpdateSalary);
  ipcMain.handle('delete-salary', handleDeleteSalary);
  // Payments
  ipcMain.handle('get-payments', handleGetPayments);
  ipcMain.handle('add-payment', handleAddPayment);
  ipcMain.handle('update-payment', handleUpdatePayment);
  ipcMain.handle('delete-payment', handleDeletePayment);
  // Reports
  ipcMain.handle('get-financial-summary', handleGetFinancialSummary);
  ipcMain.handle('generate-pdf-report', handleGeneratePdfReport);
  ipcMain.handle('generate-excel-report', handleGenerateExcelReport);
  ipcMain.handle('get-chart-data', handleGetChartData);
}

module.exports = {
  registerFinancialHandlers,
  handleGetExpenses, // Export for testing
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
