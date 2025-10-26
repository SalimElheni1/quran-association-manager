-- Migration: Add receipt_number to transactions table
-- Description: Adds a column to store the receipt number, which is different from the voucher number.

ALTER TABLE transactions ADD COLUMN receipt_number TEXT;
