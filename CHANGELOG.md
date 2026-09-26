# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Created `LICENSE` file with CC BY-NC-SA 4.0 license.
- Created `CODE_OF_CONDUCT.md` with the Contributor Covenant.
- Created `CONTRIBUTING.md` with guidelines for contributors.
- Created `CHANGELOG.md` to track project changes.
- Created `AGENTS.md` to assist AI agents.

### Changed

- Updated `README.md` to be a more comprehensive entry point.
- Refined `docs/USAGE.md` and `docs/DEVELOPMENT.md`.

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
