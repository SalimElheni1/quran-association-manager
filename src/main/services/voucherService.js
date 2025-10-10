/**
 * @fileoverview Voucher number generation service for financial transactions
 * @author Quran Branch Manager Team
 * @version 2.0.0
 */

const db = require('../db/db');
const { error: logError } = require('./logger');

/**
 * Generates a unique voucher number for financial transactions
 * Format: R-2024-0001 (Receipt) or P-2024-0045 (Payment)
 * 
 * @param {string} type - Transaction type ('INCOME' or 'EXPENSE')
 * @param {number} year - Fiscal year for the voucher
 * @returns {Promise<string>} Generated voucher number
 */
async function generateVoucherNumber(type, year) {
  try {
    const prefix = type === 'INCOME' ? 'R' : 'P';
    const pattern = `${prefix}-${year}-%`;
    
    // Get all vouchers for this type and year
    const vouchers = await db.allQuery(
      `SELECT voucher_number FROM transactions 
       WHERE voucher_number LIKE ? 
       ORDER BY voucher_number DESC`,
      [pattern]
    );

    let nextNumber = 1;
    if (vouchers && vouchers.length > 0) {
      // Extract all numbers and find the max
      const numbers = vouchers
        .map(v => {
          const match = v.voucher_number.match(/-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);
      
      if (numbers.length > 0) {
        nextNumber = Math.max(...numbers) + 1;
      }
    }

    return `${prefix}-${year}-${String(nextNumber).padStart(4, '0')}`;
  } catch (error) {
    logError('Error generating voucher number:', error);
    throw new Error('فشل في توليد رقم الوصل');
  }
}

module.exports = { generateVoucherNumber };
