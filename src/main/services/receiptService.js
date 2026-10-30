/**
 * @fileoverview Receipt service for generating and managing receipt numbers
 * Provides centralized receipt numbering for all financial operations
 *
 * @author Salim Elhani
 * @version 1.0.0
 */

const db = require('../../db/db');
const { error: logError } = require('../logger');
const { toLocalISODate } = require('../utils/dates');

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
    const result = await db.withTransaction(async () => {
      // Find the active receipt book for the current year and type
      let receiptBook = await db.getQuery(
        `SELECT * FROM receipt_books
       WHERE receipt_type = ? AND strftime('%Y', issued_date) = ? AND status = 'active'
         AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
        [receiptType, currentYear.toString()],
      );

      // If no active book exists for this year, create one
      if (!receiptBook) {
        console.log(`Creating new receipt book for ${receiptType} - ${currentYear}`);

        // Determine the range for this book's receipt numbers
        const existingBooks = await db.allQuery(
          `SELECT MAX(end_receipt_number) as max_number
         FROM receipt_books
         WHERE receipt_type = ? AND strftime('%Y', issued_date) = ?`,
          [receiptType, currentYear.toString()],
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
            toLocalISODate(),
          ],
        );

        receiptBook = await db.getQuery('SELECT * FROM receipt_books WHERE id = ?', [
          bookResult.id,
        ]);
      }

      // Check if the book is exhausted
      if (receiptBook.current_receipt_number >= receiptBook.end_receipt_number) {
        throw new Error(
          `Receipt book ${receiptBook.book_number} is exhausted. Please create a new receipt book.`,
        );
      }

      // Generate the next receipt number
      const nextNumber = receiptBook.current_receipt_number + 1;
      const receiptNumber = `RCP-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;

      // Update the current receipt number in the book
      await db.runQuery('UPDATE receipt_books SET current_receipt_number = ? WHERE id = ?', [
        nextNumber,
        receiptBook.id,
      ]);

      return { receiptBook, receiptNumber };
    });

    return {
      receiptNumber: result.receiptNumber,
      bookId: result.receiptBook.id,
      year: currentYear,
      bookNumber: result.receiptBook.book_number,
      issuedBy,
    };
  } catch (error) {
    logError('Error generating receipt number:', error);
    throw new Error(`Failed to generate receipt number: ${error.message}`);
  }
}

module.exports = {
  generateReceiptNumber,
};
