-- Migration: Migrate existing classes to age groups
-- Description: Maps existing gender-based classes to appropriate age groups
-- Created: 2025-11-15

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
