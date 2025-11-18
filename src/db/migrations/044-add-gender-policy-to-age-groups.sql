-- Migration: Add Gender Policy to Age Groups
-- Description: Adds gender_policy field to age_groups table to define how classes are organized
-- Created: 2025-11-14
-- Policies: 'mixed' (boys and girls together), 'separated' (auto-create male/female variants), 'single_gender' (one gender only)

-- Add the gender_policy column if it doesn't exist
ALTER TABLE age_groups ADD COLUMN gender_policy TEXT DEFAULT 'mixed' CHECK(gender_policy IN ('mixed', 'separated', 'single_gender'));

-- Update existing age groups with appropriate policies based on their age ranges and gender
UPDATE age_groups SET gender_policy = 'mixed' WHERE uuid = 'children-6-11';

UPDATE age_groups SET gender_policy = 'separated' WHERE uuid IN ('youth-boys-12-14', 'youth-girls-12-14');

UPDATE age_groups SET gender_policy = 'separated' WHERE uuid IN ('young-adults-boys-15-17', 'young-adults-girls-15-17');

UPDATE age_groups SET gender_policy = 'single_gender' WHERE uuid IN ('men-18-plus', 'women-18-plus');
