# Financial Module - Quick Reference

## Pages

- **FinancialDashboard.jsx** - Overview with charts and reports
- **IncomePage.jsx** - Manage income transactions
- **ExpensesPage.jsx** - Manage expense transactions
- **AccountsPage.jsx** - Manage accounts

## Components

- **TransactionModal.jsx** - Add/Edit form
- **TransactionTable.jsx** - Transaction list
- **TransactionFilters.jsx** - Filter controls
- **VoucherPrintModal.jsx** - Print vouchers
- **SummaryCard.jsx** - Metric display
- **CategoryChart.jsx** - Category breakdown
- **PeriodSelector.jsx** - Date range selection

## Hooks

- **useTransactions(filters)** - Fetch transactions
- **useAccounts()** - Fetch accounts
- **useCategories(type)** - Fetch categories
- **useFinancialSummary(period)** - Fetch summary

## Validation

- 500 TND rule: Amounts > 500 must use CHECK or TRANSFER
- Required: date, type, category, amount, description, payment_method, account_id

## Voucher Format

- Income: R-YYYY-#### (e.g., R-2024-0001)
- Expense: P-YYYY-#### (e.g., P-2024-0001)

## Documentation

- User Guide: `docs/user/financial.md`
- Technical: `docs/dev/specs/financial-spec.md`
