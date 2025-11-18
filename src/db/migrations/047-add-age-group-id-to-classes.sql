-- Migration: Add age_group_id column to classes table
-- Description: Adds foreign key to age_groups table for class categorization
-- Created: 2025-11-15

ALTER TABLE classes ADD COLUMN age_group_id INTEGER REFERENCES age_groups(id);

-- Create index for performance
CREATE INDEX idx_classes_age_group_id ON classes(age_group_id);
