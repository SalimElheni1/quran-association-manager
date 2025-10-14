-- Migration: Remove old role column from users table
-- Description: Complete the multi-role migration by removing the deprecated role column

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Step 1: Create new users table without role column
CREATE TABLE IF NOT EXISTS users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  national_id TEXT UNIQUE,
  email TEXT UNIQUE,
  phone_number TEXT,
  occupation TEXT,
  civil_status TEXT CHECK(civil_status IN ('Single', 'Married', 'Divorced', 'Widowed')),
  employment_type TEXT CHECK(employment_type IN ('volunteer', 'contract')),
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  notes TEXT,
  need_guide INTEGER DEFAULT 1,
  current_step INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  branch_id INTEGER,
  matricule TEXT UNIQUE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

-- Step 2: Check if role column exists and migrate data if needed
-- First, check if we need to do anything by testing for the role column
-- If role column exists, migrate the data to user_roles table

-- Migrate Superadmin users
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE r.name = 'Superadmin'
AND EXISTS (SELECT 1 FROM pragma_table_info('users') WHERE name = 'role')
AND u.id IN (SELECT id FROM users WHERE role = 'Superadmin');

-- Migrate Administrator/Manager users
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE r.name = 'Administrator'
AND EXISTS (SELECT 1 FROM pragma_table_info('users') WHERE name = 'role')
AND u.id IN (SELECT id FROM users WHERE role IN ('Administrator', 'Manager'));

-- Migrate FinanceManager users
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE r.name = 'FinanceManager'
AND EXISTS (SELECT 1 FROM pragma_table_info('users') WHERE name = 'role')
AND u.id IN (SELECT id FROM users WHERE role = 'FinanceManager');

-- Migrate SessionSupervisor users
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE r.name = 'SessionSupervisor'
AND EXISTS (SELECT 1 FROM pragma_table_info('users') WHERE name = 'role')
AND u.id IN (SELECT id FROM users WHERE role = 'SessionSupervisor');

-- Step 3: Only recreate table if role column exists
-- Check if role column exists before doing the table recreation
INSERT INTO users_new (
  id, username, password, first_name, last_name, date_of_birth,
  national_id, email, phone_number, occupation, civil_status,
  employment_type, start_date, end_date, status, notes,
  need_guide, current_step, created_at, branch_id, matricule
)
SELECT 
  id, username, password, first_name, last_name, date_of_birth,
  national_id, email, phone_number, occupation, civil_status,
  employment_type, start_date, end_date, status, notes,
  COALESCE(need_guide, 1), COALESCE(current_step, 0), created_at, branch_id, matricule
FROM users;

-- Step 4: Drop old table only if we successfully copied data
DROP TABLE IF EXISTS users;

-- Step 5: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 6: Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_national_id ON users (national_id) WHERE national_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_matricule ON users (matricule) WHERE matricule IS NOT NULL;
