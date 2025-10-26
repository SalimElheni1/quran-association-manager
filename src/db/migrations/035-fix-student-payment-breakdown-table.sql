-- Migration 035: Fix student_payment_breakdown table
-- Ensure the student_fee_charge_id column exists

-- First drop the table if it exists with wrong schema
DROP TABLE IF EXISTS student_payment_breakdown;

-- Recreate with correct schema
CREATE TABLE student_payment_breakdown (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_payment_id INTEGER NOT NULL,
  student_fee_charge_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_payment_id) REFERENCES student_payments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_fee_charge_id) REFERENCES student_fee_charges(id) ON DELETE CASCADE
);
