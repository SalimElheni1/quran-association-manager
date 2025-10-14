-- Migration: Fix voucher_number unique constraint
-- Description: Allow same voucher_number for different transaction types (INCOME vs EXPENSE)

-- SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
-- Step 1: Create new table with correct constraint
CREATE TABLE IF NOT EXISTS transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date DATE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  payment_method TEXT CHECK(payment_method IN ('CASH', 'CHECK', 'TRANSFER')),
  check_number TEXT,
  voucher_number TEXT,
  related_entity_type TEXT,
  related_entity_id INTEGER,
  related_person_name TEXT,
  account_id INTEGER NOT NULL,
  requires_dual_signature INTEGER DEFAULT 0,
  receipt_type TEXT,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  UNIQUE(voucher_number, type)
);

-- Step 2: Copy data from old table
INSERT INTO transactions_new (
  id, transaction_date, type, category, amount, description,
  payment_method, check_number, voucher_number, related_entity_type,
  related_entity_id, related_person_name, account_id, requires_dual_signature,
  receipt_type, created_by_user_id, created_at, updated_at
)
SELECT 
  id, transaction_date, type, category, amount, description,
  payment_method, check_number, voucher_number, related_entity_type,
  related_entity_id, related_person_name, account_id, requires_dual_signature,
  receipt_type, created_by_user_id, created_at, updated_at
FROM transactions;

-- Step 3: Drop old table
DROP TABLE transactions;

-- Step 4: Rename new table
ALTER TABLE transactions_new RENAME TO transactions;
