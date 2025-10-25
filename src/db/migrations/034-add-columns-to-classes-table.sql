-- Migration 034: Add columns to classes table
-- This migration adds fee_type and monthly_fee to the classes table.

ALTER TABLE classes ADD COLUMN fee_type TEXT DEFAULT 'standard' CHECK(fee_type IN ('standard', 'special'));
ALTER TABLE classes ADD COLUMN monthly_fee REAL DEFAULT 0;
