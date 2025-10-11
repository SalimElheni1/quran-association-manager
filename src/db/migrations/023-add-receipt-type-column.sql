-- Migration: Add receipt_type column to transactions
-- Description: Store receipt type for income transactions

ALTER TABLE transactions ADD COLUMN receipt_type TEXT;
