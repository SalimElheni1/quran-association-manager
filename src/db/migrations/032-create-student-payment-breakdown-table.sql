-- Migration 032: Create student_payment_breakdown table
-- This table will link payments to specific charges.

CREATE TABLE IF NOT EXISTS student_payment_breakdown (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_payment_id INTEGER NOT NULL,
  student_fee_charge_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_payment_id) REFERENCES student_payments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_fee_charge_id) REFERENCES student_fee_charges(id) ON DELETE CASCADE
);
