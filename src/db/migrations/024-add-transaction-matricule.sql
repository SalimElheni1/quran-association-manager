-- Migration: Add matricule to transactions
-- Description: Add auto-generated reference number for transactions

ALTER TABLE transactions ADD COLUMN matricule TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_matricule ON transactions(matricule);
