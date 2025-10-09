// @fileoverview Import configuration for Excel data import
// Only contains sheet definitions - no step logic since we use single-step import

/**
 * Available sheets for Excel import
 * Users can select any combination of these sheets
 */
const AVAILABLE_SHEETS = [
  {
    name: 'المستخدمون', // Users
    requiredColumns: ['اسم المستخدم', 'الاسم الأول', 'اللقب', 'الدور', 'نوع التوظيف'],
  },
  {
    name: 'المعلمون', // Teachers
    requiredColumns: ['الاسم واللقب'],
  },
  {
    name: 'الطلاب', // Students
    requiredColumns: ['الاسم واللقب'],
  },
  {
    name: 'الفصول', // Classes
    requiredColumns: ['اسم الفصل', 'معرف المعلم'],
  },
  {
    name: 'العمليات المالية', // Financial Transactions
    requiredColumns: ['النوع', 'الفئة', 'المبلغ', 'التاريخ', 'طريقة الدفع'],
  },
  {
    name: 'الحضور', // Attendance
    requiredColumns: ['الرقم التعريفي للطالب', 'اسم الفصل', 'التاريخ', 'الحالة'],
  },
  {
    name: 'المجموعات', // Groups
    requiredColumns: ['اسم المجموعة', 'الفئة'],
  },
  {
    name: 'المخزون', // Inventory
    requiredColumns: ['اسم العنصر', 'الفئة', 'الكمية', 'قيمة الوحدة'],
  },
];

/**
 * Get all available sheet names for import
 * @returns {string[]} Array of all available sheet names
 */
function getAvailableSheets() {
  return AVAILABLE_SHEETS.map((sheet) => sheet.name);
}

/**
 * Get sheet configuration by name
 * @param {string} sheetName - Name of the sheet
 * @returns {Object|null} Sheet configuration object with required columns
 */
function getSheetInfo(sheetName) {
  return AVAILABLE_SHEETS.find((sheet) => sheet.name === sheetName) || null;
}

/**
 * Check if a sheet is available for import
 * @param {string} sheetName - Name of the sheet
 * @returns {boolean} True if sheet is available
 */
function isSheetAvailable(sheetName) {
  return AVAILABLE_SHEETS.some((sheet) => sheet.name === sheetName);
}

/**
 * Get all available sheets with their configuration
 * @returns {Object[]} Array of all sheet objects
 */
function getAllSheets() {
  return AVAILABLE_SHEETS;
}

module.exports = {
  AVAILABLE_SHEETS,
  getAvailableSheets,
  getSheetInfo,
  getAllSheets,
  isSheetAvailable,
};
