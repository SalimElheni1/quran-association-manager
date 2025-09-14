-- Add matricule to tables that can be imported, to allow for updates.

-- Add matricule to classes
ALTER TABLE classes ADD COLUMN matricule TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_matricule ON classes (matricule);

-- Add matricule to payments
ALTER TABLE payments ADD COLUMN matricule TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_matricule ON payments (matricule);

-- Add matricule to salaries
ALTER TABLE salaries ADD COLUMN matricule TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_salaries_matricule ON salaries (matricule);

-- Add matricule to donations
ALTER TABLE donations ADD COLUMN matricule TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_donations_matricule ON donations (matricule);

-- Add matricule to expenses
ALTER TABLE expenses ADD COLUMN matricule TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_matricule ON expenses (matricule);
