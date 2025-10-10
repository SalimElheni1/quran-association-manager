# Financial System Redesign - Single Source of Truth

**Project:** Quran Branch Manager  
**Module:** Financial Management System  
**Version:** 2.0  
**Last Updated:** 2024  
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Design Principles](#design-principles)
4. [Database Schema](#database-schema)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Component Structure](#component-structure)
8. [Migration Strategy](#migration-strategy)
9. [Implementation Plan](#implementation-plan)
10. [Testing Strategy](#testing-strategy)

---

## Executive Summary

### Objective
Redesign the financial module to be simple, user-friendly, and aligned with the association's actual procedures while maintaining offline-first capability.

### Key Changes
- **Unified Transactions:** Single table for all financial transactions (income/expenses)
- **Simplified UI:** Dashboard + Income + Expenses + Accounts + Inventory
- **Voucher System:** Auto-generated receipt/payment authorization numbers
- **500 TND Rule:** Automatic validation for cash transaction limits
- **Removed:** Receipt Books module (client requirement)

### Target Users
Non-technical administrators managing Quranic association branches in Tunisia.

---

## Current System Analysis

### Existing Structure
```
Tables: payments, expenses, salaries, donations, inventory_items
Pages: 6 separate tabs (Payments, Salaries, Donations, Expenses, Inventory, Receipt Books)
Approach: Separate CRUD for each entity
```

### Problems Identified
1. ❌ Data fragmentation across 6 tables
2. ❌ No unified reporting
3. ❌ No voucher number tracking
4. ❌ No 500 TND rule enforcement
5. ❌ Receipt Books module unnecessary (client feedback)
6. ❌ Difficult to generate comprehensive financial reports

### What Works Well
1. ✅ Offline-first with SQLite
2. ✅ Basic CRUD operations
3. ✅ Date filtering
4. ✅ Inventory management (separate concern)

---

## Design Principles

### 1. Simplicity First
- Users are not accountants
- Hide complexity behind intuitive interfaces
- Use familiar terminology (Arabic)

### 2. Single Source of Truth
- One `transactions` table for all financial operations
- Unified voucher numbering system
- Consistent data structure

### 3. Offline-First
- All operations work without internet
- SQLite for local storage
- Fast queries with proper indexing

### 4. Compliance
- 500 TND cash limit enforcement
- Voucher tracking (وصل إستلام / إذن بالدفع)
- Audit trail for all changes

### 5. Maintainability
- Reusable components
- Clear separation of concerns
- Minimal code duplication

---

## Database Schema

### Core Tables

#### 1. transactions (Unified Financial Records)
```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date DATE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    
    -- Payment details
    payment_method TEXT CHECK(payment_method IN ('CASH', 'CHECK', 'TRANSFER')),
    check_number TEXT,
    
    -- Voucher tracking
    voucher_number TEXT UNIQUE, -- Format: R-2024-0001 or P-2024-0045
    
    -- Related entity (optional)
    related_entity_type TEXT, -- 'Student', 'Teacher', 'Donor', 'Supplier'
    related_entity_id INTEGER,
    related_person_name TEXT,
    
    -- Account tracking
    account_id INTEGER NOT NULL,
    
    -- Compliance
    requires_dual_signature INTEGER DEFAULT 0, -- For amounts > 500 TND
    
    -- Audit
    created_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_voucher ON transactions(voucher_number);
```

#### 2. accounts (Cash Boxes & Bank Accounts)
```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, -- 'الخزينة', 'حساب بنك الإسكان'
    type TEXT NOT NULL CHECK(type IN ('CASH', 'BANK')),
    account_number TEXT,
    initial_balance REAL DEFAULT 0.0,
    current_balance REAL DEFAULT 0.0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default account
INSERT INTO accounts (name, type, initial_balance, current_balance) 
VALUES ('الخزينة', 'CASH', 0.0, 0.0);
```

#### 3. categories (Pre-defined Transaction Categories)
```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
    description TEXT,
    is_active INTEGER DEFAULT 1
);

-- Income Categories
INSERT INTO categories (name, type, description) VALUES
('رسوم الطلاب', 'INCOME', 'Student registration and monthly fees'),
('التبرعات النقدية', 'INCOME', 'Cash donations'),
('التبرعات العينية', 'INCOME', 'In-kind donations'),
('دعم حكومي', 'INCOME', 'Government support'),
('مداخيل أخرى', 'INCOME', 'Other income');

-- Expense Categories
INSERT INTO categories (name, type, description) VALUES
('رواتب المعلمين', 'EXPENSE', 'Teacher salaries'),
('رواتب الإداريين', 'EXPENSE', 'Administrative salaries'),
('الإيجار', 'EXPENSE', 'Rent'),
('الكهرباء والماء', 'EXPENSE', 'Utilities'),
('القرطاسية', 'EXPENSE', 'Stationery'),
('الصيانة', 'EXPENSE', 'Maintenance'),
('مصاريف أخرى', 'EXPENSE', 'Other expenses');
```

### Supporting Tables (Keep Existing)
- `students` - Student records
- `teachers` - Teacher records
- `users` - System users with roles
- `inventory_items` - Physical assets (separate from financial transactions)

---

## Backend Architecture

### File Structure
```
src/main/
├── financialHandlers.js (REVISED)
├── services/
│   ├── TransactionService.js
│   ├── ReportService.js
│   └── VoucherService.js
└── migrations/
    ├── 001_create_unified_schema.sql
    ├── 002_seed_categories.sql
    └── migrateToUnifiedTransactions.js
```

### IPC Handlers

#### Transaction Handlers
```javascript
// Get transactions with filters
ipcMain.handle('transactions:get', async (event, filters) => {
  // filters: { type, category, startDate, endDate, accountId }
  // Returns: Array of transactions with account names
});

// Add new transaction
ipcMain.handle('transactions:add', async (event, transaction) => {
  // Validates 500 TND rule
  // Generates voucher number
  // Updates account balance
  // Returns: Created transaction
});

// Update transaction
ipcMain.handle('transactions:update', async (event, transaction) => {
  // Reverses old balance
  // Updates transaction
  // Applies new balance
  // Returns: Updated transaction
});

// Delete transaction
ipcMain.handle('transactions:delete', async (event, transactionId) => {
  // Reverses balance
  // Deletes transaction
  // Returns: { id }
});
```

#### Report Handlers
```javascript
// Get financial summary for period
ipcMain.handle('financial:get-summary', async (event, period) => {
  // period: { startDate, endDate }
  // Returns: {
  //   totalIncome,
  //   totalExpenses,
  //   balance,
  //   incomeByCategory: [],
  //   expensesByCategory: [],
  //   recentTransactions: []
  // }
});
```

#### Account Handlers
```javascript
// Get all active accounts
ipcMain.handle('accounts:get', async (event) => {
  // Returns: Array of accounts
});

// Add new account
ipcMain.handle('accounts:add', async (event, account) => {
  // Returns: Created account
});
```

#### Category Handlers
```javascript
// Get categories by type
ipcMain.handle('categories:get', async (event, type) => {
  // type: 'INCOME' | 'EXPENSE' | null (all)
  // Returns: Array of categories
});
```

### Business Logic

#### Voucher Number Generation
```javascript
// Format: R-2024-0001 (Receipt) or P-2024-0045 (Payment)
async function generateVoucherNumber(type, year) {
  const prefix = type === 'INCOME' ? 'R' : 'P';
  const lastVoucher = await getLastVoucherNumber(type, year);
  const nextNumber = (lastVoucher || 0) + 1;
  return `${prefix}-${year}-${String(nextNumber).padStart(4, '0')}`;
}
```

#### 500 TND Rule Validation
```javascript
function validate500TndRule(amount, paymentMethod) {
  if (amount > 500 && paymentMethod === 'CASH') {
    throw new Error('المبالغ التي تتجاوز 500 دينار يجب أن تكون عبر شيك أو تحويل بنكي');
  }
}
```

#### Account Balance Management
```javascript
async function updateAccountBalance(accountId, transactionType, amount) {
  const adjustment = transactionType === 'INCOME' ? amount : -amount;
  await runQuery(
    'UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?',
    [adjustment, accountId]
  );
}
```

---

## Frontend Architecture

### File Structure
```
src/renderer/
├── pages/
│   ├── FinancialsPage.jsx (Router)
│   ├── FinancialDashboard.jsx (NEW)
│   ├── IncomePage.jsx (REVISED)
│   ├── ExpensesPage.jsx (REVISED)
│   ├── AccountsPage.jsx (NEW)
│   └── InventoryTab.jsx (KEEP)
│
├── components/financial/
│   ├── TransactionModal.jsx (NEW)
│   ├── TransactionTable.jsx (NEW)
│   ├── TransactionFilters.jsx (NEW)
│   ├── SummaryCard.jsx (NEW)
│   ├── CategoryChart.jsx (NEW)
│   ├── PeriodSelector.jsx (NEW)
│   ├── AccountSelector.jsx (NEW)
│   ├── CategorySelector.jsx (NEW)
│   ├── ReceiptPrintModal.jsx (NEW)
│   └── PaymentAuthPrintModal.jsx (NEW)
│
├── hooks/
│   ├── useTransactions.js (NEW)
│   ├── useAccounts.js (NEW)
│   ├── useCategories.js (NEW)
│   ├── useFinancialSummary.js (NEW)
│   └── usePeriodFilter.js (NEW)
│
└── utils/
    ├── financialHelpers.js
    ├── voucherPrinter.js
    └── reportExporter.js
```

### Navigation Structure
```
📊 الشؤون المالية (Financials)
  ├── 📈 لوحة التحكم (Dashboard) - Default
  ├── 💰 المداخيل (Income)
  ├── 💸 المصاريف (Expenses)
  ├── 🏦 الحسابات (Accounts)
  └── 📦 المخزون (Inventory)
```

---

## Component Structure

### 1. FinancialsPage.jsx (Router)
**Responsibility:** Navigation between financial sub-pages

**State:**
- `activeTab`: string (current page)

**Children:**
- FinancialDashboard
- IncomePage
- ExpensesPage
- AccountsPage
- InventoryTab

### 2. FinancialDashboard.jsx
**Responsibility:** Display financial overview and reports

**Hooks:**
- `useFinancialSummary(period)`
- `usePeriodFilter()`

**Children:**
- PeriodSelector
- SummaryCard (x4)
- CategoryChart (x2)
- TransactionTable (recent)
- ExportButtons

**Features:**
- Period selection (monthly, quarterly, semi-annual, annual)
- Summary cards (income, expenses, balance, count)
- Charts (income/expenses by category)
- Recent transactions list
- PDF/Excel export

### 3. IncomePage.jsx
**Responsibility:** Manage income transactions

**Hooks:**
- `useTransactions({ type: 'INCOME', ...filters })`

**Children:**
- TransactionFilters
- TransactionTable
- TransactionModal
- ReceiptPrintModal

**Features:**
- Add/Edit/Delete income
- Filter by category, date, account
- Search by description/person
- Print receipt vouchers

### 4. ExpensesPage.jsx
**Responsibility:** Manage expense transactions

**Hooks:**
- `useTransactions({ type: 'EXPENSE', ...filters })`

**Children:**
- TransactionFilters
- TransactionTable
- TransactionModal
- PaymentAuthPrintModal

**Features:**
- Add/Edit/Delete expenses
- Filter by category, date, account
- Search by description/person
- Print payment authorizations

### 5. AccountsPage.jsx
**Responsibility:** Manage cash boxes and bank accounts

**Hooks:**
- `useAccounts()`

**Features:**
- List all accounts with balances
- Add new accounts
- View account transaction history

### 6. TransactionModal.jsx (Reusable)
**Props:**
- `show`: boolean
- `type`: 'INCOME' | 'EXPENSE'
- `transaction`: object | null
- `onHide`: function
- `onSave`: function

**Features:**
- Unified form for income/expenses
- Category selector (filtered by type)
- Amount input with 500 TND validation
- Payment method selector
- Account selector
- Auto-generate voucher number
- Link to student/teacher (optional)

### 7. TransactionTable.jsx (Reusable)
**Props:**
- `transactions`: array
- `loading`: boolean
- `compact`: boolean
- `onEdit`: function
- `onDelete`: function
- `onPrint`: function

**Columns:**
- Date
- Voucher Number
- Category
- Description
- Amount
- Payment Method
- Account
- Actions (Edit, Delete, Print)

### 8. TransactionFilters.jsx (Reusable)
**Props:**
- `type`: 'INCOME' | 'EXPENSE'
- `filters`: object
- `onChange`: function

**Controls:**
- Category dropdown (filtered by type)
- Date range picker
- Search input
- Account filter

---

## Migration Strategy

### Phase 1: Create New Schema
```sql
-- Run migrations/001_create_unified_schema.sql
CREATE TABLE transactions (...);
CREATE TABLE accounts (...);
CREATE TABLE categories (...);
```

### Phase 2: Seed Data
```sql
-- Run migrations/002_seed_categories.sql
INSERT INTO categories (...);
INSERT INTO accounts (...);
```

### Phase 3: Migrate Existing Data
```javascript
// Run migrations/migrateToUnifiedTransactions.js

// Payments → Income transactions
for (const payment of payments) {
  INSERT INTO transactions (
    type: 'INCOME',
    category: 'رسوم الطلاب',
    amount: payment.amount,
    transaction_date: payment.payment_date,
    voucher_number: payment.receipt_number,
    related_entity_type: 'Student',
    related_entity_id: payment.student_id,
    ...
  );
}

// Expenses → Expense transactions
// Salaries → Expense transactions
// Donations (Cash) → Income transactions
```

### Phase 4: Verify Data Integrity
```javascript
// Compare totals
const oldTotal = SUM(payments.amount);
const newTotal = SUM(transactions.amount WHERE type='INCOME' AND category='رسوم الطلاب');
assert(oldTotal === newTotal);
```

### Phase 5: Update UI
- Deploy new components
- Keep old tables as read-only backup (for 1 month)
- Monitor for issues

### Phase 6: Cleanup (After 1 Month)
```sql
-- Drop old tables
DROP TABLE payments;
DROP TABLE expenses;
DROP TABLE salaries;
DROP TABLE donations;
DROP TABLE receipt_books;
```

---

## Implementation Plan

### Week 1: Database & Backend
**Tasks:**
- [x] Create migration scripts (schema, seed data)
- [x] Write data migration script
- [x] Test migration with sample data
- [x] Implement TransactionService (logic in handlers)
- [x] Implement VoucherService
- [x] Update IPC handlers
- [x] Add 500 TND validation
- [x] Add account balance tracking

**Deliverables:**
- Working backend with new schema
- All IPC handlers functional
- Migration script tested

### Week 2: Core Components
**Tasks:**
- [x] Create custom hooks (useTransactions, useAccounts, useCategories)
- [x] Build TransactionModal component
- [x] Build TransactionTable component
- [x] Build TransactionFilters component
- [x] Test CRUD operations

**Deliverables:**
- Reusable components ready
- CRUD operations working

### Week 3: Dashboard & Reports
**Tasks:**
- [x] Create FinancialDashboard page
- [x] Build SummaryCard component
- [x] Build CategoryChart component
- [x] Build PeriodSelector component
- [x] Implement useFinancialSummary hook
- [x] Add PDF export functionality
- [x] Add Excel export functionality

**Deliverables:**
- Dashboard with charts and summaries
- Export functionality working

### Week 4: Income & Expenses Pages
**Tasks:**
- [x] Create IncomePage
- [x] Create ExpensesPage
- [x] Create AccountsPage
- [x] Update FinancialsPage router
- [x] Integrate with TransactionModal
- [x] Add filtering and search
- [ ] Build ReceiptPrintModal (deferred)
- [ ] Build PaymentAuthPrintModal (deferred)

**Deliverables:**
- Income and Expenses pages functional
- Accounts page functional
- Navigation integrated

### Week 5: Accounts & Polish
**Tasks:**
- [x] Create AccountsPage
- [x] Build account management UI
- [x] Update FinancialsPage router
- [x] Remove Receipt Books references (moved to legacy)
- [x] Enhanced export functionality (ExcelJS integration)
- [x] Build VoucherPrintModal
- [x] UI/UX improvements
- [x] Performance optimization

**Deliverables:**
- Complete financial module
- All pages integrated
- Print functionality working

### Week 6: Testing & Documentation
**Tasks:**
- [x] Unit tests for services
- [x] Integration tests for IPC handlers
- [x] Complete workflow integration test
- [x] UI testing (manual)
- [x] Write user documentation (Arabic)
- [x] Code review and refactoring
- [ ] User acceptance testing (pending client)

**Deliverables:**
- Tested and documented system
- Ready for production

---

## Testing Strategy

### Unit Tests
```javascript
// Test voucher number generation
test('generateVoucherNumber creates sequential numbers', async () => {
  const voucher1 = await generateVoucherNumber('INCOME', 2024);
  const voucher2 = await generateVoucherNumber('INCOME', 2024);
  expect(voucher1).toBe('R-2024-0001');
  expect(voucher2).toBe('R-2024-0002');
});

// Test 500 TND validation
test('validate500TndRule throws error for cash > 500', () => {
  expect(() => validate500TndRule(600, 'CASH')).toThrow();
  expect(() => validate500TndRule(600, 'CHECK')).not.toThrow();
});

// Test account balance calculation
test('updateAccountBalance adjusts correctly', async () => {
  await updateAccountBalance(1, 'INCOME', 100);
  const account = await getAccount(1);
  expect(account.current_balance).toBe(100);
});
```

### Integration Tests
```javascript
// Test transaction creation flow
test('adding income transaction updates account balance', async () => {
  const transaction = {
    type: 'INCOME',
    category: 'رسوم الطلاب',
    amount: 150,
    transaction_date: '2024-01-15',
    account_id: 1
  };
  
  const result = await handleAddTransaction(null, transaction);
  
  expect(result.voucher_number).toMatch(/^R-2024-\d{4}$/);
  
  const account = await getAccount(1);
  expect(account.current_balance).toBe(150);
});
```

### Manual Testing Checklist
- [ ] Add income transaction
- [ ] Add expense transaction
- [ ] Edit transaction
- [ ] Delete transaction
- [ ] Filter by category
- [ ] Filter by date range
- [ ] Search transactions
- [ ] View dashboard
- [ ] Change period (monthly, quarterly, annual)
- [ ] Export PDF report
- [ ] Export Excel report
- [ ] Print receipt voucher
- [ ] Print payment authorization
- [ ] Add new account
- [ ] Validate 500 TND rule (cash)
- [ ] Validate 500 TND rule (check/transfer)
- [ ] Check account balance updates
- [ ] Test with Arabic text
- [ ] Test with large amounts
- [ ] Test with many transactions (performance)

---

## Key Decisions & Rationale

### Decision 1: Single Transactions Table
**Rationale:** Simplifies queries, reporting, and maintenance. All financial operations follow the same structure.

### Decision 2: Keep Inventory Separate
**Rationale:** Inventory is asset management, not financial transactions. Different concerns, different tables.

### Decision 3: Remove Receipt Books
**Rationale:** Client feedback - unnecessary complexity. Voucher numbers are sufficient.

### Decision 4: Auto-Generate Voucher Numbers
**Rationale:** Ensures uniqueness, follows sequential numbering, reduces user error.

### Decision 5: Enforce 500 TND Rule in Code
**Rationale:** Prevents user mistakes, ensures compliance with association rules.

### Decision 6: No Approval Workflow (For Now)
**Rationale:** Offline-first system, single-user per branch. Can add later if needed.

### Decision 7: Pre-defined Categories
**Rationale:** Ensures consistency in reporting. Users can't create arbitrary categories.

### Decision 8: Reusable Components
**Rationale:** TransactionModal and TransactionTable used by both Income and Expenses pages. Reduces code duplication.

---

## Success Criteria

### Functional Requirements
- ✅ Users can add/edit/delete income transactions
- ✅ Users can add/edit/delete expense transactions
- ✅ System enforces 500 TND cash limit
- ✅ System auto-generates voucher numbers
- ✅ Users can filter transactions by date, category, account
- ✅ Users can view financial dashboard with charts
- ✅ Users can export reports to PDF/Excel
- ✅ Users can print receipt vouchers
- ✅ Users can print payment authorizations
- ✅ Account balances update automatically

### Non-Functional Requirements
- ✅ All operations work offline
- ✅ Response time < 500ms for queries
- ✅ UI is intuitive for non-technical users
- ✅ All text is in Arabic (RTL)
- ✅ Data integrity maintained (balances always correct)
- ✅ No data loss during migration

### User Acceptance
- ✅ Client approves UI/UX
- ✅ Users can complete tasks without training
- ✅ System matches association's paper-based procedures
- ✅ Reports are accurate and useful

---

## Risk Management

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | Critical | Low | Mandatory backup, rollback plan, extensive testing |
| User confusion with new UI | High | Medium | Training materials, contextual help, gradual rollout |
| Performance issues | Medium | Low | Indexed queries, pagination, lazy loading |
| 500 TND rule too restrictive | Medium | Low | Easy to adjust threshold in code |
| Voucher number conflicts | High | Low | Database unique constraint, transaction locking |

---

## Future Enhancements (Post-Launch)

### Phase 2 Features
- [ ] Budget planning and tracking
- [ ] Multi-year financial comparisons
- [ ] Advanced charts (trends, forecasts)
- [ ] Recurring transactions (monthly rent, salaries)
- [ ] Bank reconciliation
- [ ] Multi-currency support (if needed)

### Phase 3 Features
- [ ] Approval workflow (for multi-user branches)
- [ ] Mobile app (view-only)
- [ ] Cloud backup (optional)
- [ ] Email reports
- [ ] SMS notifications for payments

---

## Glossary

| Term (Arabic) | Term (English) | Description |
|---------------|----------------|-------------|
| وصل إستلام | Receipt Voucher | Document for income transactions |
| إذن بالدفع | Payment Authorization | Document for expense transactions |
| الخزينة | Cash Box | Physical cash storage |
| رسوم الطلاب | Student Fees | Tuition and registration fees |
| التبرعات | Donations | Cash or in-kind contributions |
| الرواتب | Salaries | Employee compensation |
| المصاريف | Expenses | General expenditures |
| المخزون | Inventory | Physical assets |

---

## References

### Internal Documents
- `docs/DEVELOPMENT.md` - Development guidelines
- `docs/ARCHITECTURE.md` - Overall system architecture
- `docs/API_REFERENCE.md` - IPC API documentation
- `docs/TESTING.md` - Testing guidelines

### External Resources
- SQLite Documentation: https://www.sqlite.org/docs.html
- React Bootstrap: https://react-bootstrap.github.io/
- Electron IPC: https://www.electronjs.org/docs/latest/api/ipc-main

---

## Changelog

### Version 2.0 (Current)
- Complete redesign with unified transactions table
- New dashboard with charts and summaries
- Auto-generated voucher numbers
- 500 TND rule enforcement
- Removed Receipt Books module

### Version 1.0 (Legacy)
- Separate tables for payments, expenses, salaries, donations
- Basic CRUD operations
- Simple reporting

---

## Approval & Sign-off

**Prepared by:** AI Assistant  
**Reviewed by:** [Project Lead]  
**Approved by:** [Client]  
**Date:** [To be filled]

---

**End of Document**
