const { dialog } = require('electron');
const ExcelJS = require('exceljs');
const db = require('../../db/db');
const { error: logError } = require('../logger');

function formatDateDDMMYYYY(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

async function generateInventoryLedger(event) {
  try {
    const inventory = await db.allQuery('SELECT * FROM inventory_items ORDER BY category, item_name');
    
    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ سجل الجرد',
      defaultPath: `سجل-الجرد-${new Date().toISOString().split('T')[0]}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });
    
    if (!filePath) return { cancelled: true };
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('سجل الجرد');
    worksheet.pageSetup = { 
      orientation: 'landscape', 
      fitToPage: true, 
      fitToWidth: 1, 
      fitToHeight: 0 
    };
    worksheet.views = [{ rightToLeft: true }];
    
    // Headers
    const headerRow = worksheet.addRow(['الأصول الملموسة', 'التسمية', 'تاريخ الإقتناء', 'تكلفة الوحدة', 'الكمية', 'القيمة', 'الملاحظات']);
    headerRow.font = { name: 'Traditional Arabic', size: 12, bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'} };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Freeze panes
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, rightToLeft: true }];
    
    // Group by category
    const grouped = {};
    inventory.forEach(item => {
      const cat = item.category || 'غير مصنف';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    
    // Data rows
    Object.keys(grouped).forEach(category => {
      const items = grouped[category];
      const startRow = worksheet.lastRow.number + 1;
      
      items.forEach((item, idx) => {
        const unitCost = Math.round(item.unit_value || 0);
        const qty = item.quantity || 0;
        const value = unitCost * qty;
        
        const row = worksheet.addRow([
          idx === 0 ? category : '',
          item.item_name || '-',
          formatDateDDMMYYYY(item.acquisition_date),
          unitCost,
          qty,
          value,
          item.notes || '-'
        ]);
        
        row.font = { name: 'Traditional Arabic', size: 12 };
        row.eachCell((cell, colNum) => {
          cell.border = { top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'} };
          
          if (colNum === 1) {
            cell.font = { name: 'Traditional Arabic', size: 12, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colNum === 2 || colNum === 7) {
            cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
          } else if (colNum === 3) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colNum >= 4 && colNum <= 6) {
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });
      });
      
      // Merge category cells
      if (items.length > 1) {
        worksheet.mergeCells(startRow, 1, startRow + items.length - 1, 1);
      }
    });
    
    // Column widths
    worksheet.columns = [
      { width: 20 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 30 }
    ];
    
    await workbook.xlsx.writeFile(filePath);
    return { success: true, filePath };
  } catch (error) {
    logError('Error generating inventory ledger:', error);
    throw new Error('فشل في إنشاء سجل الجرد');
  }
}

module.exports = { generateInventoryLedger };
