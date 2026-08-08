# Financial DB Schema & Migration Consistency Audit

**Date:** 2026-08-05
**Scope:** Read-only audit. No fixes proposed.
**Audited area:** `src/db/db.js` migration runner, all migrations `src/db/migrations/001-049`, base schema `src/db/schema.js`, and financial handlers/services that read or write these tables (`financialHandlers.js`, `studentFeeHandlers.js`, `receiptHandlers.js`, `inventoryHandlers.js`, `settingsHandlers.js`, `settingsManager.js`, `feeChargeScheduler.js`, `legacyFinancialHandlers.js`, `receiptService.js`, `matriculeService.js`, `validationSchemas.js`, import/export services, renderer components).

---

## A. Migration runner and ordering (`src/db/db.js`)

| Finding | Severity |
|---|---|
| **Sort is plain lexical** — `db.js:165` `fs.readdirSync(migrationsDir).sort()`. Because every prefix is a zero-padded 3-digit number (001–049), lexical sort == numeric sort. Ordering across `'030-'`, `'031-'`, `'032-'`, `'033-'`, `'034-'`, `'035-'` is correct. | INFO (correct) |
| **No numeric gaps** — every prefix 001→049 exists. Nothing skips a number that would reorder later files. | INFO |
| **Both files in each duplicate-prefix group run.** The `migrations` table (`schema.js:39-43`) records rows by full filename (`db.js:174`), so distinct filenames with the same numeric prefix are treated as separate migrations: `027-create-memorization-tables.sql` and `027-update-matricule-to-4-digits.sql` both run (create first, then update); both `037-*` run; both `043-*` run. | INFO (expected, but see B) |
| **`'duplicate column name'` catch-all** (`db.js:188-193`): any migration error whose message contains that string is silently marked applied. On a *fresh* DB, every migration that begins with an `ALTER TABLE ... ADD COLUMN` already present in `schema.js` aborts at its first statement, and **all trailing statements in that same file are silently skipped**. Concrete losses on fresh DBs: | MEDIUM |
| | |
| `001-update-users-table.sql:3-16` — first `ALTER` fails, so the partial-unique indexes `idx_users_national_id` / `idx_users_email` (`001:20-21`) are **never created** on a fresh DB (uniqueness of `users.national_id`/`email` is unenforced). | MEDIUM |
| `014-add-onboarding-columns.sql:2-3` — `need_guide`/`current_step` already in schema (`schema.js:19-20`), whole file swallowed; its UPDATEs (`014:5-6`) skipped (benign on fresh DBs). | LOW |
| `044-add-gender-policy-to-age-groups.sql:7` — `gender_policy` already in schema (`schema.js:223`); whole file swallowed, incl. the UPDATEs at `044:10-16` (benign on fresh DBs, but on *old* DBs it runs fine). | LOW |
| `045-add-age-group-id-to-classes.sql:6` — `age_group_id` already in schema (`schema.js:114`); file swallowed on fresh DB, so index `idx_classes_age_group_id` (`045:9`) is also skipped. | LOW |

## B. Duplicate/redundant migration files

| Finding | Severity |
|---|---|
| `027-update-matricule-to-4-digits.sql` and `028-update-matricule-to-4-digits.sql` are **byte-for-byte the same content** (same 5 UPDATEs). Both run; `028` is a redundant re-run. `037-fix-matricule-format-consistency.sql` repeats the same conversions a third time. | LOW (redundancy) |
| `045-add-age-group-id-to-classes.sql` and `047-add-age-group-id-to-classes.sql` both add the **same column** `classes.age_group_id`. On any DB, `047:5` (`ALTER TABLE classes ADD COLUMN age_group_id INTEGER REFERENCES age_groups(id)`) always hits `duplicate column` and is swallowed → the **`REFERENCES age_groups(id)` FK clause that only exists in 047 is never applied** on upgraded DBs (schema.js fresh DBs get the FK from `schema.js:116`, but old DBs never do). | MEDIUM |
| `046-migrate-classes-to-age-groups.sql` and `049-migrate-classes-to-age-groups-final.sql` are the **same migration** (identical UPDATEs). | LOW |
| `026-remove-role-column.sql:7-30` creates `users_new` but **never copies data, never drops `users`, never renames** — the migration is a no-op for its stated purpose. On every DB it leaves a **stray empty `users_new` table**; on old DBs the `role` column is never removed. | MEDIUM |
| `037-add-receipt-number-to-transactions.sql` (`037-add-receipt-number`…:4) runs correctly; `038-add-matricule-to-transactions.sql:4` adds `matricule` a second time (already added by `025-add-transaction-matricule.sql:4`) → **always swallowed via the duplicate-column catch; it is dead code**. The doc comment in `038` ("student matricule for easy reference") contradicts `025`'s intent (auto-generated transaction ref) — two migrations reuse the same column name for different meanings; the unique index from `025:6` is the one that survives. | MEDIUM |

## C. Final effective schema of financial tables (as applied by db.js)

### `transactions` (result of 018 → 023 → 024 → 025 → 037; 038 no-op)
Columns, in final order: `id`, `transaction_date DATE NOT NULL`, `type TEXT CHECK('INCOME','EXPENSE')`, `category TEXT NOT NULL`, `amount REAL NOT NULL`, `description TEXT` (nullable — NOT NULL dropped by 024), `payment_method TEXT CHECK('CASH','CHECK','TRANSFER')`, `check_number`, `voucher_number` (no standalone unique), `related_entity_type`, `related_entity_id`, `related_person_name`, `account_id INTEGER NOT NULL` (no FK), `requires_dual_signature INTEGER DEFAULT 0`, `receipt_type TEXT` (023), `created_by_user_id`, `created_at`, `updated_at`, `matricule TEXT` + **UNIQUE index `idx_transactions_matricule`** (025), `receipt_number TEXT` (037). Table-level **`UNIQUE(voucher_number, type)`** (024).

### `accounts` (018 only)
`id`, `name NOT NULL`, `type CHECK('CASH','BANK')`, `account_number`, `initial_balance REAL DEFAULT 0`, `current_balance REAL DEFAULT 0`, `is_active DEFAULT 1`, `created_at`. Seeded row `id=1 'الخزينة' CASH` (018:47-48). No later migrations touch it.

### `categories` (018, then 020 DELETEs INCOME and re-inserts, 021 DELETEs EXPENSE and re-inserts)
`id`, `name UNIQUE NOT NULL`, `type CHECK('INCOME','EXPENSE')`, `description`, `is_active`. Final seeded rows: 3 INCOME (التبرعات النقدية/العينية، مداخيل أخرى), 6 EXPENSE (منح ومرتبات، كراء وفواتير، الفعاليات والتكوين والتنقلات، المسابقات والجوائز، لوازم مكتبية وصيانة، نفقات متنوعة).

### `in_kind_categories` (019 only)
`id`, `name UNIQUE NOT NULL`, `is_system DEFAULT 0`, `is_active DEFAULT 1`. 4 seeded rows (019:12-16).

### `student_fee_charges` (030 + 042)
`id`, `student_id NOT NULL FK→students`, `charge_date DATE NOT NULL`, `due_date`, `fee_type TEXT NOT NULL` (no CHECK — `'CREDIT'`/`'ANNUAL'`/`'MONTHLY'` all allowed), `description`, `amount REAL NOT NULL`, `amount_paid REAL DEFAULT 0`, `status DEFAULT 'UNPAID' CHECK('UNPAID','PARTIALLY_PAID','PAID')`, `academic_year`, `related_class_id FK→classes`, `created_at`, `payment_frequency TEXT DEFAULT 'MONTHLY' CHECK('MONTHLY','ANNUAL')` (042).

### `student_payments` (031 + 043)
`id`, `student_id NOT NULL FK`, `amount REAL NOT NULL`, `payment_date`, `payment_method`, `payment_type`, `academic_year`, `notes`, `check_number`, `receipt_number`, `class_id TEXT` (comment says "Class matricule for SPECIAL payments"), `transaction_id INTEGER FK→transactions ON DELETE SET NULL`, `created_at`, `updated_at`, `sponsor_name`, `sponsor_phone` (043).

### `student_payment_breakdown` (032, dropped & recreated identically by 035)
`id`, `student_payment_id NOT NULL FK→student_payments ON DELETE CASCADE`, `student_fee_charge_id NOT NULL FK→student_fee_charges ON DELETE CASCADE`, `amount REAL NOT NULL`, `created_at`.

### `receipt_books` (017 only)
`id`, `book_number UNIQUE NOT NULL`, `start_receipt_number`, `end_receipt_number`, `current_receipt_number`, `receipt_type CHECK('payment','donation','expense','salary')`, `status DEFAULT 'active' CHECK('active','completed','cancelled')`, `issued_date DATE NOT NULL`, `notes`, `created_at`, `updated_at`; indexes `idx_receipt_books_status` (017:47).

### `inventory_items` (schema.js + 012 + 029)
`id`, `matricule UNIQUE NOT NULL`, `item_name NOT NULL`, `category NOT NULL`, `quantity DEFAULT 0`, `unit_value`, `total_value`, `acquisition_date`, `acquisition_source`, `condition_status`, `location`, `notes`, `created_at`, `updated_at`. `UNIQUE(item_name COLLATE NOCASE)` from `schema.js:158` is **dropped** by 029's table rebuild — consistent with `inventoryHandlers.js:72-75` which always returns `{isUnique:true}`.

## D. Code-vs-schema mismatches

| Location | Finding | Severity |
|---|---|---|
| `studentFeeHandlers.js:1687-1688` + `receiptService.js:24,53-65` vs `017-create-receipt-management.sql:10` | `receipts:generate` defaults `receiptType='fee_payment'`, and `generateReceiptNumber()` auto-creates a receipt book with that value. The `receipt_books.receipt_type` CHECK only allows `('payment','donation','expense','salary')`. When no active `fee_payment` book exists (the normal case) the INSERT **violates the CHECK constraint** and the whole handler throws. The renderer currently only uses `getNextReceiptNumber('payment')` (`PaymentFormModal.jsx:104`), so this path is latent, but the IPC handler is a time-bomb. | HIGH (latent) |
| `025-add-transaction-matricule.sql:6` + `038-add-matricule-to-transactions.sql:4` | `matricule` added twice; `038` always swallowed. Not a functional error today, but the effective schema depends on the `'duplicate column name'` catch rather than on the migration intent. | MEDIUM |
| `027-create-memorization-tables.sql:37-76` vs `schema.js:52-81` | Rebuilds `students` and **silently drops `branch_id` and `memorization_level`** on fresh DBs (the `students_new` schema lacks both; the INSERT copy at `027:69-70` only lists surviving columns). `memorization_level` is consumed by `exportManager.js:175`, `importManager.js:656`, `seederFunctions.js:444`, and rendered by `StudentDetailsModal.jsx:141-144` / `StudentsPage.jsx:37,60` → all read `undefined` after a fresh install. `studentFields` in `studentHandlers.js:49-80` excludes both columns, so app INSERTs/UPDATEs don't error. | MEDIUM |
| `009-alter-salaries-table.sql:1-3` (no-op) vs `006-create-financial-tables.sql:17-26` vs `legacyFinancialHandlers.js:157` | On upgraded DBs the `salaries` table keeps the **`teacher_id`** shape from 006; `legacyFinancialHandlers` INSERTs into `(user_id, user_type, …)`. Fresh DBs get `user_id, user_type` from `schema.js:192-201`. The effective schema therefore **differs by install path**, and the INSERT fails on old DBs. | MEDIUM |
| `financialHandlers.js:178-184` INSERT columns | All 16 columns exist in final `transactions` (verified in §C). No mismatch. | INFO |
| `financialHandlers.js:261-267` UPDATE columns | `category, amount, transaction_date, description, payment_method, check_number, account_id, related_person_name, related_entity_type, related_entity_id, requires_dual_signature, receipt_type, updated_at` — all exist. | INFO |
| `studentFeeHandlers.js:1378-1380` transactions INSERT | All 14 columns exist; `matricule` intentionally NULL (permitted by SQLite UNIQUE). `receipt_type` hardcoded `'رسوم الطلاب'`. No mismatch. | INFO |
| `validationSchemas.js:266-267` | `transactionValidationSchema` validates `class_id` and `donor_cin`, but **`transactions` has no such columns**. Harmless today because `financialHandlers.js:160` uses `stripUnknown:false` but the explicit INSERT column list ignores them — still a schema/validation divergence. | LOW |
| `studentFeeHandlers.js:1320-1355` | Overpayment credit INSERT into `student_fee_charges` uses `fee_type='CREDIT'` (allowed — no CHECK on fee_type), `status='PAID'` (allowed), and `amount=0, amount_paid=<credit>`. Consistent with `getStudentFeeStatus` (`studentFeeHandlers.js:1020-1027`). | INFO |
| `receiptService.js:79` vs `recordStudentPayment` `studentFeeHandlers.js:1377-1392` | `generateReceiptNumber` builds `RCP-YYYY-NNNN` and `recordStudentPayment` stores it in `transactions.voucher_number` (not `receipt_number`), while `cashLedgerExport.js:200` reads `voucher_number || receipt_number || check_number`. Consistent enough, but `transactions.receipt_number` (037) is populated by no code path — only `receipt_type` is. | LOW |
| `importManager.js:1163-1172` | Inserts `matricule` from import data into `transactions.matricule` — value is a **student matricule** (`S-xxxx`), not an `I-YYYY-NNN` ref, so it coexists in the same unique column as the generated refs from `financialHandlers.js:38`. No conflict today (NULL refs + distinct values), but same column, two meanings (same issue as 025 vs 038). | LOW |

## E. Settings table — full key inventory

All keys that exist in the DB (`settings` table) across `schema.js` + migrations:

| Key | Seeded value | Source |
|---|---|---|
| `national_association_name` | `'الرابطة الوطنية للقرآن الكريم'` | schema.js:242 |
| `regional_association_name` | `''` | schema.js:243 |
| `local_branch_name` | `''` | schema.js:244 |
| `national_logo_path` | `'g247.png'` | schema.js:245 |
| `regional_local_logo_path` | `''` | schema.js:246 |
| `backup_path` | `''` | schema.js:247 |
| `backup_enabled` | `'false'` | schema.js:248 |
| `backup_frequency` | `'daily'` | schema.js:249 |
| `president_full_name` | `''` | schema.js:250 |
| `backup_reminder_enabled` | `'true'` | schema.js:251 |
| `backup_reminder_frequency_days` | `'7'` | schema.js:252 |
| `cloud_backup_enabled` | `'false'` | schema.js:253 |
| `google_account_email` | `''` | schema.js:254 |
| `google_connected` | `'false'` | schema.js:255 |
| `adultAgeThreshold` | `'18'` | 005:17 |
| `adult_age_threshold` | `'18'` | 013:1 |
| `auto_charge_generation_enabled` | `'true'` | 036:5 |
| `charge_generation_frequency` | `'daily'` | 036:6 |
| `pre_generate_months_ahead` | `'2'` | 036:7 |
| `last_charge_generation_check` | **NULL** | 036:8 |
| `men_payment_frequency` | `'MONTHLY'` | 039:5 |
| `women_payment_frequency` | `'MONTHLY'` | 039:6 |
| `kids_payment_frequency` | `'MONTHLY'` | 039:7 |
| `academic_year_start_month` | `'9'` | 040:5 |
| `charge_generation_day` | `'25'` | 040:6 |

### Settings findings

| Finding | Severity |
|---|---|
| **`annual_fee` and `standard_monthly_fee` are never seeded in the DB** — neither in `schema.js:241-255` nor in any migration. They exist only as JS defaults (`settingsHandlers.js:77-78`, `annual_fee: 0`, `standard_monthly_fee: 0`). They enter the DB only when the user saves settings via `settings:update` (`settingsHandlers.js:154`). Direct DB reads (`studentFeeHandlers.js:91,139,217,584,955` via `getSetting`) return NULL → `parseFloat('0')`, which is handled, but the keys are absent on a fresh DB. | MEDIUM |
| **`cloud_backup_frequency` is also JS-default only** (`settingsHandlers.js:71`) and in the Joi schema (`settingsHandlers.js:55`), never seeded in DB. | LOW |
| **Dual key for the same setting**: `adultAgeThreshold` (camelCase, 005) and `adult_age_threshold` (snake_case, 013) both exist. `settingsHandlers.js:89-91` maps only the snake_case key; both merge onto `acc.adultAgeThreshold`. `settingsManager.js:26-27` provides fallback 18, and `settings:update` deletes both (`settingsHandlers.js:133-134`). Redundant rows, identical values — no functional divergence, but duplicated state. | LOW |
| **`national_logo_path` has three different "defaults"**: `'g247.png'` in schema.js:245, `''` in 005:11 (ignored on fresh DB via INSERT OR IGNORE), and `'assets/logos/icon.png'` in `settingsHandlers.js:64`. Effective fresh-DB value is `'g247.png'`, which `validateLogoPath` (`settingsHandlers.js:124-129`) will typically reject at next save, resetting to the JS default. | LOW |
| **`last_charge_generation_check` is the only key seeded with NULL** (036:8). | INFO |
| **Seeded but never read** (dead settings): `men_payment_frequency`, `women_payment_frequency`, `kids_payment_frequency` (039) — only Joi-validated (`settingsHandlers.js:49-51`); no handler or scheduler consumes them, and every charge INSERT hard-codes `payment_frequency='MONTHLY'` (`studentFeeHandlers.js:188,411,485,652`). `charge_generation_frequency` and `pre_generate_months_ahead` (036) are likewise unused — the scheduler reads only `auto_charge_generation_enabled`, `academic_year_start_month`, `charge_generation_day` (`feeChargeScheduler.js:100-101,143-144,180`). | LOW |
| `settings:update` writes keys via `INSERT OR REPLACE` (`settingsHandlers.js:154`) — consistent with `key TEXT PRIMARY KEY` (`schema.js:139`). | INFO |

## F. Additional migration-consistency notes

| Finding | Severity |
|---|---|
| `schema.js` (`students`, `classes`, `inventory_items`, `age_groups`) already contains the final column sets, so the *fresh-install* effective schema is shaped by **schema.js + whichever migrations mutate/drop/recreate tables** (024, 026, 027, 029, 035). These five are the only ones that structurally diverge from schema.js, and three of them (026, 027, 029) diverge unintentionally. | MEDIUM |
| `048-initialize-default-age-groups.sql:8` seeds a 4th group `'teens-12-17'` that schema.js:258-265 and 043 do not — fresh DBs end with 8 groups vs the 7 declared in schema.js. `classHandlers.js:230,357` and the age-group matching logic tolerate this, but the seeded set differs from the base schema. | LOW |
| `002-fix-user-role-constraint.sql:3` (`SELECT 1`) and `009` are no-op stubs kept for history — fine, but `009`'s no-op is the root of the old-DB `salaries.user_id` mismatch (see §D). | INFO |

## Summary of highest-severity items

1. **HIGH (latent)** — `receipt_books.receipt_type` CHECK constraint (017:10) vs `'fee_payment'` auto-book creation in `receiptService.js:53-65` via `studentFeeHandlers.js:1687-1688`.
2. **MEDIUM** — `038` always swallowed (duplicate `matricule`); effective column depends on `db.js:188` catch-all.
3. **MEDIUM** — `027` fresh-DB `students` rebuild silently drops `branch_id` and `memorization_level`.
4. **MEDIUM** — `026` never removes `role` and leaves a stray `users_new` table.
5. **MEDIUM** — `009` no-op leaves `salaries` schema divergent between install paths (`teacher_id` vs `user_id`), breaking `legacyFinancialHandlers.js:157` on old DBs.
6. **MEDIUM** — `001`'s partial-unique indexes on `users.national_id`/`email` never created on fresh DBs due to first-statement failure.
7. **MEDIUM** — `annual_fee` / `standard_monthly_fee` never seeded in DB (JS-default-only); `045`/`047` duplicate column add means the `REFERENCES age_groups(id)` FK is never applied on upgraded DBs.
8. **LOW** — dead settings (`039` frequencies, `charge_generation_frequency`, `pre_generate_months_ahead`), duplicate `adultAgeThreshold`/`adult_age_threshold` keys, duplicate migration bodies (027/028, 046/049), `validationSchemas.js` `class_id`/`donor_cin` on `transactions`.
