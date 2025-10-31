-- Migration 031: Create student_payments table
-- This table will store all student payments.

CREATE TABLE IF NOT EXISTS student_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  payment_method TEXT,
  payment_type TEXT,
  academic_year TEXT,
  notes TEXT,
  check_number TEXT,
  receipt_number TEXT,
  class_id TEXT, -- Class matricule for SPECIAL payments
  transaction_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);
