-- Migration to add new columns to the classes table
-- This brings the table in line with the latest schema definition

-- ALTER TABLE classes ADD COLUMN class_type TEXT;
ALTER TABLE classes ADD COLUMN schedule TEXT;
-- ALTER TABLE classes ADD COLUMN start_date DATE;
-- ALTER TABLE classes ADD COLUMN end_date DATE;
-- ALTER TABLE classes ADD COLUMN status TEXT DEFAULT 'pending';
-- ALTER TABLE classes ADD COLUMN capacity INTEGER;