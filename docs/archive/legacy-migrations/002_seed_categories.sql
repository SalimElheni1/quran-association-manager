-- Seed Categories and Default Account
-- Version: 2.0.0

-- ============================================
-- SEED DEFAULT CASH ACCOUNT
-- ============================================
INSERT OR IGNORE INTO accounts (id, name, type, initial_balance, current_balance) 
VALUES (1, 'الخزينة', 'CASH', 0.0, 0.0);

-- ============================================
-- SEED INCOME CATEGORIES
-- ============================================
INSERT OR IGNORE INTO categories (name, type, description) VALUES
('رسوم الطلاب', 'INCOME', 'Student registration and monthly fees'),
('التبرعات النقدية', 'INCOME', 'Cash donations'),
('التبرعات العينية', 'INCOME', 'In-kind donations'),
('دعم حكومي', 'INCOME', 'Government support'),
('مداخيل أخرى', 'INCOME', 'Other income');

-- ============================================
-- SEED EXPENSE CATEGORIES
-- ============================================
INSERT OR IGNORE INTO categories (name, type, description) VALUES
('رواتب المعلمين', 'EXPENSE', 'Teacher salaries'),
('رواتب الإداريين', 'EXPENSE', 'Administrative salaries'),
('الإيجار', 'EXPENSE', 'Rent'),
('الكهرباء والماء', 'EXPENSE', 'Utilities'),
('القرطاسية', 'EXPENSE', 'Stationery'),
('الصيانة', 'EXPENSE', 'Maintenance'),
('مصاريف أخرى', 'EXPENSE', 'Other expenses');
