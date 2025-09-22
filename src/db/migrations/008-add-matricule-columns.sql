-- Add matricule columns if they don't exist (for existing databases)
ALTER TABLE students ADD COLUMN matricule TEXT;
ALTER TABLE teachers ADD COLUMN matricule TEXT;
ALTER TABLE users ADD COLUMN matricule TEXT;

-- Back-populate matricule for existing records
UPDATE students SET matricule = 'S-' || printf('%06d', id) WHERE matricule IS NULL;
UPDATE teachers SET matricule = 'T-' || printf('%06d', id) WHERE matricule IS NULL;
UPDATE users SET matricule = 'U-' || printf('%06d', id) WHERE matricule IS NULL;

-- Add unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_matricule ON students(matricule);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_matricule ON teachers(matricule);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_matricule ON users(matricule);
