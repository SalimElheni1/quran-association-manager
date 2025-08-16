-- Migration to add detailed fields to the users table

ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
ALTER TABLE users ADD COLUMN date_of_birth DATE;
ALTER TABLE users ADD COLUMN national_id TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN phone_number TEXT;
ALTER TABLE users ADD COLUMN occupation TEXT;
ALTER TABLE users ADD COLUMN civil_status TEXT;
ALTER TABLE users ADD COLUMN employment_type TEXT;
ALTER TABLE users ADD COLUMN start_date DATE;
ALTER TABLE users ADD COLUMN end_date DATE;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN notes TEXT;
ALTER TABLE users ADD COLUMN branch_id INTEGER;

-- Add UNIQUE constraints for optional fields.
-- The `WHERE ... IS NOT NULL` clause allows multiple NULL values but enforces uniqueness for non-NULL values.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_national_id ON users (national_id) WHERE national_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;