# Financial Module

How money is recorded, as implemented. The user-facing guide is
[docs/user/financial.md](../../user/financial.md) (Arabic). The original 2024 design plan is in
[docs/archive/financial-redesign-plan-2024.md](../../archive/financial-redesign-plan-2024.md).

Amounts are Tunisian dinars (TND) stored as `REAL`, rounded with `roundCurrency` (3 decimals);
student fees are rounded to cents (millimes are not billed).

## Parts

| Part | Tables | Main code |
|---|---|---|
| Income and expenses | `transactions`, `categories`, `accounts` | `handlers/financialHandlers.js`, `services/voucherService.js` |
| Student fees | `student_fee_charges`, `student_payments`, `student_payment_breakdown` | `handlers/studentFeeHandlers.js`, `feeChargeScheduler.js` |
| Receipt books | `receipt_books` | `handlers/receiptHandlers.js`, `services/receiptService.js` |
| In-kind donations and inventory | `inventory_items`, `in_kind_categories` | `handlers/inventoryHandlers.js`, `handlers/financialHandlers.js` |
| Reports | (reads the above) | `services/financialExportService.js`, `financialWordExportService.js`, `cashLedgerExport.js`, `inventoryLedgerExport.js` |

UI: `FinancialsPage` with tabs for the dashboard (`FinancialDashboard`), income (`IncomePage`),
student fees (`components/financial/StudentFeesTab`), expenses (`ExpensesPage`), in-kind
donation categories («إدارة الفئات», `AccountsPage`, despite its name), inventory (`InventoryTab`)
and reports (`FinancialReportsTab`). Accounts have no page of their own.

The old per-type tables (`payments`, `salaries`, `donations`, `expenses`) still exist and are read
by the financial Excel export through the getters in `legacyFinancialHandlers.js`. Nothing writes to
them any more, and they have no IPC channels.

## Income and Expenses (`transactions`)

One row per movement of money.

| Field | Values / meaning |
|---|---|
| `type` | `INCOME` or `EXPENSE` |
| `category` | A category name (`categories`, per type). Defaults: income «التبرعات النقدية», «التبرعات العينية», «مداخيل أخرى»; expenses «منح ومرتبات», «كراء وفواتير», «الفعاليات والتكوين والتنقلات», «المسابقات والجوائز», «لوازم مكتبية وصيانة», «نفقات متنوعة». |
| `payment_method` | `CASH`, `CHECK` (`check_number`) or `TRANSFER` |
| `voucher_number` | Unique, typed by the user (required, except for in-kind donations); can be corrected when editing. Excel imports without one get `R-YYYY-NNNN` (income) / `P-YYYY-NNNN` (expense) from `voucherService.js`. |
| `receipt_number`, `receipt_type` | Receipt from a receipt book, when one is used |
| `account_id` | The account the money goes into or out of |
| `related_entity_type` / `related_entity_id` / `related_person_name` | Who it concerns (student, teacher, donor…) |
| `requires_dual_signature` | Set for amounts over 500 TND |
| `matricule`, `created_by_user_id` | Traceability |

Rules:

- **Cash limit:** an amount over 500 TND cannot be paid in cash; it must be a cheque or a
  transfer (enforced on add and update).
- **In-kind donations** (category «التبرعات العينية»): recorded from the inventory tab, the
  renderer saves an `INCOME` transaction (item details as JSON in `description`) and then an
  inventory item (`acquisition_source` «تبرع»). These are two separate calls, not one
  transaction. Recorded from the income page, only the transaction is saved. A clashing voucher
  number on an in-kind donation is made unique (`INK-…`) instead of rejected.
- **Accounts:** each transaction moves the account's `current_balance`. On startup every
  balance is recomputed from `initial_balance` and the transactions, so a drift cannot persist.
  A fresh database has one cash account, «الخزينة».

## Student Fees

### Who pays what

- A student's `fee_category` is `CAN_PAY`, `SPONSORED` (paid by a sponsor, whose name and phone
  are kept on payments) or `EXEMPT` (never billed). Only active, non-exempt students are billed.
- `discount_percentage` reduces every fee; the result is rounded to cents.
- **Fee amounts** come from the student's age group (`annual_fee`, `monthly_fee`); a group with
  empty fees uses the branch fees from the settings (`annual_fee`, `standard_monthly_fee`).
  A student in classes of several age groups with different fees pays the higher one and is
  flagged until an administrator picks the group (`setStudentFeeGroup`).
- **Payment frequency** comes from the age groups of the student's classes: if any is `ANNUAL`,
  the student pays annually, otherwise monthly.
- Special classes can carry their own fee, added to the monthly charge.

### Charges (`student_fee_charges`)

| Field | Meaning |
|---|---|
| `fee_type` | `ANNUAL`, `MONTHLY`, or `CREDIT` (an overpayment kept for later) |
| `academic_year` | `YYYY-YYYY`, from the configured start month (`academic_year_start_month`, default 9) |
| `billing_month` | `YYYY-MM` for monthly charges; one charge per student and month |
| `amount`, `amount_paid`, `status` | `UNPAID`, `PARTIALLY_PAID` or `PAID` |
| `source_payment_id` | For `CREDIT` rows, the payment that created it |

Billing rules:

- **A month is billed once it starts.** Adding a student, changing classes or recording a payment
  bills the annual charge and the current month only (`refreshStudentCharges`).
- **Next month** is billed by the scheduler from the configured generation day
  (`charge_generation_day`, default 25), under the academic year that month belongs to.
- **Paid or partly paid charges are never changed.** Re-billing (a fee change, a new age group)
  only replaces charges with nothing paid on them.
- Charges are generated inside a transaction with a per-student lock, so concurrent refreshes
  cannot create duplicates.

### Payments (`student_payments`, `student_payment_breakdown`)

Recording a payment (`recordStudentPayment`), in one transaction:

1. checks the receipt number is not used anywhere (student payments, transactions, older tables);
2. uses the student's existing credit first (oldest first), then the new amount, on the
   **same academic year's** unpaid charges, oldest due date first; each allocation is a
   `student_payment_breakdown` row;
3. keeps any remainder as a `CREDIT` charge, which later payments use whatever their year;
4. records the matching `INCOME` transaction (`transaction_id`) and updates the account.

Earlier years' unpaid charges are **arrears**: they are shown per year in the fee details and paid
from there, never taken by a current-year payment.

- **Delete** reverses a payment as if it never happened: charges, breakdown rows, the credit it
  created, its transaction and the account balance.
- **Refund** reverses the same way but keeps the payment, marked `refunded`, and records an
  `EXPENSE` transaction for the money returned.

## Receipt Books (`receipt_books`)

A book is a numbered range (`start_receipt_number`–`end_receipt_number`) of one `receipt_type`
(`payment`, `donation`, `expense`, `salary`, `fee_payment`), with a `current_receipt_number` and
a status (`active`, `completed`, `cancelled`). `receipts:generate` hands out the next number,
`RCP-YYYY-NNNN`, from the active book of that type for the current year, creating one if there is
none.

## Settings

| Key | Default | Meaning |
|---|---|---|
| `academic_year_start_month` | 9 | Month the academic year starts |
| `annual_fee`, `standard_monthly_fee` | 0 | Branch fees (age groups can override) |
| `auto_charge_generation_enabled` | true | Whether the scheduler bills months automatically |
| `charge_generation_day` | 25 | Day of the month from which next month is billed |

The scheduler bills at startup and every 24 hours while the app is open. Older databases also
store `charge_generation_frequency`, `pre_generate_months_ahead`, `last_charge_generation_check`
and `men_/women_/kids_payment_frequency`; nothing reads them (payment frequency belongs to age
groups) and saving the settings ignores them.

## Reports

Financial exports cover a period: the financial report (Excel, PDF or Word), the financial
summary, the cash ledger, and the inventory ledger and register (`financial:export-*` and
`financial-export:*` channels). The financial dashboard shows a period's totals,
the monthly fees chart and the current academic year («السنة الدراسية الحالية»).
