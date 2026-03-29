-- Migration 031: Add `fee_month` column to `student_fee_charges`
-- This column will clearly track which month a charge belongs to, 
-- bypassing the issues with creation-date (`charge_date`) based identification.

-- Add the column
ALTER TABLE student_fee_charges ADD COLUMN fee_month INTEGER;

-- Back-fill existing records from `due_date` (which is set to the 15th of the billing month)
-- If `due_date` is NULL (unlikely for monthly fees but possible for annual), we skip it.
UPDATE student_fee_charges 
SET fee_month = CAST(strftime('%m', due_date) AS INTEGER)
WHERE fee_type = 'MONTHLY' AND due_date IS NOT NULL;
