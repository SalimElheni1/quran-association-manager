-- Migration: Create receipt management system

-- Table for receipt books
CREATE TABLE IF NOT EXISTS receipt_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_number TEXT UNIQUE NOT NULL,
    start_receipt_number INTEGER NOT NULL,
    end_receipt_number INTEGER NOT NULL,
    current_receipt_number INTEGER NOT NULL,
    receipt_type TEXT NOT NULL CHECK(receipt_type IN ('payment', 'donation', 'expense', 'salary')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
    issued_date DATE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add receipt fields to payments table
ALTER TABLE payments ADD COLUMN receipt_number TEXT;
ALTER TABLE payments ADD COLUMN receipt_book_id INTEGER REFERENCES receipt_books(id);
ALTER TABLE payments ADD COLUMN receipt_issued_by INTEGER REFERENCES users(id);
ALTER TABLE payments ADD COLUMN receipt_issued_date DATETIME;

-- Add receipt fields to donations table
ALTER TABLE donations ADD COLUMN receipt_number TEXT;
ALTER TABLE donations ADD COLUMN receipt_book_id INTEGER REFERENCES receipt_books(id);
ALTER TABLE donations ADD COLUMN receipt_issued_by INTEGER REFERENCES users(id);
ALTER TABLE donations ADD COLUMN receipt_issued_date DATETIME;

-- Add receipt fields to expenses table
ALTER TABLE expenses ADD COLUMN receipt_number TEXT;
ALTER TABLE expenses ADD COLUMN receipt_book_id INTEGER REFERENCES receipt_books(id);
ALTER TABLE expenses ADD COLUMN receipt_issued_by INTEGER REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN receipt_issued_date DATETIME;

-- Add receipt fields to salaries table
ALTER TABLE salaries ADD COLUMN receipt_number TEXT;
ALTER TABLE salaries ADD COLUMN receipt_book_id INTEGER REFERENCES receipt_books(id);
ALTER TABLE salaries ADD COLUMN receipt_issued_by INTEGER REFERENCES users(id);
ALTER TABLE salaries ADD COLUMN receipt_issued_date DATETIME;

-- Create index for faster receipt lookups
CREATE INDEX IF NOT EXISTS idx_payments_receipt ON payments(receipt_number);
CREATE INDEX IF NOT EXISTS idx_donations_receipt ON donations(receipt_number);
CREATE INDEX IF NOT EXISTS idx_expenses_receipt ON expenses(receipt_number);
CREATE INDEX IF NOT EXISTS idx_salaries_receipt ON salaries(receipt_number);
CREATE INDEX IF NOT EXISTS idx_receipt_books_status ON receipt_books(status);
