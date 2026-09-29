-- Migration: Retire the overlapping "teens-12-17" default age group when it is unused
-- Description: 048-initialize-default-age-groups.sql added a mixed 12-17 group next to the
-- 12-14 and 15-17 boys/girls groups of 043 and schema.js, so a 12-17 year old matched two
-- groups. It is deactivated (what deleting a group in the settings does) only when no class and
-- no student's fee-group choice uses it; a branch that uses it keeps it.

UPDATE age_groups
SET is_active = 0
WHERE uuid = 'teens-12-17'
  AND id NOT IN (SELECT age_group_id FROM classes WHERE age_group_id IS NOT NULL)
  AND id NOT IN (SELECT fee_age_group_id FROM students WHERE fee_age_group_id IS NOT NULL);
