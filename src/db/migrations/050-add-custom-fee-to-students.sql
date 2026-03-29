-- Migration 050: Add custom fee amount to students table
-- Allow overriding standard/class fees with a fixed monthly amount

ALTER TABLE students ADD COLUMN custom_fee_amount DECIMAL(10, 2) DEFAULT NULL;
