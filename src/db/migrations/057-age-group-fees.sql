-- Migration 057: fee amounts per age group, and a student's fee group
--
-- Each age group may set its own annual and monthly fee. NULL means the group
-- uses the branch amounts from the fee settings, so nothing changes on upgrade.
-- A student whose classes are in age groups with different fees is billed by
-- the group an administrator picks (fee_age_group_id); until then, the group
-- with the higher fee applies.

ALTER TABLE age_groups ADD COLUMN annual_fee REAL CHECK (annual_fee IS NULL OR annual_fee >= 0);
ALTER TABLE age_groups ADD COLUMN monthly_fee REAL CHECK (monthly_fee IS NULL OR monthly_fee >= 0);

ALTER TABLE students ADD COLUMN fee_age_group_id INTEGER REFERENCES age_groups(id) ON DELETE SET NULL;
