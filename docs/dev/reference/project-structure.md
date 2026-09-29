# Project Structure Guide

## Overview

Where things live in the Quran Association Manager (Electron main process + React renderer +
encrypted SQLite).

## Root Directory

```
quran-association-manager/
├── .github/workflows/       # Release workflow (Windows installer from a version tag)
├── build/                   # electron-builder resources (installer icon)
├── docs/                    # All documentation (user: Arabic, dev: English)
├── public/                  # Static assets served with the renderer
├── scripts/                 # Developer and maintenance scripts
├── src/                     # Source code
├── tests/                   # Jest (unit/integration) and Playwright (e2e) tests
├── package.json             # Dependencies and npm scripts
├── vite.config.mjs          # Vite configuration
├── electron-builder.yml     # Build configuration
└── README.md                # Main documentation
```

## Documentation (`docs/`)

```
docs/
├── user/                   # 🟢 Arabic User Documentation
│   ├── manual.md           # User Guide
│   ├── financial.md        # Financial Guide
│   └── troubleshooting.md  # User Troubleshooting
├── dev/                    # 🔵 English Developer Documentation
│   ├── setup/              # Setup, Building, Testing, Deployment
│   ├── specs/              # Architecture, API, Security, Specs
│   ├── reference/          # Project Structure, Agents, Maps
│   ├── reports/            # Audits
│   ├── sprints/            # Sprint notes
│   └── troubleshooting.md  # Developer Troubleshooting
├── archive/                # Superseded migrations and the 2024 financial redesign plan
└── screenshots/            # README screenshots (npm run docs:screenshots)
```

## Source Code (`src/`)

### Database Layer (`src/db/`)

```
db/
├── migrations/             # SQL migrations (001-058), applied in filename order
├── db.js                   # Encrypted connection, migration runner, query helpers
├── schema.js               # Schema for fresh installs
└── seederFunctions.js      # Seed data functions
```

### Main Process (`src/main/`)

```
main/
├── handlers/               # IPC handlers by feature
│   ├── attendanceHandlers.js
│   ├── authHandlers.js
│   ├── classHandlers.js
│   ├── dashboardHandlers.js
│   ├── financialHandlers.js       # Unified transactions/accounts system
│   ├── legacyFinancialHandlers.js # Old per-table queries, still used by exportManager
│   ├── groupHandlers.js
│   ├── importHandlers.js
│   ├── inventoryHandlers.js
│   ├── receiptHandlers.js
│   ├── settingsHandlers.js
│   ├── studentFeeHandlers.js      # Student fee charges and payments
│   ├── studentHandlers.js
│   ├── systemHandlers.js
│   ├── teacherHandlers.js
│   └── userHandlers.js
├── services/               # Business logic services
│   ├── cashLedgerExport.js
│   ├── financialExportService.js
│   ├── financialWordExportService.js
│   ├── inventoryLedgerExport.js
│   ├── matriculeService.js
│   ├── receiptService.js
│   └── voucherService.js
├── utils/                  # Shared helpers (age, dates, translations)
├── export_templates/       # Export templates
├── __mocks__/              # Jest manual mocks
├── authMiddleware.js       # Role checks for IPC handlers
├── backupManager.js        # Database backup
├── exportManager.js        # Export functionality
├── feeChargeScheduler.js   # Monthly fee charge generation
├── importManager.js        # Import functionality
├── importConstants.js      # Import column definitions
├── ipcSecurity.js          # IPC sender/channel guard
├── keyManager.js           # Encryption keys
├── logger.js               # Logging utility
├── preload.js              # Electron preload script
├── sessionManager.js       # Login sessions
├── settingsManager.js      # Settings cache
├── settingsValidation.js   # Settings Joi schema
├── utils.js                # Arabic text shaping, currency rounding
├── validationSchemas.js    # Joi validation schemas
└── index.js                # Main entry point
```

### Renderer Process (`src/renderer/`)

```
renderer/
├── assets/                 # Fonts
├── components/             # React components
│   ├── about/              # About page tabs
│   ├── common/             # Shared components
│   ├── dashboard/          # Dashboard charts
│   ├── financial/          # Financial module UI (transactions, fees, inventory, reports)
│   ├── icons/              # Icon components
│   ├── modals/             # Import/export modals
│   └── settings/           # Settings tabs
├── contexts/               # React contexts
│   └── AuthContext.jsx
├── data/                   # Static data
│   └── onboardingContent.js
├── hooks/                  # Custom React hooks
│   ├── useAcademicYear.js
│   ├── useCategories.js
│   ├── useFinancialSummary.js
│   ├── usePermissions.js
│   ├── useStudents.js
│   └── useTransactions.js
├── layouts/                # Layout components
│   └── MainLayout.jsx
├── pages/                  # Page components
│   ├── AboutPage.jsx
│   ├── AccountsPage.jsx
│   ├── AttendancePage.jsx
│   ├── ClassesPage.jsx
│   ├── DashboardPage.jsx
│   ├── ExpensesPage.jsx
│   ├── FinancialDashboard.jsx
│   ├── FinancialsPage.jsx
│   ├── IncomePage.jsx
│   ├── LoginPage.jsx
│   ├── ProfilePage.jsx
│   ├── SettingsPage.jsx
│   ├── StudentsPage.jsx
│   ├── TeachersPage.jsx
│   └── UsersPage.jsx
├── styles/                 # CSS/SCSS files
├── utils/                  # Helpers (age, dates, academic year, permissions, toasts)
├── App.jsx                 # Routes
└── index.jsx               # Entry point
```

The main process and the renderer do not share modules, so a few small helpers exist in both
(`utils/age.js`, `utils/dates.js`). Keep each pair in step.

## Scripts (`scripts/`)

- `manual-seeder.js` - demo data (`npm run seed:manual`)
- `guide-video.js` - MP4s from the recorded video guide (`npm run docs:guide:mp4`)
- `open-e2e-data.js` - open data kept by the real-world e2e run (`npm run e2e:open-data`)
- `api-doc.js` - regenerate the channel reference in `docs/dev/specs/api.md` (`npm run docs:api`)
- `capture-demo.js` - portfolio screenshots without Playwright
- `diagnose-db.js`, `check-payment-methods.js` - database inspection
- `fix-logo-path.js`, `fix-matricule-format.js`, `migrate-student-fees.js` - one-off data fixes
- `test-age-groups-integration.js` - manual age-groups check against a real database

## Tests (`tests/`)

```
tests/
├── *.spec.js               # Main-process Jest tests (node environment)
├── renderer/               # Renderer Jest tests (jsdom)
├── mocks/                  # Module mocks mapped in jest.config.js
├── business/               # Business-process specs (not run by Jest yet; see below)
└── e2e/                    # Playwright tests against the built Electron app (*.e2e.js)
```

`npm test` runs `tests/*.spec.js` and `tests/renderer/**/*.spec.js`. The specs in
`tests/business/` are not matched by `jest.config.js` and need fixing before they can be.

## Key Files

### Configuration

- `package.json` - Dependencies and scripts
- `vite.config.mjs` - Vite bundler configuration
- `electron-builder.yml` - Electron builder configuration
- `jest.config.js` - Jest test configuration
- `playwright.config.js` - Playwright e2e configuration
- `babel.config.js` - Babel transpiler configuration
- `.eslintrc.js` - ESLint linting rules
- `.prettierrc.js` - Prettier formatting rules

### Documentation

- `README.md` - Main project documentation
- `CHANGELOG.md` - Version history
- `CONTRIBUTING.md` - Contribution guidelines
- `CODE_OF_CONDUCT.md` - Community standards
- `LICENSE` - CC BY-NC-SA 4.0 license text
- `NOTICE` - Copyright, license summary and how to credit the project (shipped with the app)
- `AGENTS.md` - Working rules for AI agents
- `PRODUCT.md` - Product overview
- `SECURITY_REMEDIATION_PLAN.md` - Security work plan

### Ignored Files (`.gitignore`)

- `node_modules/` - Dependencies
- `dist/`, `release/` - Build output
- `coverage/` - Test coverage
- `.db/`, `*.sqlite`, `*.db` - Database files
- `test-results/`, `playwright-report/`, `e2e-artifacts/`, `guide-output/` - e2e output
- `*.log` - Log files

## Component Organization

### Financial System

- UI: `src/renderer/components/financial/` and the pages it serves
  (`FinancialsPage`, `FinancialDashboard`, `IncomePage`, `ExpensesPage`, `AccountsPage`)
- Handlers: `src/main/handlers/financialHandlers.js` (unified `transactions` table) and
  `src/main/handlers/studentFeeHandlers.js` (student fees)
- `legacyFinancialHandlers.js` still backs parts of `exportManager.js`; remove it only after
  those exports move to the unified tables.

## Migration Files

### Naming Convention

Format: `NNN-description.sql`

- NNN: Sequential number
- description: Brief description in kebab-case

The runner records each migration by its **filename**, so never rename or renumber an existing
file: installed databases would run it again. A few numbers (027, 037, 043) are used twice for
that reason; they still apply in a fixed (alphabetical) order.

### Adding New Migrations

1. Create file: `059-your-description.sql` (next free number)
2. Write SQL statements
3. Test against a fresh and an existing database

Fresh installs run `schema.js` and then every migration, so a migration alone covers both.

## Best Practices

### File Organization

- Group related files in folders
- Use clear, descriptive names
- Follow existing naming conventions
- Keep components small and focused

### Code Structure

- One component per file
- Export at bottom of file
- Import order: external → internal → relative
- Use absolute imports where possible

### Documentation

- Update docs when changing structure
- Document complex logic
- Keep README.md current
- Use JSDoc for functions

### Version Control

- Never commit build artifacts
- Never commit database files
- Never commit sensitive data
- Use meaningful commit messages

## Common Tasks

### Adding a New Feature

1. Create handler in `src/main/handlers/`
2. Register IPC channel in handler file
3. Expose in `src/main/preload.js`
4. Create UI components in `src/renderer/components/`
5. Create page in `src/renderer/pages/`
6. Add route in `src/renderer/App.jsx`
7. Update documentation

### Adding a Database Table

1. Create migration file in `src/db/migrations/`
2. Update `src/db/schema.js`
3. Create handlers for CRUD operations
4. Add validation schemas
5. Create UI components
6. Test thoroughly

### Fixing a Bug

1. Identify affected files
2. Write test to reproduce bug
3. Fix the issue
4. Verify test passes
5. Update documentation if needed
6. Commit with descriptive message

## Maintenance Schedule

### Regular Tasks

- Weekly: Review and clean logs
- Monthly: Update dependencies
- Quarterly: Review and archive old code
- Yearly: Major cleanup and refactoring

### Cleanup Checklist

- [ ] Remove unused files
- [ ] Update documentation
- [ ] Fix broken tests
- [ ] Update dependencies
- [ ] Review .gitignore
- [ ] Archive old code
- [ ] Optimize bundle size

## Support

### Getting Help

1. Check documentation in `docs/`
2. Review `docs/dev/troubleshooting.md`
3. Search GitHub issues
4. Create new issue with details

### Reporting Issues

1. Check if already reported
2. Provide clear description
3. Include steps to reproduce
4. Add relevant logs/screenshots
5. Specify environment details

---

**Last Updated**: After comprehensive cleanup
**Maintained By**: Development Team
**Review Frequency**: After major changes
