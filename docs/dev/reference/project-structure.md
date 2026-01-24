# Project Structure Guide

## Overview

Clean, organized structure for the Quran Association Manager application.

## Root Directory

```
quran-association-manager/
├── docs/                    # All documentation
├── public/                  # Static assets
├── scripts/                 # Utility scripts
├── src/                     # Source code
├── tests/                   # Test suites (currently broken)
├── .amazonq/               # Amazon Q rules
├── package.json            # Dependencies
├── vite.config.js          # Vite configuration
├── electron-builder.yml    # Build configuration
└── README.md               # Main documentation
```

## Documentation (`docs/`)
 
 ```
 docs/
 ├── user/                   # 🟢 Arabic User Documentation
 │   ├── manual.md           # User Guide (translated USAGE.md)
 │   ├── financial.md        # Financial Guide
 │   └── troubleshooting.md  # User Troubleshooting
 └── dev/                    # 🔵 English Developer Documentation
     ├── setup/              # Setup, Building, Testing, Deployment
     ├── specs/              # Architecture, API, Security, Specs
     ├── reference/          # Project Structure, Agents, Maps
     └── troubleshooting.md  # Developer Troubleshooting
 ```
 
 ## Source Code (`src/`)
 
 ### Database Layer (`src/db/`)
 
 ```
 db/
 ├── migrations/             # Database migrations (001-025)
 │   ├── 001-update-users-table.sql
 │   ├── 002-fix-user-role-constraint.sql
 │   ├── ...
 │   └── 025-add-transaction-matricule.sql
 ├── db.js                   # Database connection
 ├── schema.js               # Schema definitions
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
 │   ├── financialHandlers.js      # New unified system
 │   ├── legacyFinancialHandlers.js # Legacy system (to be removed)
 │   ├── groupHandlers.js
 │   ├── importHandlers.js
 │   ├── inventoryHandlers.js
 │   ├── receiptHandlers.js
 │   ├── settingsHandlers.js
 │   ├── studentHandlers.js
 │   ├── systemHandlers.js
 │   ├── teacherHandlers.js
 │   └── userHandlers.js
 ├── services/               # Business logic services
 │   ├── financialExportService.js
 │   ├── matriculeService.js
 │   └── voucherService.js
 ├── export_templates/       # Export templates
 ├── __mocks__/             # Test mocks
 ├── authMiddleware.js       # Authentication
 ├── backupManager.js        # Database backup
 ├── exportManager.js        # Export functionality
 ├── importManager.js        # Import functionality
 ├── keyManager.js           # Encryption keys
 ├── logger.js               # Logging utility
 ├── preload.js              # Electron preload script
 ├── settingsManager.js      # Settings management
 ├── utils.js                # Utility functions
 ├── validationSchemas.js    # Joi validation schemas
 └── index.js                # Main entry point
 ```
 
 ### Renderer Process (`src/renderer/`)
 
 ```
 renderer/
 ├── assets/                 # Fonts, images
 ├── components/             # React components
 │   ├── about/             # About page components
 │   ├── common/            # Shared components
 │   ├── financial/         # New financial system UI
 │   ├── financials/        # Legacy financial system UI (to be removed)
 │   └── icons/             # Icon components
 ├── contexts/              # React contexts
 │   └── AuthContext.jsx
 ├── data/                  # Static data
 │   └── onboardingContent.js
 ├── hooks/                 # Custom React hooks
 │   ├── useAccounts.js
 │   ├── useCategories.js
 │   ├── useFinancialSummary.js
 │   ├── usePermissions.js
 │   └── useTransactions.js
 ├── layouts/               # Layout components
 │   └── MainLayout.jsx
 ├── pages/                 # Page components
 │   ├── financial/         # Financial module pages
 │   ├── AboutPage.jsx
 │   ├── AccountsPage.jsx
 │   ├── AttendancePage.jsx
 │   ├── ClassesPage.jsx
 │   ├── DashboardPage.jsx
 │   ├── ExpensesPage.jsx
 │   ├── ExportsPage.jsx
 │   ├── FinancialDashboard.jsx
 │   ├── FinancialsPage.jsx
 │   ├── IncomePage.jsx
 │   ├── LoginPage.jsx
 │   ├── ProfilePage.jsx
 │   ├── SettingsPage.jsx
 │   ├── StudentsPage.jsx
 │   ├── TeachersPage.jsx
 │   └── UsersPage.jsx
 ├── styles/                # CSS/SCSS files
 ├── utils/                 # Utility functions
 ├── App.jsx                # Main App component
 └── index.jsx              # Entry point
 ```
 
 ## Scripts (`scripts/`)
 
 Utility scripts for testing and database operations:
 
 - `init-financial-tables.js`
 - `manual-seeder.js`
 - `run-comprehensive-tests.js`
 - `setup-pre-migration-db.js`
 - `test-*.js` (various test scripts)
 
 ## Tests (`tests/`)
 
 ✅ **STATUS**: Test suite is enhanced and stable (560+ tests).
 
 ```
 tests/
 ├── mocks/                 # Test mocks
 ├── renderer/              # Renderer process tests
 ├── *.spec.js             # Test files
 └── COMPREHENSIVE_TESTS_README.md
 ```

## Key Files

### Configuration

- `package.json` - Dependencies and scripts
- `vite.config.js` - Vite bundler configuration
- `electron-builder.yml` - Electron builder configuration
- `jest.config.js` - Jest test configuration
- `babel.config.js` - Babel transpiler configuration
- `.eslintrc.js` - ESLint linting rules
- `.prettierrc.js` - Prettier formatting rules

### Documentation

- `README.md` - Main project documentation
- `CHANGELOG.md` - Version history
- `CONTRIBUTING.md` - Contribution guidelines
- `CODE_OF_CONDUCT.md` - Community standards
- `LICENSE` - License information
- `AGENTS.md` - AI agent guidelines
- `CLEANUP_REPORT.txt` - This cleanup report

### Ignored Files (`.gitignore`)

- `node_modules/` - Dependencies
- `dist/`, `release/` - Build output
- `coverage/` - Test coverage
- `.db/`, `*.sqlite` - Database files
- `lib/` - Platform libraries
- `.codeboarding/` - Analysis tools
- `*.log` - Log files

## Component Organization

### Financial System

Two parallel systems currently exist:

**New Unified System** (Active):

- Location: `src/renderer/components/financial/`
- Handlers: `src/main/handlers/financialHandlers.js`
- Uses: Unified `transactions` table

**Legacy System** (Deprecated):

- Location: `src/renderer/components/financials/`
- Handlers: `src/main/handlers/legacyFinancialHandlers.js`
- Uses: Separate tables (donations, expenses, payments, salaries)
- Status: To be removed after full migration

## Migration Files

### Naming Convention

Format: `NNN-description.sql`

- NNN: Sequential number (001-025)
- description: Brief description in kebab-case

### Current Migrations

- 001-010: Core tables and initial setup
- 011: Groups tables
- 012: Inventory tables
- 013-015: Settings and onboarding
- 016-018: Financial system unification
- 019-021: Category updates
- 022-025: Bug fixes and enhancements

### Adding New Migrations

1. Create file: `026-your-description.sql`
2. Write SQL statements
3. Test thoroughly
4. Update this documentation

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
2. Review `TROUBLESHOOTING.md`
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
