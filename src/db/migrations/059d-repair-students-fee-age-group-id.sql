-- Migration 059d: repair for databases where 057 was skipped
--
-- The migration runner marks a whole file as applied when its first ALTER TABLE fails with
-- "duplicate column name". A database that already had one of the age_groups columns of
-- 056/057 (added by an earlier build) therefore skipped the whole file and never got the
-- rest of it; 060 then failed with "no such column: fee_age_group_id" and the app would not
-- start. This file adds the one column again. When the column already exists (every
-- healthy database) the runner marks it applied and nothing changes. One column per file,
-- so that one existing column cannot make the runner skip another missing one.

ALTER TABLE students ADD COLUMN fee_age_group_id INTEGER REFERENCES age_groups(id) ON DELETE SET NULL;
