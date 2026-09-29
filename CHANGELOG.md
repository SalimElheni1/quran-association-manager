# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Nothing is deleted any more (migration 061).** Deleting a student, teacher, class, user,
  inventory item or in-kind category keeps it: it leaves the lists, pickers, counts and exports,
  and its payments, transactions and attendance stay in the reports and history. «عرض المحذوفات»
  lists the deleted records with a «استعادة» (restore) button. A deleted student's unpaid charges
  are cancelled and come back on restore; a deleted student is not billed or paid for; a deleted
  user can't log in. Usernames and IDs of deleted records stay taken.
- **Money is voided, not deleted.** Deleting a transaction or a student payment now voids it
  («إلغاء»): it stays in history marked «ملغاة» («عرض الملغاة» on the income and expense lists),
  is taken back out of the account balance and no longer counts in totals, balances or reports.
  Its receipt number can be used again for the corrected entry.

- The license is stated consistently as CC BY-NC-SA 4.0 (it said MIT in `package.json`): open
  source, no commercial use, credit the project. A `NOTICE` file explains how to credit it and
  ships with the app, and the About page shows the license.
- Documentation reviewed against the code. The Arabic user guides are rewritten for the current
  screens (first-run setup, roles, age groups, student fees, arrears, backups and the transfer
  key); the developer guides, architecture, security and financial specs describe what is
  implemented; the IPC reference is generated from the code (`npm run docs:api`).

### Removed

- Fee settings nothing read: `charge_generation_frequency`, `pre_generate_months_ahead`,
  `last_charge_generation_check` and `men_/women_/kids_payment_frequency` (payment frequency is
  set per age group). Values stored by older databases are ignored.
- The legacy financial IPC channels (`get-expenses`, `add-donation`, …), which were never
  registered, from the preload script and the role matrix.
- The `tests/business` specs, which never ran and did not test the app.
- Unused code and files: the unwired groups and receipt-books tabs and other components nothing
  imported, scripts that could no longer run, one-off verification scripts and screenshots,
  and the leftovers of the removed Google Drive backup (setup guide, `GOOGLE_*` variables,
  `google-auth-library`). Unused dependencies `docxtemplater`, `react-select`, `d3-shape` and
  `@fortawesome/fontawesome-free` were dropped.

### Fixed

- Adding or editing a student younger than 4 showed «حدث خطأ غير متوقع في الخادم.» instead of the
  minimum-age message.
- A new database no longer carries an empty `users_new` table (migration 059), and the mixed
  «المراهقون (12-17 سنة)» age group, which overlapped the 12-14 and 15-17 groups, is deactivated
  unless a class or student uses it (migration 060).
- `npm run seed:manual` works again and fills the database `npm run dev` opens.
- The students search e2e test failed because it typed while a closing dialog still held focus;
  e2e steps now wait for dialogs to be fully closed.
- The students table showed «NaN» as the age of a student with an unreadable birth date
  (now «غير متوفر»), and the age filters kept such students.
- The About page's project link pointed to a repository that does not exist.
- **The first month of an academic year was billed twice.** Next month's charges billed from
  the generation day (e.g. 25 August) took the ending academic year, so September was billed
  under 2025-2026 and again under 2026-2027 when it started (and showed as last year's arrears).
  Migration 058 removes the unpaid duplicates already created, or moves the charge to the new
  year when September has not started yet; paid charges are left as they are.
- **The academic year follows the configured start month everywhere.** The student fees tab and
  the financial dashboard's "current academic year" assumed September; with another start month
  they used a different year from the charges, so payments were not applied to them.
- **A student's credit stays visible after the academic year changes.** Credit is used by the
  next payment whatever year it came from; it is now counted in the current year's balance
  instead of disappearing with last year.
- After deleting or refunding a payment from an earlier year's arrears dialog, the dialog
  reloads that year's payments and balance, not the current year's.
- A student billed annually who is in several age groups defaults to the annual group's fee.
- Discounted fees are rounded to cents, so paying the displayed amount marks the charge paid.
- **An inactive user could still log in.** Setting a user to «غير نشط» now blocks their login
  (with a message to contact the administrator); their data is kept.
- The monthly fees chart is labelled "last 12 months", which is what it shows.
- The e2e test clock can no longer be switched on in a packaged build.
- README screenshots moved to `docs/screenshots/` so they are not bundled into the app.
- **A deleted payment could take the student's credit with it.** When a payment used credit
  from an earlier overpayment, deleting or refunding it now gives that credit back. A payment
  whose own credit a later payment already used can only be reversed after that later one.
- **Deleting a class deleted its students' fee charges**, paid ones and earlier years' arrears
  included. The charges now stay on the students' accounts.
- **Fee payments deleted from the income list stayed «paid».** Deleting one there now reverses
  it the way the student fees tab does; its amount, account and date can only be changed from
  the student fees tab, and a fee refund cannot be deleted on its own.
- **Saving a profile with a birth or start date failed**, and the profile update wrote any
  field the page sent (a plain `password` was stored unhashed). Only the profile's own fields
  are saved now.
- The last active Superadmin can no longer be deleted, deactivated or demoted, and a user can
  no longer delete their own account; the users page says why.
- Weekly and monthly automatic backups ran every day once the backup time had passed.
- The association transfer key was written to the log file when settings were saved.
- Transactions, refunds and receipts now record the user who made them (they recorded none, or
  user 1).
- A duplicate receipt number on a fee payment showed «Failed to record student payment.»
  instead of the Arabic message saying the receipt number is already used.
- Restoring a backup could write its asset files outside the app's data folder.
- A database import confirmed the password of the user id the page sent, not the logged-in
  user's.
- A SQLite module built for another platform (left behind by `npm run dist`, which builds for
  Windows) was reported as «Incorrect password or corrupt database» and the app closed without
  a word. It is now named, with the fix (`npx electron-builder install-app-deps`), and startup
  errors are shown in a dialog. The encryption check no longer warns that encryption is missing.

## [1.4.0-beta.1] - 2026-09-24

Pre-release for testing on Windows. Entries for 1.1.0 to 1.3.1 were not recorded here.

### Upgrade notes

- **Payment system (monthly/annual) moved to each age group.** The three men/women/children
  settings are gone from the fees tab; each age group now has its own payment system, and its
  classes follow it. On upgrade, groups under 18 take the old children setting and adult
  male/female groups the men/women setting. Those settings never reached classes created in
  the app before, so a branch that had set one of them to annual will now see annual billing
  for those groups.
- **A month is billed once it starts.** Adding a student, changing a class, recording a
  payment or refreshing charges no longer bills future months. Next month is still billed from
  the configured generation day (default 25). On upgrade, untouched monthly charges two or more
  months ahead are removed; they are recreated when their month arrives.
- **Fees per age group.** Each age group can set its own annual and monthly fee; groups left
  empty keep the branch fees, so nothing changes on upgrade. A student in classes of age groups
  with different fees pays the higher fee and is flagged "اختر فئة الرسوم" until an administrator
  picks the group in the fee details. A new group fee applies from the next bill; while a
  student's annual charge is unpaid, it follows their group when their classes change.
- **Earlier years' unpaid fees are kept apart.** A fee payment now settles charges of its own
  academic year only; it no longer pays off last year's arrears first. Arrears are flagged on
  the student's row, listed by year in the fee details, and paid from there.
- **Set the association transfer key before relying on backups.** Backups made without it can
  only be restored on the same computer; the backup tab now warns while it is empty.

### Added

- Monthly fees chart on the home dashboard for finance roles (net fees per month, after refunds).
- Payment system field and column in the age groups settings.
- Annual and monthly fee per age group, and a per-student fee group choice in the fee details
  (with a "بحاجة لاختيار فئة الرسوم" filter in the fees list).
- Warning in the backup tab while no association transfer key is set.
- Voucher numbers can be corrected when editing a transaction.
- Previous years' arrears in student fees: a "متخلدات سابقة" flag and filter in the fees list,
  a per-year section in the fee details with a button to pay each year.
- Financial dashboard: "current academic year" period (September to August).
- End-to-end test suite (Playwright + Electron, 87 tests) and real-world scenario tests
  (`npm run test:e2e`, `npm run test:e2e:realworld`): 123 students with finances, fees, a
  backup and a restore on a fresh install; and a branch's finances run month by month from
  September to January with the app clock moved forward, plus an academic-year rollover.

### Changed

- `npm run lint` now checks the React (`.jsx`) and `.mjs` files too; they were never linted.
- README screenshots now come from the real-world test data (`npm run docs:screenshots`).

### Fixed

- Editing any income or expense failed ("طريقة الدفع غير صالحة").
- In-kind donations without a voucher number could not be saved.
- Duplicate voucher numbers showed a raw database error instead of the Arabic message.
- Logging out right after first-run setup showed the setup form again.
- Adding a student billed three months at once; recording one student's full payment could
  bill every student for next month; enrollment changes left months billed ahead at the old fee.
- The payment system settings had no effect on classes created in the app.
- The academic year rolled over in December instead of the configured start month when
  billing ahead.
- Records made between 00:00 and 01:00 (fees, payments, receipts, date defaults and month
  ranges) were dated the previous day.
- Student fee payments were stored with a UTC timestamp and compared as date-times, so the
  financial dashboard could count them in the wrong month and left out payments made on a
  period's last day.
- Financial dashboard: month totals missed the last day of the month; the refresh and export
  buttons never appeared; totals did not update after fee payments or in-kind donations.
- The financial dashboard kept showing the month it was first opened in; it now opens on the
  current month, follows the date while the app stays open, and shows the selected period.
- Imported fee payments without an academic year went to the previous academic year.
- Counts in the financial summary cards (paid, partly paid and unpaid students; number of
  transactions) were shown with two decimals, like amounts.
- The income and expense window loaded every student and class each time it opened, for a
  student picker that was never shown.
- Enrollment warned about gender for every student in male-only or female-only classes.
- Class statuses "pending" and "completed" were shown in English.

## [1.0.0] - 2025-09-01

### Added

- Initial release of the Quran Branch Manager application.
- Core features include student, teacher, and class management.
- Attendance tracking and reporting.
- Financial management for payments, salaries, donations, and expenses.
- User authentication with role-based access control.
- Arabic language support with RTL interface.
