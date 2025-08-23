-- Add matricule column to students table
ALTER TABLE students ADD COLUMN matricule TEXT;
-- Back-populate matricule for existing students
UPDATE students SET matricule = 'S-' || printf('%06d', id) WHERE matricule IS NULL;
-- Add unique index to enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_matricule ON students(matricule);

-- Add matricule column to teachers table
ALTER TABLE teachers ADD COLUMN matricule TEXT;
-- Back-populate matricule for existing teachers
UPDATE teachers SET matricule = 'T-' || printf('%06d', id) WHERE matricule IS NULL;
-- Add unique index to enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_matricule ON teachers(matricule);

-- Add matricule column to users table
ALTER TABLE users ADD COLUMN matricule TEXT;
-- Back-populate matricule for existing users
UPDATE users SET matricule = 'U-' || printf('%06d', id) WHERE matricule IS NULL;
-- Add unique index to enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_matricule ON users(matricule);
