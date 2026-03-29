-- Migration 053: Add fees and frequency to age groups
-- Adds specialized fee amounts and payment frequency per age group

ALTER TABLE age_groups ADD COLUMN registration_fee REAL DEFAULT 0;
ALTER TABLE age_groups ADD COLUMN monthly_fee REAL DEFAULT 0;
ALTER TABLE age_groups ADD COLUMN payment_frequency TEXT DEFAULT 'MONTHLY' CHECK (payment_frequency IN ('MONTHLY', 'ANNUAL'));

-- Update existing default groups if needed (optional, keeping them at 0 for now as they are defaults)
-- UPDATE age_groups SET registration_fee = 0, monthly_fee = 0, payment_frequency = 'MONTHLY';
