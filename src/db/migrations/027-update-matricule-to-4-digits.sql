-- Migration to update all existing matricule to 4 digits instead of 6
-- Tables affected: students, teachers, users, groups, inventory_items

-- Function to update matricule for a table
-- SQLite equivalent: Update matricule to prefix + 4-digit padded number

UPDATE students
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL AND LENGTH(matricule) > 0;

UPDATE teachers
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL AND LENGTH(matricule) > 0;

UPDATE users
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL AND LENGTH(matricule) > 0;

UPDATE groups
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL AND LENGTH(matricule) > 0;

UPDATE inventory_items
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL AND LENGTH(matricule) > 0;
