-- Migration 033: Add columns to students table
-- This migration adds fee_category and sponsor information to the students table.

ALTER TABLE students ADD COLUMN fee_category TEXT DEFAULT 'CAN_PAY' CHECK (fee_category IN ('CAN_PAY', 'EXEMPT', 'SPONSORED'));
ALTER TABLE students ADD COLUMN sponsor_name TEXT;
ALTER TABLE students ADD COLUMN sponsor_phone TEXT;
ALTER TABLE students ADD COLUMN sponsor_cin TEXT;
