-- Migration 061: soft delete for records, void for money
--
-- Deleting a student, teacher, class, user, group, inventory item, in-kind category or receipt
-- book now marks it (deleted_at / deleted_by) instead of removing it, so the payments,
-- transactions, charges and attendance that point at it stay for reports and history. Deleted
-- records are left out of lists, pickers and anything done from then on, and can be restored.
--
-- Money is never removed either: deleting a transaction or a student payment voids it
-- (voided_at / voided_by). A voided row stays visible in history but no longer counts in
-- totals, balances or reports. A deleted student's unpaid charges are cancelled
-- (cancelled_at), which a restore of the student undoes.

ALTER TABLE students ADD COLUMN deleted_at TEXT;
ALTER TABLE students ADD COLUMN deleted_by INTEGER;
ALTER TABLE teachers ADD COLUMN deleted_at TEXT;
ALTER TABLE teachers ADD COLUMN deleted_by INTEGER;
ALTER TABLE classes ADD COLUMN deleted_at TEXT;
ALTER TABLE classes ADD COLUMN deleted_by INTEGER;
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN deleted_by INTEGER;
ALTER TABLE groups ADD COLUMN deleted_at TEXT;
ALTER TABLE groups ADD COLUMN deleted_by INTEGER;
ALTER TABLE inventory_items ADD COLUMN deleted_at TEXT;
ALTER TABLE inventory_items ADD COLUMN deleted_by INTEGER;
ALTER TABLE in_kind_categories ADD COLUMN deleted_at TEXT;
ALTER TABLE in_kind_categories ADD COLUMN deleted_by INTEGER;
ALTER TABLE receipt_books ADD COLUMN deleted_at TEXT;
ALTER TABLE receipt_books ADD COLUMN deleted_by INTEGER;

ALTER TABLE student_payments ADD COLUMN voided_at TEXT;
ALTER TABLE student_payments ADD COLUMN voided_by INTEGER;
ALTER TABLE student_fee_charges ADD COLUMN cancelled_at TEXT;

-- transactions: add the void columns, and let a voided row keep its voucher number while a
-- corrected transaction reuses it. The table-level UNIQUE(voucher_number, type) can't be
-- dropped in SQLite, so the table is rebuilt (as 024 did) and uniqueness moves to a partial
-- index over the rows that are not voided.
CREATE TABLE transactions_new (
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
  matricule TEXT,
  receipt_number TEXT,
  voided_at TEXT,
  voided_by INTEGER
);

INSERT INTO transactions_new (
  id, transaction_date, type, category, amount, description, payment_method, check_number,
  voucher_number, related_entity_type, related_entity_id, related_person_name, account_id,
  requires_dual_signature, receipt_type, created_by_user_id, created_at, updated_at, matricule,
  receipt_number
)
SELECT
  id, transaction_date, type, category, amount, description, payment_method, check_number,
  voucher_number, related_entity_type, related_entity_id, related_person_name, account_id,
  requires_dual_signature, receipt_type, created_by_user_id, created_at, updated_at, matricule,
  receipt_number
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_matricule ON transactions(matricule);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_voucher_active
  ON transactions(voucher_number, type) WHERE voided_at IS NULL;
