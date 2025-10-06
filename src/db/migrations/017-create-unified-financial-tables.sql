-- Migration: Create unified financial system tables
-- Description: Creates accounts, categories, and transactions tables for the new financial system

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('CASH', 'BANK')),
  account_number TEXT,
  initial_balance REAL DEFAULT 0.0,
  current_balance REAL DEFAULT 0.0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
  description TEXT,
  is_active INTEGER DEFAULT 1
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date DATE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('CASH', 'CHECK', 'TRANSFER')),
  check_number TEXT,
  voucher_number TEXT UNIQUE,
  related_entity_type TEXT,
  related_entity_id INTEGER,
  related_person_name TEXT,
  account_id INTEGER NOT NULL,
  requires_dual_signature INTEGER DEFAULT 0,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- Seed default account
INSERT OR IGNORE INTO accounts (id, name, type, initial_balance, current_balance)
VALUES (1, 'الخزينة', 'CASH', 0.0, 0.0);

-- Seed income categories
INSERT OR IGNORE INTO categories (name, type, description, is_active)
VALUES 
  ('التبرعات النقدية', 'INCOME', 'Cash donations', 1),
  ('التبرعات العينية', 'INCOME', 'In-kind donations', 1),
  ('مداخيل أخرى', 'INCOME', 'Other income', 1);

-- Seed expense categories
INSERT OR IGNORE INTO categories (name, type, description, is_active)
VALUES 
  ('رواتب المعلمين', 'EXPENSE', 'Teacher salaries', 1),
  ('رواتب الإداريين', 'EXPENSE', 'Administrative salaries', 1),
  ('الإيجار', 'EXPENSE', 'Rent', 1),
  ('الكهرباء والماء', 'EXPENSE', 'Utilities', 1),
  ('القرطاسية', 'EXPENSE', 'Stationery', 1),
  ('الصيانة', 'EXPENSE', 'Maintenance', 1),
  ('مصاريف أخرى', 'EXPENSE', 'Other expenses', 1);
