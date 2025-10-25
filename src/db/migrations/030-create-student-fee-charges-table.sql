-- Migration 030: Create student_fee_charges table
-- This table will serve as the ledger for all student fees.

CREATE TABLE IF NOT EXISTS student_fee_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  charge_date DATE NOT NULL,
  due_date DATE,
  fee_type TEXT NOT NULL, -- 'ANNUAL', 'MONTHLY', 'CLASS', 'OTHER'
  description TEXT,
  amount REAL NOT NULL,
  amount_paid REAL DEFAULT 0,
  status TEXT DEFAULT 'UNPAID' CHECK(status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
  academic_year TEXT,
  related_class_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (related_class_id) REFERENCES classes(id) ON DELETE CASCADE
);
