-- Migration: Migrate Existing Classes to Age Groups
-- Description: Maps existing classes with gender='men','women','kids','all' to appropriate age_groups
-- Created: 2025-11-14
-- Strategy: Use the adult_age_threshold setting (default 18) to determine age group mapping

-- Get the adult_age_threshold setting (defaults to 18 if not set)
-- This query will run in Node.js migration handler, not pure SQL

-- Map 'kids' classes to children-6-11 age group
UPDATE classes 
SET age_group_id = (SELECT id FROM age_groups WHERE uuid = 'children-6-11')
WHERE gender = 'kids' AND age_group_id IS NULL;

-- Map 'men' classes to men-18-plus age group
UPDATE classes 
SET age_group_id = (SELECT id FROM age_groups WHERE uuid = 'men-18-plus')
WHERE gender = 'men' AND age_group_id IS NULL;

-- Map 'women' classes to women-18-plus age group
UPDATE classes 
SET age_group_id = (SELECT id FROM age_groups WHERE uuid = 'women-18-plus')
WHERE gender = 'women' AND age_group_id IS NULL;

-- Map 'all' classes to children-6-11 (mixed policy) as default
UPDATE classes 
SET age_group_id = (SELECT id FROM age_groups WHERE uuid = 'children-6-11')
WHERE gender = 'all' AND age_group_id IS NULL;

-- Log any unmapped classes (age_group_id is still NULL)
-- SELECT id, name, gender, age_group_id FROM classes WHERE age_group_id IS NULL;
