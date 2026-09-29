# Security

How the app protects its data, as implemented. Open items and their status are tracked in
[SECURITY_REMEDIATION_PLAN.md](../../../SECURITY_REMEDIATION_PLAN.md).

## Threat Model

The app runs offline on one shared office computer. What it protects: students' and staff's
personal data (names, birth dates, national IDs, phone numbers), financial records, and user
accounts. The main risks are:

- someone else using the computer, or a staff member reaching data outside their role;
- the database file or a backup being copied off the computer;
- a tampered backup or import file;
- content loaded into the window trying to reach Node.js or privileged IPC.

## Process Isolation

- The window runs with `nodeIntegration: false` and `contextIsolation: true`. The renderer can
  only call the named methods `preload.js` exposes on `window.electronAPI`; there is no generic
  `invoke`, no `fs` and no `require`.
- A Content Security Policy in `index.html` allows only the app's own scripts:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: safe-image:; font-src 'self' data:`.
- The `safe-image://` protocol (branch logos) rejects `..`, NUL bytes and absolute paths and only
  serves files under the app's user-data and bundled `public` folders.

## Authentication

- **Passwords:** bcrypt hashes (cost 10). New users need at least 8 characters.
- **First run:** no default account is ever seeded; the first superadmin is created in the setup
  form (`auth:setup-superadmin`).
- **Lockout:** 5 failed logins lock login for 5 minutes (state kept in the main process store).
- **Inactive users** («غير نشط») cannot log in; their records are kept.
- **Sessions:** a successful login creates a session in the main process (`sessionManager.js`),
  tied to that window and expiring after 8 hours. It ends on logout, when the window closes, or
  when the app quits. The renderer holds the user's name and roles for display only.

## Authorization

`ipcSecurity.js` wraps every `ipcMain.handle` / `ipcMain.on` registration. For each call it:

1. checks the sender is the app window (the built `dist/renderer/index.html`, or
   `http://localhost:3000` in development);
2. lets `PUBLIC_CHANNELS` through (login, first-run setup, version, logo, toasts);
3. otherwise requires a live session, and that one of the user's roles is allowed for the channel
   in `CHANNEL_ROLES`.

Roles (a user can hold several):

| Role | Scope |
|---|---|
| Superadmin | Everything, including user management, logs and database import |
| Administrator | Everything except user management, logs and database import |
| FinanceManager | Finances, student fees, inventory and financial reports; attendance; read access to students, teachers and classes |
| SessionSupervisor | Attendance; read access to students, teachers, classes and groups |

The exact matrix per channel is in [api.md](api.md). The renderer mirrors it
(`utils/permissions.js`) only to hide what a user cannot use; hiding is not the protection.

## Data Protection

- **Database:** SQLite encrypted with SQLite3 Multiple Ciphers (SQLCipher compatible), through
  `better-sqlite3-multiple-ciphers`.
- **Keys:** the database key is 32 random bytes generated per installation and stored protected
  by the OS through Electron's `safeStorage` (DPAPI on Windows). The session-signing secret is
  generated on first run. A copied database file is useless without that Windows account.
- **Backups:** `.qdb` files encrypted with AES-256-GCM, whose authentication tag makes a modified
  file fail to restore. The key is the association transfer key when set (so another branch
  computer can restore it), otherwise this computer's key. Older SQL-script backups carry an
  HMAC-SHA256 signature that is checked on import.
- **Restore** needs the superadmin's password and replaces the whole database.

## Input Handling

- All SQL uses `?` parameters. Dynamic column lists (updates, imports) are built only from
  whitelists of known columns.
- Inputs that create or change records are validated with Joi (`validationSchemas.js`,
  `settingsValidation.js`) and unknown fields are stripped.
- Excel imports map known Arabic headers to known columns (`importConstants.js`).

## Errors and Logs

- Handlers log the technical error and send the renderer a short Arabic message, not a stack
  trace or SQL.
- `logger.js` writes `app-logs.txt` in the user-data folder and redacts any field whose name
  matches `pass`, `password`, `token`, `secret`, `transfer_key`, `national_id`, `credit` or `card`.

## Development Rules

- Never expose Node.js modules or a generic IPC `invoke` through the preload script.
- Add every new channel to `CHANNEL_ROLES`; keep `PUBLIC_CHANNELS` to what the login screen needs.
- Validate input in the main process even when the form already does.
- Keep secrets out of the repository; `.env` is for development only and is ignored by git.
- Run `npm audit` before a release and update vulnerable dependencies.

## Reporting a Vulnerability

Email the maintainer at elheni.selim@gmail.com rather than opening a public issue.
