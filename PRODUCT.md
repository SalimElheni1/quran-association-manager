# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop (Electron, Windows)

## Users
Primary users are the administrative staff of Quranic associations in Tunisia: the superadmin who sets the branch up, administrators, finance managers, and session supervisors who run attendance. Their job: run the day-to-day administration of a Quran branch — enroll students, schedule classes with teachers, track attendance and memorization progress, and manage finances — without paper or internet.

## Product Purpose
Quran Branch Manager replaces manual, paper-based workflows for Quranic associations with a digital, offline-first administrative system. Success means a branch admin can manage students, teachers, classes, attendance, and finances entirely on one secure desktop computer, with no network required and full Arabic (RTL) support.

## Positioning
The product is meaningful because it is offline-first and locally secure: all data lives on the user's own computer (SQLite, encrypted), so it keeps working with zero internet connectivity — a property a cloud-only competitor cannot truthfully claim for the rural or low-connectivity settings where these associations operate.

## Operating Context
- Runs as an Electron desktop application on the user's own computer; the installer targets Windows (x64).
- Fully offline-first: data is stored locally in an encrypted SQLite database; no internet required for normal operation.
- Interface is Arabic, Right-to-Left (RTL), with the Cairo typeface.
- Complete administrative workflows: student enrollment and memorization tracking, teacher and class management, class schedules, attendance recording and reports, and a unified financial module (student payments, teacher salaries, donations in cash and in-kind, general expenses).
- Reports and exports in PDF, Excel and Word formats.
- Role-based access control: Superadmin, Administrator, FinanceManager and SessionSupervisor roles (a user can hold several); login is required.

## Capabilities and Constraints
- Confirmed functionality: students, teachers/classes, attendance, financials (income/expenses/donations/salaries), comprehensive reporting and export (PDF/Excel/Word), inventory, role-based access control, data backup and export, onboarding guide, and import wizard.
- Technical constraints: Electron + React (19 RC), Bootstrap/react-bootstrap, SQLite, offline-first, RTL Arabic.
- Security: bcrypt-hashed passwords, role checks on every IPC call, encrypted local database and backups; SECURITY_REMEDIATION_PLAN.md tracks the remediation work and its status.

## Brand Commitments
- Product name: Quran Branch Manager (Arabic-facing application; identity is Arabic and RTL).
- Core scope: offline-first, secure administrative tool for Quranic associations.
- No strict visual brand system, logo, or association color palette is binding.

## Evidence on Hand
- Full user documentation in Arabic (docs/user/manual.md, docs/user/financial.md, docs/user/troubleshooting.md).
- Development/build documentation under docs/dev/.
- Application screenshots under docs/screenshots/.
- SECURITY_REMEDIATION_PLAN.md for known security remediation work.
- No fabricated testimonials, customer names, or deployment claims.

## Product Principles
- Offline is a feature, not a fallback: the app must remain fully functional without internet.
- Data trust and security come first: local, encrypted, role-protected data.
- Arabic-first, RTL-correct interface for an Arabic-speaking audience.
- Practical administrative completeness over breadth: support the real paper workflows it replaces end to end.
- Clear and explainable financial handling within one unified module.

## Accessibility & Inclusion
- RTL Arabic layout and Arabic-language documentation for the primary audience.
- No additional product-specific accessibility standard was specified.
