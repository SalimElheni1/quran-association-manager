-- Turn off foreign key constraints during the table rebuild to avoid errors.
PRAGMA foreign_keys=OFF;

-- 1. Create a new temporary table with the correct, updated schema.
CREATE TABLE users_new (
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
    role TEXT NOT NULL CHECK(role IN ('Superadmin', 'Manager', 'FinanceManager', 'Admin', 'SessionSupervisor')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    branch_id INTEGER,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

-- 2. Copy all data from the old 'users' table into the new one.
INSERT INTO users_new (id, username, password, role, created_at)
SELECT id, username, password, CASE WHEN role = 'Branch Admin' THEN 'Admin' ELSE role END, created_at FROM users;

-- 3. Drop the old, incorrect table.
DROP TABLE users;

-- 4. Rename the new table to the original name.
ALTER TABLE users_new RENAME TO users;

-- Recreate the unique indexes that were dropped with the old table.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_national_id ON users (national_id) WHERE national_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;

-- Turn foreign key constraints back on.
PRAGMA foreign_keys=ON;