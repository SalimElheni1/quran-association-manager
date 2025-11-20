/**
 * @fileoverview Centralized translation utilities for backend API responses
 * Maps English database values to Arabic for frontend display consistency
 *
 * @author Quran Branch Manager Team
 * @version 1.0.0
 */

/**
 * Maps English gender values to Arabic
 * @param {string} gender - English gender value from database
 * @returns {string} Arabic gender value for frontend display
 */
function mapGender(gender) {
  const genderMap = {
    Male: 'ذكر',
    Female: 'أنثى',
  };
  return genderMap[gender] || gender;
}

/**
 * Maps English status values to Arabic
 * @param {string} status - English status value from database
 * @returns {string} Arabic status value for frontend display
 */
function mapStatus(status) {
  const statusMap = {
    active: 'نشط',
    inactive: 'غير نشط',
  };
  return statusMap[status] || status;
}

/**
 * Maps English payment method values to Arabic
 * @param {string} method - English payment method from database
 * @returns {string} Arabic payment method for frontend display
 */
function mapPaymentMethod(method) {
  const methodMap = {
    CASH: 'نقدي',
    CHECK: 'شيك',
    TRANSFER: 'تحويل',
  };
  return methodMap[method] || method;
}

/**
 * Maps English transaction type values to Arabic
 * @param {string} type - English transaction type from database (INCOME/EXPENSE)
 * @returns {string} Arabic transaction type for frontend display
 */
function mapTransactionType(type) {
  const typeMap = {
    INCOME: 'مدخول',
    EXPENSE: 'مصروف',
  };
  return typeMap[type] || type;
}

/**
 * Maps English category/group category values to Arabic
 * @param {string} category - English category from database
 * @returns {string} Arabic category for frontend display
 */
function mapCategory(category) {
  const categoryMap = {
    Men: 'رجال',
    Women: 'نساء',
    Kids: 'أطفال',
    men: 'رجال',
    women: 'نساء',
    kids: 'أطفال',
  };
  return categoryMap[category] || category;
}

/**
 * Maps English receipt type values to Arabic
 * @param {string} receiptType - English receipt type from database
 * @returns {string} Arabic receipt type for frontend display
 */
function mapReceiptType(receiptType) {
  const receiptTypeMap = {
    'رسوم الطلاب': 'رسوم الطلاب',
    تبرع: 'تبرع',
    انخراط: 'انخراط',
    نشاط: 'نشاط',
    'Student Fees': 'رسوم الطلاب',
  };
  return receiptTypeMap[receiptType] || receiptType;
}

/**
 * Maps English fee category values to Arabic
 * @param {string} feeCategory - English fee category from database
 * @returns {string} Arabic fee category for frontend display
 */
function mapFeeCategory(feeCategory) {
  const feeCategoryMap = {
    CAN_PAY: 'قادر على الدفع',
    EXEMPT: 'معفى من الدفع',
    SPONSORED: 'مكفول',
  };
  return feeCategoryMap[feeCategory] || feeCategory;
}

/**
 * Applies all translations to a student object
 * @param {Object} student - Student object from database
 * @returns {Object} Student object with translated values
 */
function translateStudent(student) {
  if (!student) return student;

  return {
    ...student,
    gender: mapGender(student.gender),
    status: mapStatus(student.status),
    fee_category: mapFeeCategory(student.fee_category),
  };
}

/**
 * Applies all translations to a user object
 * @param {Object} user - User object from database
 * @returns {Object} User object with translated values
 */
function translateUser(user) {
  if (!user) return user;

  return {
    ...user,
    status: mapStatus(user.status),
  };
}

/**
 * Applies all translations to a transaction object
 * @param {Object} transaction - Transaction object from database
 * @returns {Object} Transaction object with translated values
 */
function translateTransaction(transaction) {
  if (!transaction) return transaction;

  return {
    ...transaction,
    type: mapTransactionType(transaction.type),
    payment_method: mapPaymentMethod(transaction.payment_method),
    receipt_type_display: mapReceiptType(transaction.receipt_type),
  };
}

/**
 * Applies translations to an array of objects with full object mapping functions
 * @param {Array} items - Array of objects to translate
 * @param {Function} translateFn - Translation function to apply to each item
 * @returns {Array} Array of translated objects
 */
function translateArray(items, translateFn) {
  if (!Array.isArray(items)) return items;
  return items.map(translateFn);
}

module.exports = {
  mapGender,
  mapStatus,
  mapPaymentMethod,
  mapTransactionType,
  mapCategory,
  mapFeeCategory,
  mapReceiptType,
  translateStudent,
  translateUser,
  translateTransaction,
  translateArray,
};
