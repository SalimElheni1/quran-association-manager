-- Add payment_frequency column to student_fee_charges table
-- Stores the determined payment frequency (MONTHLY or ANNUAL) for each charge
-- This ensures consistency between charge generation logic and description generation
ALTER TABLE student_fee_charges ADD COLUMN payment_frequency TEXT DEFAULT 'MONTHLY' CHECK (payment_frequency IN ('MONTHLY', 'ANNUAL'));
