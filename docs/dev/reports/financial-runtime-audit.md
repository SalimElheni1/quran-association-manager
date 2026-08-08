# Financial Module Runtime Audit (Sprint 2 Planning Input)

**Date:** 2026-08-08
**Scope:** Runtime behavior of the financial module — IPC wiring, `accounts.current_balance` consistency, student-fee lifecycle, receipt/voucher numbering, renderer wiring. Complements the earlier DB schema audit (`docs/dev/reports/financial-db-schema-audit.md`, 2026-08-05).
**Method:** Full read of `src/main/handlers/*.js`, `src/main/services/*.js`, `src/main/feeChargeScheduler.js`, `src/main/preload.js`, `src/main/index.js`, and the financial renderer components. All line numbers below refer to current `main` (`dev-fix-finatial`).

---

## Resolution status (re-verified 2026-08-08, post Sprint 4)

All findings below have been resolved across Sprints 1–4 (branch `dev-fix-finatial`). Verification notes:

- **A1/A2/A3** — `financialExportService.js` is now imported (`index.js:56`) and its handlers registered; export buttons work.
- **A4** — `useAccounts.js` deleted (`adaf076`). **A5** — legacy tabs deleted (`17a961f`). **A6** — `ImportStep.jsx` deleted (`5a8277e`).
- **BUG-1 / BUG-14 / BUG-4 / BUG-6/9** — dedupe is now `billing_month = ?` in both `generateMonthlyChargesIfNeeded` (scheduler) and `generateMonthlyFeeCharges`.
- **BUG-2 / BUG-5 / BUG-8** — `force` handled; paid charges protected from deletion on force-regeneration.
- **BUG-3** — ANNUAL frequency resolution (any standard class ANNUAL → student ANNUAL) (H13).
- **BUG-7** — missing-student returns `{success:false}`; `refreshStudentCharges` throws.
- **BUG-10/11 / BUG-12** — `student-fees:refreshAllStudentCharges` wired to `refreshAllStudentCharges` (L2144); selective refresh regenerates.
- **BUG-13** — atomic annual generation, errors propagate (`227384d`).
- **BUG-15** — `runManualCheck` passes settings; wired to `fee-charges:runManualCheck` IPC; lock extended to `refreshStudentCharges` (`782d16e`).
- **BUG-16/17** — credit applies to charges via `creditPool` (L1478+).
- **BUG-18** — payments update `accounts.current_balance` (L1662) (H1).
- **BUG-19** — duplicate-receipt check covers `payments`, `donations`, `student_payments`, `transactions.voucher_number` (L1404-1430).
- **BUG-20** — class_id-aware FIFO allocation (`2a29b39`). **BUG-21/22/23** — year normalization + rounding (`ae1d079`).
- **D1** — migration `052-extend-receipt-type-check.sql`. **D2** — unified `receiptService.generateReceiptNumber`; seed `start-1` (`77761ab`). **D3** — `'fee_payment'` receipt_type on payment/refund transactions (`77761ab`).
- **E1** — `backup_time` persisted (H8). **E3** — dead code removed. **F1** — reconciliation added (H9). **F2** — refund/void/delete flows added (H10).
- **Remaining nuance:** `checkAndGenerateCharges` ignores `force` for real regeneration — `runManualCheck(settings, force=true)` only skips the disabled-gate, it does not force-recreate existing charges.

---

## A. IPC wiring — broken exports

| # | Finding | Severity |
|---|---|---|
| A1 | **`financial-export:inventory-register` has NO registered handler.** `FinancialExportModal.jsx:77` calls `exportInventoryRegister({ period })` (preload exposes it), but only `financialExportService.js:708` registers it and that file is **never imported**. Clicking "سجل الجرد" throws `No handler registered for 'financial-export:inventory-register'`. | HIGH (live) |
| A2 | **`financial-export:financial-summary` has NO registered handler.** Same story: renderer `FinancialExportModal.jsx:79`, registered only in `financialExportService.js:713` (dead file). Clicking "التقرير المالي" throws. | HIGH (live) |
| A3 | **`financialExportService.js` is orphaned and can't be naively imported.** Zero imports anywhere in `src/`. Its `registerFinancialExportHandlers()` (L701) also registers `financial-export:cash-ledger` (L703), which `index.js:371` already registers directly → double-`ipcMain.handle` would crash Electron at startup. Fix must remove one registration. | HIGH |
| A4 | `accounts:get`/`accounts:add` handlers exist (financialHandlers.js:729-735) and preload exposes `getAccounts`/`addAccount`, but **`useAccounts.js` is dead code** (no component imports it). | LOW (dead) |
| A5 | Legacy channels (`get-expenses`, `get-donations`, `get-salaries`, `get-payments`, `get-financial-summary`, etc.) registered in `legacyFinancialHandlers.js:434-456` are used only by never-rendered `ExpensesTab/DonationsTab/SalariesTab/PaymentsTab/ReportsTab.jsx`. | LOW (dead) |
| A6 | `ImportStep.jsx:55` calls `importExcelSequential(...)` which preload doesn't expose; file itself is orphaned. | LOW (dead) |

## B. `accounts.current_balance` consistency

Only two runtime writers update `current_balance`: `financialHandlers.js:46` (`updateAccountBalance`) and `importManager.js:1192`. There is **no reconciliation function** anywhere.

| Operation | file:line | Updates balance? | Correct? | In DB txn? |
|---|---|---|---|---|
| `handleAddTransaction` | financialHandlers.js:177-206 | Yes | Yes | Yes |
| `handleUpdateTransaction` | financialHandlers.js:253-286 | Yes | **Latent bug**: L286 re-applies with `oldTransaction.type` instead of `validatedData.type`. Masked today because `type` isn't in the UPDATE SET; breaks if type editing is ever added. | Yes |
| `handleDeleteTransaction` | financialHandlers.js:320-322 | Yes | Yes | Yes |
| `handleAddAccount` | financialHandlers.js:477 | Yes (init) | Yes | n/a |
| **`recordStudentPayment` (INSERT transactions, account_id hardcoded 1)** | **studentFeeHandlers.js:1571-1587** | **NO** | **Missing — BUG-18** | Yes |
| `importManager` `processTransactionRow` | importManager.js:1170-1196 | Yes | Yes (but hardcoded `WHERE id = 1`, L1192) | Yes |
| Legacy handlers (expenses/donations/salaries/payments) | legacyFinancialHandlers.js:29-288 | No | N/A — outside unified model | No |

**BUG-18 (H1):** every student-fee payment writes an INCOME `transactions` row but never increments `accounts.current_balance`. The cash-box balance drifts low by the sum of all student payments. Deleting such a transaction later (financialHandlers.js:320) reverses a balance never incremented → account drifts further negative. Renderer never displays `current_balance` (0 hits), so the drift is silent.

## C. Student-fee lifecycle — prioritized bugs

| # | Location | Severity | Description |
|---|---|---|---|
| BUG-1 | studentFeeHandlers.js:245,270-273; feeChargeScheduler.js:66-69 | **CRITICAL** | **Duplicate next-month charges.** `charge_date` is the creation date, not the billed month. Dedupe matches `strftime('%m', charge_date) = month`, so charges generated early for next month (25th+) never match → duplicated on every scheduler run. |
| BUG-14 | feeChargeScheduler.js:66-69 | **HIGH** | Scheduler dedupe guard always false: compares `created_at >= '${academicYear}-${month}-01'` where academicYear = `"2025-2026"` → string `"2025-2026-09-01"` is lexically > any real timestamp → COUNT always 0 → regenerates daily. |
| BUG-16 | studentFeeHandlers.js:1425-1501 | **CRITICAL** | **Credit consumed but never applied to charges.** Credit is decremented up front (L1437-1444) but the FIFO loop only applies the new-cash remainder (L1474-1501) → student loses the credit amount on every payment that uses credit. |
| BUG-17 | studentFeeHandlers.js:1482-1488 | MEDIUM | `student_payment_breakdown` rows only for cash applied to charges; credit consumption untracked → `SUM(breakdown) != student_payments.amount`. |
| BUG-2 | studentFeeHandlers.js:232 vs 1009/1022/1822/1776 | **HIGH** | `force` param dropped. Declared `(academicYear, month, force=false)` but callers pass `(…, useTransaction, force)`; the 4th arg is ignored → "refresh" regenerations never delete existing charges (no-op), while `student-fees:generateMonthlyCharges` passes `true` as 3rd arg → **force-deletes PAID charges** and cascades breakdown loss. |
| BUG-5 / BUG-8 | studentFeeHandlers.js:527-536,780-789 | **HIGH** | Unconditional delete of existing (possibly PAID) charges before regeneration → payment history/breakdowns lost. |
| BUG-12 | studentFeeHandlers.js:1860-1864 | **HIGH** | `student-fees:refreshAllStudentCharges` IPC is wired to `refreshStudentsNeedingChargeRefresh`, not `refreshAllStudentCharges` (which is exported but never invoked). |
| BUG-10/11 | studentFeeHandlers.js:950-1033 | HIGH | Selective refresh is a no-op (force dropped) + O(N²) full-table iteration with fabricated counts. |
| BUG-3 | studentFeeHandlers.js:193-195,293-306 | MEDIUM | ANNUAL students double-billed (ANNUAL charge + one monthly "دفع سنوي" charge); special-class fees billed monthly even for ANNUAL students. |
| BUG-19 | studentFeeHandlers.js:1355-1381 | MEDIUM | Duplicate-receipt check misses `transactions.receipt_number` (column exists since migration 037). |
| BUG-20 | studentFeeHandlers.js:1400,1458-1507 | MEDIUM | `class_id` recorded but ignored in FIFO allocation. |
| BUG-22 | studentFeeHandlers.js:1206 | MEDIUM | Fee status sums all academic years; UI year selector only affects history. |
| BUG-23 | studentFeeHandlers.js:1226 | MEDIUM | Float rounding: `balance` can be ±1e-13 → a paid student may show as UNPAID. |
| BUG-21 | studentFeeHandlers.js:1305,1396 | MEDIUM | Mixed academic-year formats: bare `"2026"` vs `"2025-2026"`. |
| BUG-13 | studentFeeHandlers.js:1972-2020 | MEDIUM | Partial annual-charge commit when `generateAnnualFeeCharges` fails mid-loop (error swallowed, then COMMIT). |
| BUG-6/9 | studentFeeHandlers.js:516,533,786-787 | MEDIUM | Month-keyed deletes hit/miss early-created next-month charges (same root cause as BUG-1). |
| BUG-15 | feeChargeScheduler.js:222 | LOW | `runManualCheck(settings, force)` calls `checkAndGenerateCharges(force)` — force passed as settings; never wired to IPC. |
| BUG-4 | studentFeeHandlers.js:271 | LOW | Dedupe by `description LIKE '%month%'` is fragile (Arabic month names as substrings). |
| BUG-7 | studentFeeHandlers.js:454 | LOW | "Student not found" returned as `success: true`. |

## D. Receipt / voucher numbering

| # | Finding | Severity |
|---|---|---|
| D1 | **`receipt_books.receipt_type` CHECK (migration 017:10) only allows `('payment','donation','expense','salary')`, but `receiptService.js:24` defaults to `'fee_payment'`** (and `studentFeeHandlers.js:1882` passes `'fee_payment'`). When no active book exists, the INSERT (receiptService.js:53-65) violates the CHECK → throws. Currently latent (IPC `receipts:generate` not exposed in preload), but a time-bomb for fee-receipt generation. | HIGH (latent) |
| D2 | Dual numbering systems on the same book: `receiptService.generateReceiptNumber` (RCP-YYYY-NNNN, L79) and legacy `handleGetNextReceiptNumber` (receiptHandlers.js:131-132, BK-…-NNNN) both `UPDATE current_receipt_number` → double-increments/skips. Inconsistent seed: receiptService L215 seeds `start-1`, receiptHandlers.js:61 seeds `start`. | MEDIUM |
| D3 | `recordStudentPayment` writes `receipt_type = 'رسوم الطلاب'` (Arabic, no CHECK) into `transactions` (L1574) — differs from every `receipt_books` type. | LOW |

## E. Renderer settings flow

| # | Finding | Severity |
|---|---|---|
| E1 | **`backup_time` is rendered in SettingsPage.jsx:617 but absent from the Joi schema (settingsHandlers.js:42-72)** → silently dropped on save (stripUnknown). Never persists. | MEDIUM |
| E2 | Fee keys (`annual_fee`, `standard_monthly_fee`, payment frequencies, academic-year settings) now flow correctly after Sprint 1. | OK |
| E3 | `useAccounts.js`, legacy tabs, and `ImportStep.jsx` are dead code (see A4/A5/A6). Removal requires user confirmation per project rule. | LOW |

## F. Missing features (structural gaps)

1. **No reconciliation** — nothing recomputes `accounts.current_balance` from `transactions`; drift is permanent and undetectable (exports recompute from ledger independently).
2. **No student-payment refund/void/delete** — no IPC deletes a `student_payments` row or reverses charge/breakdown/credit/transaction/balance effects.
3. **All exports compute balance from ledger + `initial_balance`** (cashLedgerExport.js:6-18, financialExportService.js:19-49, financialWordExportService.js:34-52) — `current_balance` is a 4th conflicting number nobody reads.

## Severity-ordered backlog

1. **CRITICAL** BUG-1 + BUG-14 — duplicate charge generation (billing-month dedupe + scheduler guard).
2. **CRITICAL** BUG-16 (+BUG-17) — credit consumed but not applied to charges.
3. **HIGH** BUG-18 — student payments never update `accounts.current_balance` (H1).
4. **HIGH** A1+A2+A3 — two export buttons broken; `financialExportService.js` orphaned (H2).
5. **HIGH** BUG-2 + BUG-5/8 — destructive/ineffective regeneration (force param + deleting PAID charges).
6. **HIGH** BUG-12 + BUG-10/11 — refresh-all wired to wrong function; selective refresh no-op.
7. **HIGH (latent)** D1 — `fee_payment` receipt-book CHECK constraint.
8. **MEDIUM** BUG-3, BUG-13, BUG-19, BUG-20, BUG-22, BUG-23, BUG-21, BUG-6/9, D2, D3, E1.
9. **LOW** BUG-4, BUG-7, BUG-15, dead code (A4/A5/A6, E3).
