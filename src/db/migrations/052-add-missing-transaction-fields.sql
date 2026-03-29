-- Migration: Add missing fields to transactions table
-- Description: Adds bank_transfer_number and donor_cin columns to support better income tracking and exports

ALTER TABLE transactions ADD COLUMN bank_transfer_number TEXT;
ALTER TABLE transactions ADD COLUMN donor_cin TEXT;
