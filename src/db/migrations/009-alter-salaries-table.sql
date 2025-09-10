-- Migration to alter the salaries table to support both teachers and admin staff.

-- SQLite does not support dropping columns or constraints directly.
-- The recommended approach is to rename the table, create a new one, and copy the data.

-- Step 1: Rename the existing salaries table as a temporary table
ALTER TABLE salaries RENAME TO _salaries_old;

-- Step 2: Create the new salaries table with the updated schema
CREATE TABLE salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_type TEXT NOT NULL CHECK(user_type IN ('teacher', 'admin')), -- To distinguish between teachers and other users
    amount REAL NOT NULL,
    payment_date DATETIME NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Copy the data from the old table to the new one, setting the user_type to 'teacher' for all existing records
INSERT INTO salaries (id, user_id, user_type, amount, payment_date, notes, created_at, updated_at)
SELECT id, teacher_id, 'teacher', amount, payment_date, notes, created_at, updated_at
FROM _salaries_old;

-- Step 4: Drop the temporary old table
DROP TABLE _salaries_old;
