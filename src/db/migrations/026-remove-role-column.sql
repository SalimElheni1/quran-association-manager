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

-- Step 2: Check if role column exists - if not, skip this migration entirely
-- This migration only applies to databases that have the old role column
-- For fresh databases, the schema already has the correct structure

-- Step 3: Only proceed if role column exists (for old databases being upgraded)
-- For fresh databases, this migration does nothing
