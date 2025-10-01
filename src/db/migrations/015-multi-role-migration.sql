-- 1. Create roles table
CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

-- 2. Populate roles table
INSERT INTO roles (name) VALUES ('Superadmin'), ('Administrator'), ('FinanceManager'), ('SessionSupervisor');

-- 3. Create user_roles join table
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 4. Migrate existing data
-- Step 4.1: Administrator
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE (u.role = 'Admin' OR u.role = 'Manager') AND r.name = 'Administrator';

-- Step 4.2: Superadmin
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.role = 'Superadmin' AND r.name = 'Superadmin';

-- Step 4.3: FinanceManager
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.role = 'FinanceManager' AND r.name = 'FinanceManager';

-- Step 4.4: SessionSupervisor
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.role = 'SessionSupervisor' AND r.name = 'SessionSupervisor';

-- 5. Deprecate old column (by renaming the table, creating a new one, and copying the data)

-- Step 5.1: Rename the existing users table
ALTER TABLE users RENAME TO users_old;

-- Step 5.2: Create the new users table without the 'role' column
CREATE TABLE users (
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
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

-- Step 5.3: Copy the data from the old table to the new table
INSERT INTO users (id, username, password, first_name, last_name, date_of_birth, national_id, email, phone_number, occupation, civil_status, employment_type, start_date, end_date, status, notes, need_guide, current_step, created_at, branch_id)
SELECT id, username, password, first_name, last_name, date_of_birth, national_id, email, phone_number, occupation, civil_status, employment_type, start_date, end_date, status, notes, need_guide, current_step, created_at, branch_id
FROM users_old;

-- Step 5.4: Drop the old table
DROP TABLE users_old;