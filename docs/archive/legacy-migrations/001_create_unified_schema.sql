-- Financial System Unified Schema Migration
-- Creates new tables for unified transaction management
-- Version: 2.0.0

-- ============================================
-- 1. TRANSACTIONS TABLE (Unified)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date DATE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    
    -- Payment details
    payment_method TEXT CHECK(payment_method IN ('CASH', 'CHECK', 'TRANSFER')),
    check_number TEXT,
    
    -- Voucher tracking (وصل إستلام / إذن بالدفع)
    voucher_number TEXT UNIQUE,
    
    -- Related entity (optional link to students, teachers, donors)
    related_entity_type TEXT,
    related_entity_id INTEGER,
    related_person_name TEXT,
    
    -- Account tracking
    account_id INTEGER NOT NULL,
    
    -- Compliance (500 TND rule)
    requires_dual_signature INTEGER DEFAULT 0,
    
    -- Audit fields
    created_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_voucher ON transactions(voucher_number);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- ============================================
-- 2. ACCOUNTS TABLE (Cash Boxes & Bank Accounts)
-- ============================================
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

-- ============================================
-- 3. CATEGORIES TABLE (Pre-defined)
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
    description TEXT,
    is_active INTEGER DEFAULT 1
);
