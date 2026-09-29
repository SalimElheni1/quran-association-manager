-- Migration 062: give the first Superadmin a matricule in the 4-digit form (U-0001)
--
-- The first-run setup created it as U-000001, while matriculeService and the user
-- validation use U-NNNN, so that account could not be edited from the users page. The
-- number is kept; a matricule is only changed when its 4-digit form is not already taken.

UPDATE users
SET matricule = 'U-' || printf('%04d', CAST(SUBSTR(matricule, 3) AS INTEGER))
WHERE matricule GLOB 'U-[0-9][0-9][0-9][0-9][0-9]*'
  AND CAST(SUBSTR(matricule, 3) AS INTEGER) < 10000
  AND ('U-' || printf('%04d', CAST(SUBSTR(matricule, 3) AS INTEGER))) NOT IN (
    SELECT matricule FROM users WHERE matricule IS NOT NULL
  );
