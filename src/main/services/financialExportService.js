/**
 * @fileoverview Financial Export Handlers - Generate Excel reports
 * @author Quran Branch Manager Team
 */

const { ipcMain, dialog } = require('electron');
const ExcelJS = require('exceljs');
const db = require('../../db/db');
const { error: logError } = require('../logger');
const { requireRoles } = require('../authMiddleware');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate starting balance for a period
 */
async function getStartingBalance(startDate) {
  // Get last transaction before period
  const lastTransaction = await db.getQuery(
    `SELECT amount, type FROM transactions 
     WHERE transaction_date < ? 
     ORDER BY transaction_date DESC, id DESC 
     LIMIT 1`,
    [startDate],
  );

  if (!lastTransaction) {
    // No transactions before period, get initial balance
    const account = await db.getQuery('SELECT initial_balance FROM accounts WHERE id = 1');
    return account?.initial_balance || 0;
  }

  // Calculate cumulative balance up to this point
  const cumulative = await db.getQuery(
    `SELECT 
      SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as total_expense
     FROM transactions 
     WHERE transaction_date < ?`,
    [startDate],
  );

  const account = await db.getQuery('SELECT initial_balance FROM accounts WHERE id = 1');
  const initialBalance = account?.initial_balance || 0;

  return initialBalance + (cumulative.total_income || 0) - (cumulative.total_expense || 0);
}

/**
 * Format date to Arabic
 */
function formatDateArabic(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ar-TN');
}

/**
 * Apply RTL and Arabic styling to worksheet
 */
function applyArabicStyling(worksheet) {
  worksheet.views = [{ rightToLeft: true }];
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.font = { name: 'Traditional Arabic', size: 12 };
    });
  });
}

// ============================================
// REPORT 1: CASH LEDGER (سجل المحاسبة)
// ============================================

async function generateCashLedgerReport(event, { period }) {
  try {
    const { startDate, endDate } = period;

    // Get settings for organization name
    const nationalName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'national_association_name'",
    );
    const branchName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'local_branch_name'",
    );
    const orgName = nationalName?.value || 'الرابطة الوطنية للقرآن الكريم';
    const branch = branchName?.value || 'الفرع المحلي';

    // Get transactions
    const transactions = await db.allQuery(
      `SELECT * FROM transactions 
       WHERE transaction_date BETWEEN ? AND ?
       ORDER BY transaction_date ASC, id ASC`,
      [startDate, endDate],
    );

    // Calculate starting balance
    const startingBalance = await getStartingBalance(startDate);

    // Format month/year in Arabic
    const startDateObj = new Date(startDate);
    const arabicMonths = [
      'جانفي',
      'فيفري',
      'مارس',
      'أفريل',
      'ماي',
      'جوان',
      'جويلية',
      'أوت',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    const monthYear = `${arabicMonths[startDateObj.getMonth()]}-${startDateObj.getFullYear()}`;

    // Show save dialog
    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ سجل المحاسبة',
      defaultPath: `سجل-المحاسبة-${monthYear}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (!filePath) return { cancelled: true };

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(monthYear);
    worksheet.pageSetup.orientation = 'landscape';

    // Title - Month/Year
    worksheet.mergeCells('A1:G1');
    worksheet.getCell('A1').value = monthYear;
    worksheet.getCell('A1').font = { name: 'Traditional Arabic', size: 14, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Starting balance section - 3 rows
    worksheet.addRow([]);
    const cashRow = worksheet.addRow(['السيولة:', '', '', '', '', startingBalance.toFixed(3), 'د.ت']);
    cashRow.font = { name: 'Traditional Arabic', size: 12, bold: true };
    
    const bankRow = worksheet.addRow(['الرصيد البنكي:', '', '', '', '', '0.000', 'د.ت']);
    bankRow.font = { name: 'Traditional Arabic', size: 12, bold: true };
    
    const totalRow = worksheet.addRow(['المجموع:', '', '', '', '', startingBalance.toFixed(3), 'د.ت']);
    totalRow.font = { name: 'Traditional Arabic', size: 12, bold: true };

    // Column headers
    worksheet.addRow([]);
    const headerRow = worksheet.addRow([
      'رقم التسلسل',
      'التاريخ',
      'Libellé',
      'مداخيل',
      'مصاريف',
      'الرصيد',
      'وثيقة الإثبات',
    ]);
    headerRow.font = { name: 'Traditional Arabic', size: 14, bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // First row: Starting balance
    const firstRow = worksheet.addRow([
      '',
      formatDateArabic(startDate),
      'الرصيد بداية الشهر',
      '',
      '',
      startingBalance.toFixed(3),
      `جرد يوم ${formatDateArabic(startDate)}`,
    ]);
    firstRow.font = { name: 'Traditional Arabic', size: 12, bold: true };
    firstRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Group transactions by date, type, and receipt_type
    const groupedByDate = {};
    transactions.forEach((t) => {
      const key = `${t.transaction_date}_${t.type}_${t.receipt_type || t.category}`;
      if (!groupedByDate[key]) {
        groupedByDate[key] = {
          date: t.transaction_date,
          type: t.type,
          receipt_type: t.receipt_type || t.category,
          transactions: [],
        };
      }
      groupedByDate[key].transactions.push(t);
    });

    // Data rows grouped by date, type, and receipt_type
    let runningBalance = startingBalance;
    let rowNumber = 1;
    Object.keys(groupedByDate)
      .sort()
      .forEach((key) => {
        const group = groupedByDate[key];
        const totalAmount = group.transactions.reduce((sum, t) => sum + t.amount, 0);
        const vouchers = group.transactions
          .map((t) => t.voucher_number || t.matricule)
          .filter((v) => v);

        const inflow = group.type === 'INCOME' ? totalAmount : '';
        const outflow = group.type === 'EXPENSE' ? totalAmount : '';
        runningBalance += group.type === 'INCOME' ? totalAmount : -totalAmount;

        let voucherText = '';
        if (group.type === 'INCOME') {
          voucherText =
            vouchers.length > 1
              ? `وصل إستلام من عدد: ${vouchers[0]} إلى عدد ${vouchers[vouchers.length - 1]}`
              : `وصل إستلام من عدد: ${vouchers[0]}`;
        } else {
          voucherText = `إذن بالدفع عدد: ${vouchers.join('، ')}`;
        }

        const row = worksheet.addRow([
          rowNumber++,
          formatDateArabic(group.date),
          group.receipt_type,
          inflow ? inflow.toFixed(3) : '',
          outflow ? outflow.toFixed(3) : '',
          runningBalance.toFixed(3),
          voucherText,
        ]);

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          // Apply red font to expense vouchers (column 7)
          if (colNumber === 7 && group.type === 'EXPENSE') {
            cell.font = { name: 'Traditional Arabic', size: 12, color: { argb: 'FFFF0000' } };
          }
        });
      });

    // Footer: Ending balance - 3 rows
    worksheet.addRow([]);
    const endCashRow = worksheet.addRow(['السيولة:', '', '', '', '', runningBalance.toFixed(3), 'د.ت']);
    endCashRow.font = { name: 'Traditional Arabic', size: 12, bold: true };
    endCashRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
    
    const endBankRow = worksheet.addRow(['الرصيد البنكي:', '', '', '', '', '0.000', 'د.ت']);
    endBankRow.font = { name: 'Traditional Arabic', size: 12, bold: true };
    endBankRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
    
    const endTotalRow = worksheet.addRow(['المجموع:', '', '', '', '', runningBalance.toFixed(3), 'د.ت']);
    endTotalRow.font = { name: 'Traditional Arabic', size: 12, bold: true };
    endTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
    [endCashRow, endBankRow, endTotalRow].forEach(row => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Column widths
    worksheet.columns = [
      { width: 10 },
      { width: 12 },
      { width: 35 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 18 },
    ];

    applyArabicStyling(worksheet);
    await workbook.xlsx.writeFile(filePath);

    return { success: true, filePath };
  } catch (error) {
    logError('Error generating cash ledger:', error);
    throw new Error('فشل في إنشاء سجل المحاسبة');
  }
}

// ============================================
// REPORT 2: INVENTORY REGISTER (سجل الجرد)
// ============================================

async function generateInventoryRegister(event, { period }) {
  try {
    const { startDate, endDate } = period;

    // Get settings
    const nationalName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'national_association_name'",
    );
    const branchName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'local_branch_name'",
    );
    const orgName = nationalName?.value || 'الرابطة الوطنية للقرآن الكريم';
    const branch = branchName?.value || 'الفرع المحلي';

    // Get active inventory
    const inventory = await db.allQuery(
      'SELECT * FROM inventory_items ORDER BY category, item_name',
    );

    // Get in-kind donations from period
    const inKindDonations = await db.allQuery(
      `SELECT * FROM transactions 
       WHERE category = 'التبرعات العينية' 
       AND transaction_date BETWEEN ? AND ?
       ORDER BY transaction_date DESC`,
      [startDate, endDate],
    );

    const reportDate = new Date().toISOString().split('T')[0];
    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ سجل الجرد',
      defaultPath: `سجل-الجرد-${reportDate}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (!filePath) return { cancelled: true };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('سجل الجرد');

    // Header - Organization name
    worksheet.mergeCells('A1:J1');
    worksheet.getCell('A1').value = orgName;
    worksheet.getCell('A1').font = { size: 14, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Branch name
    worksheet.mergeCells('A2:J2');
    worksheet.getCell('A2').value = branch;
    worksheet.getCell('A2').font = { size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Title
    worksheet.mergeCells('A3:J3');
    worksheet.getCell('A3').value = 'سجل جرد العقارات والمنقولات';
    worksheet.getCell('A3').font = { size: 16, bold: true };
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    worksheet.addRow([]);

    // Column headers
    const headerRow = worksheet.addRow([
      'الرقم',
      'اسم الصنف',
      'الفئة',
      'الكمية',
      'قيمة الوحدة',
      'القيمة الإجمالية',
      'الحالة',
      'تاريخ الاقتناء',
      'المصدر',
      'ملاحظات',
    ]);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Translate condition status
    const conditionMap = {
      New: 'جديد',
      Good: 'جيد',
      Fair: 'مقبول',
      Poor: 'رديء',
    };

    // Inventory items
    let totalValue = 0;
    inventory.forEach((item, index) => {
      const itemTotal = item.total_value || (item.quantity || 0) * (item.unit_value || 0);
      totalValue += itemTotal;

      const row = worksheet.addRow([
        index + 1,
        item.item_name,
        item.category,
        item.quantity,
        item.unit_value?.toFixed(3) || '0.000',
        itemTotal.toFixed(3),
        conditionMap[item.condition_status] || item.condition_status || '-',
        item.acquisition_date ? formatDateArabic(item.acquisition_date) : '-',
        item.acquisition_source || '-',
        item.notes || '-',
      ]);

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // In-kind donations section
    if (inKindDonations.length > 0) {
      worksheet.addRow([]);
      const donationHeaderRow = worksheet.addRow(['التبرعات العينية خلال الفترة:']);
      donationHeaderRow.font = { bold: true, size: 12 };

      inKindDonations.forEach((donation) => {
        try {
          const details = JSON.parse(donation.description);
          const row = worksheet.addRow([
            '',
            details.item_name,
            details.category,
            details.quantity,
            details.unit_value?.toFixed(3) || '0.000',
            details.total_value?.toFixed(3) || '0.000',
            conditionMap[details.condition] || details.condition || '-',
            formatDateArabic(donation.transaction_date),
            'تبرع',
            donation.related_person_name || '-',
          ]);
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
        } catch (e) {
          // Skip malformed JSON
        }
      });
    }

    // Total
    worksheet.addRow([]);
    const totalRow = worksheet.addRow([
      '',
      '',
      '',
      '',
      'القيمة الإجمالية:',
      totalValue.toFixed(3),
      'د.ت',
    ]);
    totalRow.font = { bold: true };

    worksheet.columns = [
      { width: 8 },
      { width: 25 },
      { width: 15 },
      { width: 10 },
      { width: 12 },
      { width: 15 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
      { width: 25 },
    ];

    applyArabicStyling(worksheet);
    await workbook.xlsx.writeFile(filePath);

    return { success: true, filePath };
  } catch (error) {
    logError('Error generating inventory register:', error);
    throw new Error('فشل في إنشاء سجل الجرد');
  }
}

// ============================================
// REPORT 3: FINANCIAL SUMMARY (التقرير المالي)
// ============================================

async function generateFinancialSummary(event, { period }) {
  try {
    const { startDate, endDate } = period;

    // Get settings
    const nationalName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'national_association_name'",
    );
    const branchName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'local_branch_name'",
    );
    const orgName = nationalName?.value || 'الرابطة الوطنية للقرآن الكريم';
    const branch = branchName?.value || 'الفرع المحلي';

    // Get summary data
    const income = await db.allQuery(
      `SELECT 
        CASE 
          WHEN category = 'التبرعات النقدية' THEN receipt_type
          ELSE category
        END as category,
        SUM(amount) as total
       FROM transactions
       WHERE transaction_date BETWEEN ? AND ? AND type = 'INCOME'
         AND (category != 'التبرعات النقدية' OR receipt_type IS NOT NULL)
       GROUP BY CASE 
         WHEN category = 'التبرعات النقدية' THEN receipt_type
         ELSE category
       END`,
      [startDate, endDate],
    );

    const expenses = await db.allQuery(
      `SELECT category, SUM(amount) as total
       FROM transactions
       WHERE transaction_date BETWEEN ? AND ? AND type = 'EXPENSE'
       GROUP BY category`,
      [startDate, endDate],
    );

    const totalIncome = income.reduce((sum, r) => sum + r.total, 0);
    const totalExpenses = expenses.reduce((sum, r) => sum + r.total, 0);
    const startingBalance = await getStartingBalance(startDate);
    const endingBalance = startingBalance + totalIncome - totalExpenses;

    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ التقرير المالي',
      defaultPath: `التقرير-المالي-${startDate}-${endDate}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (!filePath) return { cancelled: true };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('التقرير المالي');

    // Header - Organization name
    worksheet.mergeCells('A1:C1');
    worksheet.getCell('A1').value = orgName;
    worksheet.getCell('A1').font = { size: 14, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Branch name
    worksheet.mergeCells('A2:C2');
    worksheet.getCell('A2').value = branch;
    worksheet.getCell('A2').font = { size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Title
    worksheet.mergeCells('A3:C3');
    worksheet.getCell('A3').value = 'التقرير المالي';
    worksheet.getCell('A3').font = { size: 16, bold: true };
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    // Period
    worksheet.mergeCells('A4:C4');
    worksheet.getCell('A4').value =
      `للفترة الممتدة بين ${formatDateArabic(startDate)} و ${formatDateArabic(endDate)}`;
    worksheet.getCell('A4').font = { size: 11 };
    worksheet.getCell('A4').alignment = { horizontal: 'center' };

    // Summary section with box
    worksheet.addRow([]);
    const summaryStartRow = worksheet.lastRow.number + 1;

    worksheet.addRow([
      'السيولة بتاريخ ' + formatDateArabic(startDate),
      startingBalance.toFixed(3) + ' د.ت',
    ]);
    worksheet.addRow(['مجموع المداخيل', totalIncome.toFixed(3) + ' د.ت']);
    worksheet.addRow(['مجموع المصاريف', totalExpenses.toFixed(3) + ' د.ت']);
    const endBalanceRow = worksheet.addRow([
      'السيولة بتاريخ ' + formatDateArabic(endDate),
      endingBalance.toFixed(3) + ' د.ت',
    ]);
    endBalanceRow.font = { bold: true };

    // Add borders to summary section
    for (let i = summaryStartRow; i <= worksheet.lastRow.number; i++) {
      worksheet.getRow(i).eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    }

    // Details section
    worksheet.addRow([]);
    const detailsHeader = worksheet.addRow(['التفصيل:']);
    detailsHeader.font = { bold: true, size: 13 };

    // Income section
    worksheet.addRow([]);
    const incomeHeader = worksheet.addRow(['المداخيل:']);
    incomeHeader.font = { bold: true, size: 12 };

    // Build income description text
    const incomeTexts = income.map((item) => `${item.category} (${item.total.toFixed(3)} د.ت)`);
    const incomeDescription = worksheet.addRow([incomeTexts.join('، ')]);
    worksheet.mergeCells(incomeDescription.number, 1, incomeDescription.number, 3);
    incomeDescription.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    incomeDescription.height = Math.max(30, incomeTexts.length * 15);

    // Expense section with table
    worksheet.addRow([]);
    const expenseHeader = worksheet.addRow(['المصاريف:']);
    expenseHeader.font = { bold: true, size: 12 };

    // Expense table header
    const expenseTableHeader = worksheet.addRow(['البيان', 'المبلغ']);
    expenseTableHeader.font = { bold: true };
    expenseTableHeader.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Expense rows
    expenses.forEach((item) => {
      const row = worksheet.addRow([item.category, item.total.toFixed(3) + ' د.ت']);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Column widths
    worksheet.columns = [{ width: 40 }, { width: 20 }, { width: 15 }];

    applyArabicStyling(worksheet);
    await workbook.xlsx.writeFile(filePath);

    return { success: true, filePath };
  } catch (error) {
    logError('Error generating financial summary:', error);
    throw new Error('فشل في إنشاء التقرير المالي');
  }
}

// ============================================
// REGISTER HANDLERS
// ============================================

function registerFinancialExportHandlers() {
  ipcMain.handle(
    'financial-export:cash-ledger',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(generateCashLedgerReport),
  );

  ipcMain.handle(
    'financial-export:inventory-register',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(generateInventoryRegister),
  );

  ipcMain.handle(
    'financial-export:financial-summary',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(generateFinancialSummary),
  );
}

module.exports = {
  registerFinancialExportHandlers,
};
