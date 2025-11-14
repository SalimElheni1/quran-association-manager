-- Migration 041: Add discount fields to students table
-- Add permanent discount percentage and reason for family discounts and special cases

ALTER TABLE students ADD COLUMN discount_percentage REAL DEFAULT 0 
  CHECK(discount_percentage >= 0 AND discount_percentage <= 100);
ALTER TABLE students ADD COLUMN discount_reason TEXT;
