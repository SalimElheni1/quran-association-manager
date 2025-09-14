-- Add matricule to groups to allow for updates via import.

ALTER TABLE groups ADD COLUMN matricule TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_matricule ON groups (matricule);
