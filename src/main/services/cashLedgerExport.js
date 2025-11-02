const { dialog } = require('electron');
const ExcelJS = require('exceljs');
const db = require('../../db/db');
const { error: logError } = require('../logger');

async function getStartingBalance(startDate) {
  const cumulative = await db.getQuery(
    `SELECT 
      SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as total_expense
     FROM transactions 
     WHERE transaction_date < ?`,
    [startDate]
  );
  const account = await db.getQuery('SELECT initial_balance FROM accounts WHERE id = 1');
  const initialBalance = account?.initial_balance || 0;
  return initialBalance + (cumulative.total_income || 0) - (cumulative.total_expense || 0);
}

function formatDateDDMMYYYY(dateStr) {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function localizeLibelle(text) {
  if (!text || text === 'undefined' || text === 'null') return '-';
  const map = {
    'Student Fees': 'رسوم الطلبة',
    'ANNUAL': 'رسوم الطلبة',
    'MONTHLY': 'رسوم الطلبة',
    'CASH': 'نقدي',
    'Bank Transfer': 'تحويل بنكي',
    'Donation': 'تبرع',
    'Expense': 'مصروف',
    'Salary': 'راتب',
    'Student Fee': 'رسم طالب',
    'التبرعات النقدية': 'التبرعات النقدية',
    'التبرعات العينية': 'التبرعات العينية',
    'رواتب ومكافآت': 'رواتب ومكافآت',
    'مصاريف إدارية': 'مصاريف إدارية',
    'صيانة وتصليح': 'صيانة وتصليح',
    'شراء أصول': 'شراء أصول',
    'فواتير': 'فواتير',
    'مساعدات اجتماعية': 'مساعدات اجتماعية',
    'مصاريف متنوعة': 'مصاريف متنوعة',
  };
  return map[text] || text;
}

async function generateCashLedgerReport(event, { period }) {
  try {
    const { startDate, endDate } = period;
    const transactions = await db.allQuery(
      `SELECT * FROM transactions WHERE transaction_date BETWEEN ? AND ? AND category != 'التبرعات العينية' ORDER BY transaction_date ASC, id ASC`,
      [startDate, endDate]
    );
    const startingBalance = await getStartingBalance(startDate);

    const arabicMonths = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const startDateObj = new Date(startDate);
    const monthYear = `${arabicMonths[startDateObj.getMonth()]} ${startDateObj.getFullYear()}`;

    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ سجل المحاسبة',
      defaultPath: `سجل-المحاسبة-${monthYear}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!filePath) return { cancelled: true };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(monthYear, {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        margins: {
          left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3
        },
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        verticalCentered: true,
      },
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 6 }]
    });
    
    // Default font
    worksheet.eachRow((row) => {
        row.font = { name: 'Traditional Arabic', size: 12 };
    });

    // Title
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = monthYear;
    titleCell.font = { name: 'Traditional Arabic', size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Opening balance table
    worksheet.mergeCells('F2:G2');
    const openingLabelCell = worksheet.getCell('G2');
    openingLabelCell.value = 'الرصيد بداية الشهر';
    openingLabelCell.font = { name: 'Traditional Arabic', size: 12, bold: true };
    openingLabelCell.alignment = { horizontal: 'center' };
    openingLabelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    const openCashRow = worksheet.getRow(3);
    openCashRow.getCell('F').value = 'السيولة';
    openCashRow.getCell('G').value = startingBalance;
    const openBankRow = worksheet.getRow(4);
    openBankRow.getCell('F').value = 'الرصيد البنكي';
    openBankRow.getCell('G').value = 0;
    const openTotalRow = worksheet.getRow(5);
    openTotalRow.getCell('F').value = 'المجموع';
    openTotalRow.getCell('G').value = startingBalance;

    [openCashRow, openBankRow, openTotalRow].forEach((row) => {
        row.getCell('F').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        row.getCell('G').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        row.getCell('G').numFmt = '#,##0';
        row.getCell('G').alignment = { horizontal: 'right' };
        row.getCell('F').font = { name: 'Traditional Arabic', size: 12, bold: false };
        row.getCell('G').font = { name: 'Traditional Arabic', size: 12, bold: true };
    });


    // Main table headers
    const headerRow = worksheet.getRow(6);
    headerRow.values = ['رقم التسلسل', 'التاريخ', 'البيان', 'مداخيل', 'مصاريف', 'الرصيد', 'وثيقة الإثبات'];
    headerRow.font = { name: 'Traditional Arabic', size: 14, bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Group transactions
    const groupedTransactions = transactions.reduce((acc, t) => {
      const libelle = localizeLibelle(t.receipt_type || t.category || t.description);
      const key = `${t.transaction_date}|${libelle}|${t.type}`;
      if (!acc[key]) {
        acc[key] = {
          date: t.transaction_date,
          libelle: libelle,
          type: t.type,
          amount: 0,
          vouchers: []
        };
      }
      acc[key].amount += t.amount || 0;
      const reference = t.voucher_number || t.receipt_number || t.check_number;
      if (reference) {
        acc[key].vouchers.push(reference);
      }
      return acc;
    }, {});

    // Data rows
    let runningBalance = startingBalance;
    let rowNumber = 1;
    Object.values(groupedTransactions).forEach((group, index) => {
      const isIncome = group.type === 'INCOME';
      runningBalance += isIncome ? group.amount : -group.amount;

      let voucherText = '-';
      if (group.vouchers.length > 0) {
        const sortedVouchers = group.vouchers.map(v => parseInt(v, 10)).sort((a, b) => a - b);
        const min = sortedVouchers[0];
        const max = sortedVouchers[sortedVouchers.length - 1];
        const isConsecutive = sortedVouchers.every((v, i) => i === 0 || v === sortedVouchers[i-1] + 1);

        const prefix = isIncome ? 'وصل إستلام أموال' : 'إذن بالدفع';

        if (sortedVouchers.length > 1 && isConsecutive) {
          voucherText = `${prefix} من عدد :${String(min).padStart(3, '0')} إلى عدد ${String(max).padStart(3, '0')}`;
        } else if (sortedVouchers.length > 0) {
            voucherText = `${prefix} عدد ${group.vouchers.join(', ')}`;
        }
      }
      
      if (index < 10) {
        console.log(`Row ${index + 1}: Type=${group.type}, Libelle=${group.libelle}, Vouchers=${group.vouchers.join(', ')}`);
      }

      const row = worksheet.addRow([
        rowNumber++,
        formatDateDDMMYYYY(group.date),
        group.libelle,
        isIncome ? group.amount : '',
        !isIncome ? group.amount : '',
        runningBalance,
        voucherText
      ]);

      row.eachCell((cell, colNum) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.font = { name: 'Traditional Arabic', size: 12 };
        
        if (colNum === 2) { // Date
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 3 || colNum === 7) { // Libelle, Voucher
          cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
        } else if (colNum >= 4 && colNum <= 6) { // Income, Expense, Balance
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    });

    // Footer
    const closingRowIndex = worksheet.lastRow.number + 2;
    worksheet.mergeCells(`F${closingRowIndex}:G${closingRowIndex}`);
    const closingLabelCell = worksheet.getCell(`G${closingRowIndex}`);
    closingLabelCell.value = `> إلى ${formatDateDDMMYYYY(endDate)}`;
    closingLabelCell.font = { name: 'Traditional Arabic', size: 12, bold: true };
    closingLabelCell.alignment = { horizontal: 'center' };
    closingLabelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    const closeCashRow = worksheet.getRow(closingRowIndex + 1);
    closeCashRow.getCell('F').value = 'السيولة';
    closeCashRow.getCell('G').value = runningBalance;
    const closeBankRow = worksheet.getRow(closingRowIndex + 2);
    closeBankRow.getCell('F').value = 'الرصيد البنكي';
    closeBankRow.getCell('G').value = 0;
    const closeTotalRow = worksheet.getRow(closingRowIndex + 3);
    closeTotalRow.getCell('F').value = 'المجموع';
    closeTotalRow.getCell('G').value = runningBalance;

    [closeCashRow, closeBankRow, closeTotalRow].forEach((row) => {
        row.getCell('F').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        row.getCell('G').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        row.getCell('G').numFmt = '#,##0';
        row.getCell('G').alignment = { horizontal: 'right' };
        row.getCell('F').font = { name: 'Traditional Arabic', size: 12, bold: false };
        row.getCell('G').font = { name: 'Traditional Arabic', size: 12, bold: true };
    });

    // Column widths
    worksheet.columns = [
      { width: 10 }, { width: 14 }, { width: 40 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 30 }
    ];

    await workbook.xlsx.writeFile(filePath);
    return { success: true, filePath };
  } catch (error) {
    logError('Error generating cash ledger:', error);
    throw new Error('فشل في إنشاء سجل المحاسبة');
  }
}

module.exports = { generateCashLedgerReport };
