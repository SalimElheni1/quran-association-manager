-- Add matricule column to groups table
ALTER TABLE groups ADD COLUMN matricule TEXT;
-- Back-populate matricule for existing groups
UPDATE groups SET matricule = 'G-' || printf('%06d', id) WHERE matricule IS NULL;
-- Add unique index to enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_matricule ON groups(matricule);