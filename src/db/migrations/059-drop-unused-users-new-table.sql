-- Migration: Drop the unused users_new table
-- Description: 026-remove-role-column.sql created users_new for a table rebuild that it never
-- performed, so every database has an empty users_new table that nothing reads or writes.

DROP TABLE IF EXISTS users_new;
