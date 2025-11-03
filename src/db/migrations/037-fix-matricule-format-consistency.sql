-- Migration 037: Ensure all matricules are consistently in 4-digit format
-- This migration handles any remaining 6-digit matricules that may exist
-- in databases from older versions or imported backups

-- Convert any remaining 6-digit matricules to 4-digit format
-- Only affects matricules that still have more than 4 digits after the prefix

UPDATE students
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL
  AND LENGTH(matricule) > 0
  AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4;

UPDATE teachers
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL
  AND LENGTH(matricule) > 0
  AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4;

UPDATE users
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL
  AND LENGTH(matricule) > 0
  AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4;

UPDATE groups
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL
  AND LENGTH(matricule) > 0
  AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4;

UPDATE inventory_items
SET matricule = SUBSTR(matricule, 1, INSTR(matricule, '-')) || PRINTF('%04d', CAST(SUBSTR(matricule, INSTR(matricule, '-') + 1) AS INTEGER))
WHERE matricule IS NOT NULL
  AND LENGTH(matricule) > 0
  AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4;
