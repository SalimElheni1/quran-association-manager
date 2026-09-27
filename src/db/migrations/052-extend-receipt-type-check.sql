-- Migration: Extend receipt_books.receipt_type CHECK to include 'fee_payment'
-- Description: receiptService.generateReceiptNumber defaults to 'fee_payment' and auto-creates
-- a receipt book with that type when none is active (studentFeeHandlers.js 'receipts:generate').
-- The 017 CHECK only allows ('payment','donation','expense','salary'), so that INSERT violates
-- the CHECK and throws. SQLite cannot ALTER a CHECK constraint, so rebuild the table.
-- Note: the migration runner disables foreign_keys around this migration because
-- payments/donations/expenses/salaries reference receipt_books(id); child references
-- are by name and still point at the rebuilt table after the rename.

-- Step 1: Create new table with the extended CHECK
CREATE TABLE IF NOT EXISTS receipt_books_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_number TEXT UNIQUE NOT NULL,
    start_receipt_number INTEGER NOT NULL,
    end_receipt_number INTEGER NOT NULL,
    current_receipt_number INTEGER NOT NULL,
    receipt_type TEXT NOT NULL CHECK(receipt_type IN ('payment', 'donation', 'expense', 'salary', 'fee_payment')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
    issued_date DATE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data from old table
INSERT INTO receipt_books_new (
  id, book_number, start_receipt_number, end_receipt_number, current_receipt_number,
  receipt_type, status, issued_date, notes, created_at, updated_at
)
SELECT
  id, book_number, start_receipt_number, end_receipt_number, current_receipt_number,
  receipt_type, status, issued_date, notes, created_at, updated_at
FROM receipt_books;

-- Step 3: Drop old table
DROP TABLE receipt_books;

-- Step 4: Rename new table
ALTER TABLE receipt_books_new RENAME TO receipt_books;

-- Step 5: Recreate the index that was dropped with the old table
CREATE INDEX IF NOT EXISTS idx_receipt_books_status ON receipt_books(status);
