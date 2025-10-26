/**
 * @fileoverview Receipt service for generating and managing receipt numbers
 * Provides centralized receipt numbering for all financial operations
 *
 * @author Quran Branch Manager Team
 * @version 1.0.0
 */

const db = require('../../db/db');
const { error: logError } = require('../logger');

/**
 * Receipt number format: RCP-{year}-{sequential_number}
 * Example: RCP-2025-0001, RCP-2025-0002, etc.
 */

/**
 * Generates the next available receipt number for the current year.
 *
 * @param {string} receiptType - Type of receipt ('fee_payment', 'donation', etc.)
 * @param {number} [issuedBy=null] - User ID who issued the receipt
 * @returns {Promise<{receiptNumber: string, bookId: number, year: number}>}
 */
async function generateReceiptNumber(receiptType = 'fee_payment', issuedBy = null) {
  const currentYear = new Date().getFullYear();

  try {
    await db.runQuery('BEGIN TRANSACTION;');

    // Find the active receipt book for the current year and type
    let receiptBook = await db.getQuery(
      `SELECT * FROM receipt_books
       WHERE receipt_type = ? AND strftime('%Y', issued_date) = ? AND status = 'active'
       ORDER BY id DESC LIMIT 1`,
      [receiptType, currentYear.toString()]
    );

    // If no active book exists for this year, create one
    if (!receiptBook) {
      console.log(`Creating new receipt book for ${receiptType} - ${currentYear}`);

      // Determine the range for this book's receipt numbers
      const existingBooks = await db.allQuery(
        `SELECT MAX(end_receipt_number) as max_number
         FROM receipt_books
         WHERE receipt_type = ? AND strftime('%Y', issued_date) = ?`,
        [receiptType, currentYear.toString()]
      );

      const startNumber = (existingBooks[0]?.max_number || 0) + 1;
      const endNumber = startNumber + 999; // Allow 1000 receipts per book

      const bookResult = await db.runQuery(
        `INSERT INTO receipt_books
         (book_number, start_receipt_number, end_receipt_number, current_receipt_number, receipt_type, status, issued_date)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [
          `BK-${receiptType.toUpperCase()}-${currentYear}`,
          startNumber,
          endNumber,
          startNumber - 1, // Will be incremented when first used
          receiptType,
          new Date().toISOString().split('T')[0]
        ]
      );

      receiptBook = await db.getQuery('SELECT * FROM receipt_books WHERE id = ?', [bookResult.id]);
    }

    // Check if the book is exhausted
    if (receiptBook.current_receipt_number >= receiptBook.end_receipt_number) {
      throw new Error(`Receipt book ${receiptBook.book_number} is exhausted. Please create a new receipt book.`);
    }

    // Generate the next receipt number
    const nextNumber = receiptBook.current_receipt_number + 1;
    const receiptNumber = `RCP-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;

    // Update the current receipt number in the book
    await db.runQuery(
      'UPDATE receipt_books SET current_receipt_number = ? WHERE id = ?',
      [nextNumber, receiptBook.id]
    );

    await db.runQuery('COMMIT;');

    return {
      receiptNumber,
      bookId: receiptBook.id,
      year: currentYear,
      bookNumber: receiptBook.book_number,
      issuedBy
    };

  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('Error generating receipt number:', error);
    throw new Error(`Failed to generate receipt number: ${error.message}`);
  }
}

/**
 * Validates a receipt number format.
 *
 * @param {string} receiptNumber - The receipt number to validate
 * @returns {boolean} True if the format is valid
 */
function validateReceiptNumber(receiptNumber) {
  const pattern = /^RCP-\d{4}-\d{4}$/;
  return pattern.test(receiptNumber);
}

/**
 * Gets receipt book statistics for monitoring.
 *
 * @param {string} year - Optional year to filter by
 * @returns {Promise<Array>} Array of receipt book summaries
 */
async function getReceiptBookStats(year = null) {
  try {
    const yearFilter = year ? `AND strftime('%Y', issued_date) = '${year}'` : '';

    const books = await db.allQuery(`
      SELECT
        book_number,
        receipt_type,
        start_receipt_number,
        end_receipt_number,
        current_receipt_number,
        status,
        issued_date,
        (current_receipt_number - start_receipt_number + 1) as used_count,
        (end_receipt_number - current_receipt_number) as remaining_count
      FROM receipt_books
      WHERE 1=1 ${yearFilter}
      ORDER BY issued_date DESC
    `);

    return books.map(book => ({
      ...book,
      totalNumbers: book.end_receipt_number - book.start_receipt_number + 1,
      utilizationPercent: ((book.used_count / (book.end_receipt_number - book.start_receipt_number + 1)) * 100).toFixed(1)
    }));

  } catch (error) {
    logError('Error getting receipt book stats:', error);
    throw new Error('Failed to get receipt book statistics.');
  }
}

/**
 * Marks a receipt book as completed (when it reaches its limit).
 *
 * @param {number} bookId - The ID of the receipt book to complete
 * @returns {Promise<boolean>} True if successful
 */
async function completeReceiptBook(bookId) {
  try {
    const result = await db.runQuery(
      "UPDATE receipt_books SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [bookId]
    );

    return result.changes > 0;
  } catch (error) {
    logError('Error completing receipt book:', error);
    throw new Error('Failed to complete receipt book.');
  }
}

/**
 * Creates a receipt book manually (for administrative control).
 *
 * @param {object} bookData - Receipt book details
 * @param {string} bookData.receiptType - Type of receipts
 * @param {number} bookData.startNumber - Starting receipt number
 * @param {number} bookData.endNumber - Ending receipt number
 * @returns {Promise<object>} Created receipt book details
 */
async function createReceiptBook(bookData) {
  const { receiptType, startNumber, endNumber } = bookData;
  const currentYear = new Date().getFullYear();

  try {
    await db.runQuery('BEGIN TRANSACTION;');

    // Check for overlapping ranges
    const overlapCheck = await db.getQuery(
      `SELECT id FROM receipt_books
       WHERE receipt_type = ?
       AND strftime('%Y', issued_date) = ?
       AND (
         (? BETWEEN start_receipt_number AND end_receipt_number) OR
         (? BETWEEN start_receipt_number AND end_receipt_number) OR
         (start_receipt_number BETWEEN ? AND ?)
       )`,
      [receiptType, currentYear.toString(), startNumber, endNumber, startNumber, endNumber]
    );

    if (overlapCheck) {
      throw new Error('Receipt number range overlaps with an existing book.');
    }

    const result = await db.runQuery(
      `INSERT INTO receipt_books
       (book_number, start_receipt_number, end_receipt_number, current_receipt_number, receipt_type, status, issued_date)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [
        `BK-${receiptType.toUpperCase()}-${currentYear}-${Date.now()}`,
        startNumber,
        endNumber,
        startNumber - 1, // Will be incremented when first used
        receiptType,
        new Date().toISOString().split('T')[0]
      ]
    );

    await db.runQuery('COMMIT;');

    return {
      id: result.id,
      bookNumber: `BK-${receiptType.toUpperCase()}-${currentYear}-${Date.now()}`,
      receiptType,
      startNumber,
      endNumber
    };

  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('Error creating receipt book:', error);
    throw new Error(`Failed to create receipt book: ${error.message}`);
  }
}

module.exports = {
  generateReceiptNumber,
  validateReceiptNumber,
  getReceiptBookStats,
  completeReceiptBook,
  createReceiptBook
};
