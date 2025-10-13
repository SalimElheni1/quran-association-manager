const { ipcMain } = require('electron');
const { allQuery, runQuery, getQuery } = require('../../db/db');
const { error: logError } = require('../logger');

function createHandler(handler) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      logError(`Error in handler ${handler.name}:`, err.message);
      throw new Error(err.message || 'An unexpected error occurred.');
    }
  };
}

// Get all receipt books
async function handleGetReceiptBooks(event, filters = {}) {
  let query = 'SELECT * FROM receipt_books WHERE 1=1';
  const params = [];

  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.receipt_type) {
    query += ' AND receipt_type = ?';
    params.push(filters.receipt_type);
  }

  query += ' ORDER BY issued_date DESC';
  return allQuery(query, params);
}

// Get active receipt book for a specific type
async function handleGetActiveReceiptBook(event, receiptType) {
  return getQuery(
    'SELECT * FROM receipt_books WHERE receipt_type = ? AND status = ? ORDER BY issued_date DESC LIMIT 1',
    [receiptType, 'active'],
  );
}

// Add new receipt book
async function handleAddReceiptBook(event, book) {
  const {
    book_number,
    start_receipt_number,
    end_receipt_number,
    receipt_type,
    issued_date,
    notes,
  } = book;

  const sql = `INSERT INTO receipt_books (book_number, start_receipt_number, end_receipt_number, current_receipt_number, receipt_type, issued_date, notes) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

  const result = await runQuery(sql, [
    book_number,
    start_receipt_number,
    end_receipt_number,
    start_receipt_number,
    receipt_type,
    issued_date,
    notes,
  ]);

  return getQuery('SELECT * FROM receipt_books WHERE id = ?', [result.id]);
}

// Update receipt book
async function handleUpdateReceiptBook(event, book) {
  const {
    id,
    book_number,
    start_receipt_number,
    end_receipt_number,
    receipt_type,
    issued_date,
    notes,
    status,
  } = book;

  const sql = `UPDATE receipt_books SET book_number = ?, start_receipt_number = ?, end_receipt_number = ?, 
               receipt_type = ?, issued_date = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
               WHERE id = ?`;

  await runQuery(sql, [
    book_number,
    start_receipt_number,
    end_receipt_number,
    receipt_type,
    issued_date,
    notes,
    status,
    id,
  ]);
  return getQuery('SELECT * FROM receipt_books WHERE id = ?', [id]);
}

// Delete receipt book
async function handleDeleteReceiptBook(event, bookId) {
  await runQuery('DELETE FROM receipt_books WHERE id = ?', [bookId]);
  return { id: bookId };
}

// Get next receipt number for a type
async function handleGetNextReceiptNumber(event, receiptType) {
  const book = await handleGetActiveReceiptBook(event, receiptType);

  if (!book) {
    return { error: 'No active receipt book found for this type' };
  }

  if (book.current_receipt_number > book.end_receipt_number) {
    return { error: 'Receipt book is full. Please create a new book.' };
  }

  const nextNumber = book.current_receipt_number;

  // Increment current receipt number
  await runQuery(
    'UPDATE receipt_books SET current_receipt_number = current_receipt_number + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [book.id],
  );

  // Check if book is now completed
  if (nextNumber === book.end_receipt_number) {
    await runQuery('UPDATE receipt_books SET status = ? WHERE id = ?', ['completed', book.id]);
  }

  return {
    receipt_number: `${book.book_number}-${nextNumber.toString().padStart(4, '0')}`,
    book_id: book.id,
    book_number: book.book_number,
  };
}

// Check if receipt number exists
async function handleCheckReceiptExists(event, { receiptNumber, transactionType, excludeId }) {
  let table;
  switch (transactionType) {
    case 'payment':
      table = 'payments';
      break;
    case 'donation':
      table = 'donations';
      break;
    case 'expense':
      table = 'expenses';
      break;
    case 'salary':
      table = 'salaries';
      break;
    default:
      return { exists: false };
  }

  let sql = `SELECT id FROM ${table} WHERE receipt_number = ?`;
  const params = [receiptNumber];

  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }

  const result = await getQuery(sql, params);
  return { exists: !!result };
}

function registerReceiptHandlers() {
  ipcMain.handle('receipt-books:get', createHandler(handleGetReceiptBooks));
  ipcMain.handle('receipt-books:get-active', createHandler(handleGetActiveReceiptBook));
  ipcMain.handle('receipt-books:add', createHandler(handleAddReceiptBook));
  ipcMain.handle('receipt-books:update', createHandler(handleUpdateReceiptBook));
  ipcMain.handle('receipt-books:delete', createHandler(handleDeleteReceiptBook));
  ipcMain.handle('receipt-books:get-next-number', createHandler(handleGetNextReceiptNumber));
  ipcMain.handle('receipt-books:check-exists', createHandler(handleCheckReceiptExists));
}

module.exports = {
  registerReceiptHandlers,
  handleGetReceiptBooks,
  handleGetActiveReceiptBook,
  handleAddReceiptBook,
  handleUpdateReceiptBook,
  handleDeleteReceiptBook,
  handleGetNextReceiptNumber,
  handleCheckReceiptExists,
};
