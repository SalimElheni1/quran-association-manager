# Financial Module — Sprint Plan (Regenerated)

**Project:** Quran Branch Manager
**Module:** Financial Management System
**Date regenerated:** 2026-08-08
**Basis:** Runtime audit `docs/dev/reports/financial-runtime-audit.md` + DB audit `docs/dev/reports/financial-db-schema-audit.md`
**Status:** Sprint 2 is the active sprint. Sprints 3–4 are the queued backlog.

> Rule of engagement (AGENTS.md): changes are strictly additive or confined to the files named in each task. Never delete unrelated features.

---

## Sprint 1 (COMPLETED — 2026-08-08, commit 564da01)

Restore fee settings and rewire charge generation for configurable academic year and payment frequency:
- Restored "إعدادات الرسوم" tab in `SettingsPage.jsx` (annual/monthly fee + payment-frequency selects + academic-year settings).
- Seeded fee settings via migration `050-seed-fee-settings.sql`.
- Applied configured academic year + payment frequency in `studentFeeHandlers.js` charge-creation paths.
- Fixed lint setup (eslint-plugin-jest) and cleaned lint errors across `src/` and `tests/`.

---

## Sprint 2 — Financial Core Integrity (ACTIVE)

Goal: make the financial numbers trustworthy — account balances, charge generation, credit handling, and working export buttons.

### H1. Update `accounts.current_balance` when recording student payments
- **Files:** `src/main/handlers/studentFeeHandlers.js` (recordStudentPayment, ~L1571-1587)
- **Bug:** BUG-18 (audit §B). Student payments insert a `transactions` INCOME row (account_id=1) but never call `updateAccountBalance`.
- **Work:**
  1. Reuse/import `updateAccountBalance` (financialHandlers.js:44-50) or inline the same `UPDATE accounts SET current_balance = current_balance + ?` inside the existing BEGIN/COMMIT transaction.
  2. Keep `account_id` dynamic-friendly (currently hardcoded `1`); if a settings key for default account exists, use it, else keep `1`.
  3. Add regression test: record payment → assert `accounts.current_balance` incremented by the full payment amount.
- **Done when:** paying a student fee increases `accounts.current_balance` atomically with the payment.

### H2. Wire the two broken export buttons (register orphaned export channels)
- **Files:** `src/main/index.js`; `src/main/services/financialExportService.js`
- **Bug:** A1+A2+A3 (audit §A). `financial-export:inventory-register` and `financial-export:financial-summary` are registered only in the never-imported `financialExportService.js`.
- **Work:**
  1. Register the two missing channels in `index.js` near the existing export registrations (L371-380), OR import `financialExportService.js` and call its `registerFinancialExportHandlers()` after removing the duplicate `cash-ledger` registration from one side. Prefer the latter (removes dead file usage) but avoid a second `ipcMain.handle` for `cash-ledger` — Electron throws on duplicates.
  2. Verify renderer→preload→main payload (`{ period }`) matches handler signatures.
- **Done when:** both buttons in `FinancialExportModal.jsx` produce the expected Excel file with no `No handler registered` error.

### H3. Fix credit consumption in `recordStudentPayment` (+ breakdown tracking)
- **Files:** `src/main/handlers/studentFeeHandlers.js` (L1425-1501)
- **Bug:** BUG-16 (CRITICAL) + BUG-17. Credit is decremented up front but never applied to the target charges; breakdowns don't include credit.
- **Work:**
  1. Inside the FIFO loop, satisfy each charge from credit first (decrement the CREDIT charge's `amount_paid`), then from new cash — or convert consumed credit into an `amount_paid` credit on the target charge.
  2. Insert `student_payment_breakdown` rows for credit consumption so `SUM(breakdown) == student_payments.amount`.
  3. Preserve the overpayment→credit path (L1510-1552) and its `notes` annotation.
- **Done when:** a student with an existing credit who pays cash is fully credited correctly (no loss), and breakdown sums reconcile.

### H4. Fix duplicate charge generation (billing-month dedupe + scheduler guard) — DONE (commit 35654b7)
- **Files:** `src/main/handlers/studentFeeHandlers.js` (L232-306, L428-680, L690-1100); `src/main/feeChargeScheduler.js` (L66-69); migration `051-add-billing-month-to-student-fee-charges.sql`
- **Bug:** BUG-1 (CRITICAL) + BUG-14 (HIGH) + BUG-6/9 + BUG-4 (dedupe fragility).
- **Work:**
  1. Add a structured period column to `student_fee_charges` (`billing_month TEXT` in `YYYY-YYYY-MM` = academic year + month), backfill from existing rows' `charge_date` using the configured `academic_year_start_month` setting (verified against a real SQLite DB).
  2. Change generation + dedupe + delete logic to key on `billing_month` (dedupe no longer uses `description LIKE` or `strftime('%m', charge_date)`).
  3. Fix scheduler guard to count `MONTHLY` charges by `billing_month` for the target period.
  4. Verified no `strftime('%m', charge_date)` remains in `src/main`; lint clean; jest results unchanged vs baseline (22 pre-existing failures, no new ones).
- **Done when:** running the scheduler on successive days produces exactly one charge per student per billed month; no duplicates.

### H5. Fix regeneration semantics (force param + never delete PAID charges + correct wiring) — DONE
- **Files:** `src/main/handlers/studentFeeHandlers.js` (L232, L428-680, L950-1100, L1804-1900)
- **Bug:** BUG-2 (HIGH) + BUG-5/8 (HIGH) + BUG-12 (HIGH) + BUG-10/11 (HIGH) + BUG-7.
- **Work:**
  1. Normalized `generateMonthlyFeeCharges(academicYear, month, { force, useTransaction })`; updated all callers (IPC `{ force: true }`, generateAllCharges `{ force, useTransaction: false }`, refreshAll ×2 `{ force: false }`, auto-generate `{ force: false }`, checkAndGenerate `{ useTransaction: false }`).
  2. Never delete a charge with `amount_paid > 0`; forced regeneration keeps paid charges (skip + log) and only deletes/recreates unpaid ones, in all four `DELETE FROM student_fee_charges` sites (force path, regen current/next month, refreshStudentCharges). Prevents `student_payment_breakdown` cascade loss.
  3. Re-pointed `student-fees:refreshAllStudentCharges` IPC to the real `refreshAllStudentCharges(academicYear, senderUserId)`; `refreshStudentsNeedingChargeRefresh` now regenerates per student via `triggerChargeRegenerationForStudent(student.id, { regenCurrentMonth: true, regenNextMonth: true })` instead of fabricated counters (removed unused month vars); function exported.
  4. Returns `success:false` for "student not found" (BUG-7).
- **Tests:** added `withTransaction` to `tests/mocks/db.js` (matches real `src/db/db.js` API); rewrote the `student-fees:refreshAllStudentCharges` describe in `studentFeeHandlers.comprehensive.spec.js` (eligible students incl. `fee_category IN ('CAN_PAY','SPONSORED')` assertion + no-eligible message case).
- **Result:** full jest suite went from 41 failed / 434 passed → 30 failed / 444 passed; same 23 failing suites (no new failures, 11 fixed). Lint clean.
- **Done when:** force regeneration behaves as documented without deleting payment history; refresh-all and selective refresh both do what their names say.

### H6. Fix `fee_payment` receipt-book CHECK constraint — DONE
- **Files:** migration `052-extend-receipt-type-check.sql` (table rebuild) + `src/main/services/receiptService.js` (L24, L53-65)
- **Bug:** D1 (audit §D, HIGH latent).
- **Work:**
  1. Rebuilt `receipt_books` via migration `052` with the CHECK extended to `('payment', 'donation', 'expense', 'salary', 'fee_payment')` (copy data → drop → rename → recreate `idx_receipt_books_status`). Verified against real SQLite: existing rows + FKs preserved, `fee_payment` book inserts succeed, bogus types still rejected, FK enforcement intact.
  2. Because `payments/donations/expenses/salaries` reference `receipt_books(id)` and FK enforcement is ON before migrations run, `DROP TABLE` alone fails (SQLite FK check on the implicit delete). Added FK toggling around each migration in `src/db/db.js` `runMigrations` (PRAGMA can't change inside a transaction; child refs are by name and survive the rename). This also future-proofs any later parent-table rebuilds.
  3. D2 documented (not unified — out of scope): `receiptService.generateReceiptNumber` (RCP-YYYY-NNNN, seeds `start-1`, L215) and legacy `handleGetNextReceiptNumber` (BK-…-NNNN, seeds `start`, receiptHandlers.js:61) both `UPDATE current_receipt_number` on the same book → double-increment/skips if both are used. Renderer only uses the legacy `receipt-books:get-next-number('payment')` path; the `receipts:generate` path is not exposed in preload (still latent). D3 noted: `recordStudentPayment` writes `transactions.receipt_type = 'رسوم الطلاب'` (Arabic, no CHECK) — differs from every `receipt_books` type.
- **Done when:** `receipts:generate` with `receiptType='fee_payment'` no longer throws on a fresh DB.

### H7. Fix latent update-transaction sign bug — DONE
- **Files:** `src/main/handlers/financialHandlers.js:233-306`
- **Bug:** re-applies balance using `oldTransaction.type` instead of `validatedData.type` (and the UPDATE never persisted a changed `type`).
- **Work:** added `type = ?` to the UPDATE SET + used `validatedData.type` for the balance re-apply, so INCOME→EXPENSE (or account) edits reverse and re-apply with the correct sign. New test `tests/financialHandlers.update.spec.js` proves an EXPENSE→INCOME edit produces `+100` on both balance adjustments (bug would give `-100`).
- **Done when:** balance math always reflects the stored transaction type.

### H8. Fix `backup_time` setting being silently dropped — DONE
- **Files:** `src/main/handlers/settingsHandlers.js` (Joi schema, L42-72); `src/renderer/pages/SettingsPage.jsx` (L617)
- **Bug:** E1 (audit §E). `backup_time` rendered in SettingsPage but absent from the Joi schema → `stripUnknown` dropped it on save; never persisted.
- **Work:** added `backup_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow('')` to the schema and `backup_time: '02:00'` to `defaultSettings`. Verified the real (non-mocked) schema accepts `03:30` and rejects `25:99` via node. New tests `tests/settings.backupTime.spec.js` cover the default, read-back, and save path (note: the shared `tests/mocks/joi.js` makes schema-validation assertions impossible in jest, hence node-level verification).
- **Done when:** saving settings preserves `backup_time` in the `settings` table.

**Sprint 2 exit criteria:** lint clean; all touched handlers covered by existing jest suites pass; new tests for H1/H3/H7; manual click-through of both export buttons.

---

## Sprint 3 — Reconciliation & Payment Lifecycle

### H9. Add balance reconciliation + reconcile on startup — DONE
- `recomputeAccountBalances()` (single `db.withTransaction`: reset `current_balance = initial_balance`, replay all `transactions` — INCOME adds, EXPENSE subtracts — then overwrite), exposed as `financial:reconcile` IPC + exported. Runs automatically at startup right after `db.initializeDatabase()`/migrations in `src/main/index.js`; idempotent and non-fatal, logs how many accounts were corrected. Tests: `tests/financialHandlers.reconcile.spec.js` (math + idempotence).

### H10. Student-payment refund / void / delete — DONE
- `deleteStudentPayment(paymentId)` and `refundStudentPayment(paymentId, userId)` in `src/main/handlers/studentFeeHandlers.js`, both atomic via `db.withTransaction`. Each reverses: charge `amount_paid`/`status` (recomputed per breakdown), breakdown rows, the overpayment credit created by that payment (`student_fee_charges.source_payment_id`, new migration 054), the linked `transactions` row / account balance. Delete removes the payment; refund keeps the row (`refunded` flag, migration 053) and records an EXPENSE reversal transaction. IPC: `student-fees:deletePayment`, `student-fees:refundPayment` (+ preload `studentFeesDeletePayment`/`studentFeesRefundPayment`). UI: `StudentFeesTab.jsx` now renders the previously-unused payment history with استرجاع/حذف buttons (confirm first). Tests in `tests/studentFeeHandlers.comprehensive.spec.js`.

### H11. Receipt uniqueness on `transactions.receipt_number` — DONE
- BUG-19: the `recordStudentPayment` duplicate-receipt check now also queries `transactions.voucher_number` (receipts are stored in that column), so a receipt already used by a unified `transactions` row is rejected with the friendly DUPLICATE_RECEIPT message instead of surfacing a raw UNIQUE constraint error. `handleAddTransaction` already guards itself (financialHandlers.js:264 maps `SQLITE_CONSTRAINT` on voucher_number to a clean Arabic error). New test: `tests/studentFeeHandlers.spec.js` "should reject a receipt already used in the unified transactions table".

### H12. Legacy financial module decision — DONE (retire)
- **Decision (user-confirmed): retire the legacy handlers** — `registerLegacyFinancialHandlers()` is unregistered in `src/main/index.js` (import removed), so `expenses/donations/salaries/payments` no longer receive new invisible-money writes. The `legacyFinancialHandlers.js` module, its DB tables, and the never-rendered legacy tabs are **kept** (data safety; `financialExport.spec.js`/`exportManager.spec.js` still require the module). Unused legacy tab files remain for Sprint 4's explicit approval. All money now flows through the unified `transactions` model.

### H13. ANNUAL billing model clarification — DONE
- Decision (user): annual-only — ANNUAL students get exactly one ANNUAL charge per academic year; the monthly generator skips them entirely (no monthly standard AND no monthly special fees).
- Implemented: `generateMonthlyFeeCharges` skips ANNUAL students outright; `calculateStudentMonthlyCharges` returns zero monthly fees for ANNUAL students (gated on having standard classes, so no extra settings queries otherwise); removed the now-dead `hasAnnualMonthlyCharge` monthly-charge guards in `refreshStudentCharges`.

### H14. Academic-year consistency + status scoping — DONE
- BUG-21: added `normalizeAcademicYear` (bare `"2026"` → `"2025-2026"`); `recordStudentPayment` stores the normalized year and derives year-end next-month years from the configured start month; `getPaymentHistory` normalizes the incoming year (and supports year-less lookups).
- BUG-22: `getStudentFeeStatus(studentId, academicYear?)` scopes sums to the given year; `student-fees:getStatus`/`getAll` + preload accept the year; `StudentFeesTab` defaults to the `YYYY-YYYY` format and passes the selected year when loading students.
- BUG-23: status totals and balance are rounded to cents so paid students never show a float residue.

### H15. `class_id`-aware payment allocation — DONE
- BUG-20: when `class_id` is provided, `recordStudentPayment` now allocates to that class's charges first (charges whose `related_class_id` matches are processed before the rest, regardless of due date), then falls back to the remaining outstanding charges.
- `related_class_id` was previously never populated: monthly-charge generation now sets it when the charge maps to a single enrolled class (`generateMonthlyFeeCharges`, `refreshStudentCharges`, and both branches of `triggerChargeRegenerationForStudent`; `calculateStudentMonthlyCharges` exposes `relatedClassId`). Charges from multiple/zero classes keep it null and fall back to plain FIFO. New test: `tests/studentFeeHandlers.spec.js` "should prioritize charges of the given class (class_id) during allocation".

### H16. Atomic annual-charge generation — DONE
- BUG-13: `generateAnnualFeeCharges` previously swallowed mid-loop errors via `.catch()` returning `{success:false}`; called from `generateAllCharges` (which wraps it in `BEGIN…COMMIT`), the swallowed failure let generation continue and `COMMIT` a half-populated charge set. The `.catch()` is removed — the error now propagates, so the real `db.withTransaction` rolls back (standalone) and `generateAllCharges`/`checkAndGenerateChargesForAllStudents` roll back the outer transaction (nested); the `student-fees:generateAnnualCharges` IPC handler surfaces the Arabic failure instead of a fake success. Tests: `tests/studentFeeHandlers.spec.js` "should generate annual charges for eligible students" (asserts INSERT) and "should rethrow on mid-loop failure instead of swallowing (BUG-13, no partial commit)" (replaces the stale BEGIN/ROLLBACK assertions the mocked `withTransaction` could never satisfy).

---

## Sprint 4 — Housekeeping & Dead Code (needs explicit user approval per task)

- A4/A5/A6 + E3: remove `useAccounts.js`, never-rendered legacy tabs (`ExpensesTab/DonationsTab/SalariesTab/PaymentsTab/ReportsTab.jsx`), and orphaned `ImportStep.jsx`. Each removal is a separate confirmed change. — DONE (commits `adaf076` A4, `17a961f` A5, `5a8277e` A6)
- D2/D3: unify receipt numbering systems and `receipt_type` vocabulary. — DONE
- BUG-4, BUG-7, BUG-15 residuals; extend charge-regeneration lock to all mutating paths. — DONE
- Re-run full audit at end of each sprint and update this file's status.

---

## Verification commands
- Lint: `npx eslint .`
- Tests: `npx jest tests/settingsHandlers.spec.js tests/settingsManager.spec.js tests/studentFeeHandlers.spec.js tests/studentFeeHandlers.comprehensive.spec.js`
