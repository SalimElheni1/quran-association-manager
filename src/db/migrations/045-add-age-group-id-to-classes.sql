-- Migration: Add Age Group Reference to Classes
-- Description: Links classes to age_groups instead of using simple gender classification
-- Created: 2025-11-14
-- Backward Compatibility: Keeps gender field, but age_group_id becomes primary identifier

ALTER TABLE classes ADD COLUMN age_group_id INTEGER;

-- Create an index for faster lookups
CREATE INDEX idx_classes_age_group_id ON classes(age_group_id);
