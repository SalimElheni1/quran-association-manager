# Security

How the app protects its data, as implemented. Procedures for staff (recovery, key rotation,
incidents) are in [security-runbook.md](../security-runbook.md). Open items and their status are tracked in
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
- `webviewTag` is disabled.

## Authentication

- **Passwords:** bcrypt hashes (cost 10). Wherever a password is set — first-run setup,
  `users:add`, `users:update`, the profile password change, and the forced change after a
  legacy-password login — it must be at least 6 characters and must not be in the bundled
  common-password list (`src/main/commonPasswords.js`, case-insensitive), with an Arabic message
  for each rule. The renderer (`src/renderer/utils/passwordPolicy.js`) repeats the length rule to
  fail fast; the main process is authoritative and also checks the common-password list. Logging in is unchanged: older passwords keep working;
  no forced reset.
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
- **Keys:** the database key is 32 random bytes generated per installation and stored as a
  64-character hex string, protected by the OS through Electron's `safeStorage` (DPAPI on Windows,
  Keychain on macOS, libsecret on Linux). When `safeStorage` is unavailable, the key is stored in
  a plaintext file with owner-only permissions (`0o600`). `keyManager.validateHexKey` accepts only
  64 hex characters; `db.js` refuses an invalid key before the file is opened, and every PRAGMA
  `key` / `rekey` goes through `applyKeyPragma`, which validates it again. The session-signing
  secret is derived from the database key with HKDF-SHA256 (`keyManager.getJwtSecret`), never
  stored; the random `jwt_secret` older versions kept in electron-store is deleted at startup.
  `.env` no longer needs `JWT_SECRET`. A copied database file is useless without that OS account
  or key file.
- **Backups:** `.qdb` files encrypted with AES-256-GCM (PBKDF2, 100k iterations), whose
  authentication tag makes a modified file fail to restore. The key is the association transfer key
  when set (so another branch computer can restore it), otherwise this computer's database key.
  Older SQL-script backups carry an HMAC-SHA256 signature that is checked on import.
- **Key rotation (SEC-017):** Settings > النسخ الاحتياطي > «تغيير مفتاح التشفير», Superadmin only,
  password confirmation (IPC `db:rotate-key`, `src/main/handlers/systemHandlers.js`;
  `db.rotateDatabaseKey`). Refused until the association transfer key is saved, because backups
  made without it are encrypted with the database key and would no longer restore. Crash-safe: the
  new key is stored as pending, the file is re-keyed (journal switched from WAL to DELETE for the
  duration — SQLite3MultipleCiphers cannot re-key in WAL mode), verified with a second connection,
  then promoted; at startup an interrupted rotation is finished or discarded. The session secret is
  re-derived and every session ends (force-logout). No old key is kept.
- **Backup folder (SEC-018, `backupManager.validateBackupPath`):** only an absolute, existing,
  writable folder without NUL characters; the scheduler does not start otherwise, a manual backup
  returns the Arabic reason, the safety copy before a restore is skipped with a warning.
- **Restore** needs the logged-in user's password, and the transfer key for backups from another
  computer.

## Input Handling

- All SQL uses `?` parameters. Dynamic column lists (updates, imports) are built only from
  whitelists of known columns.
- Inputs that create or change records are validated with Joi (`validationSchemas.js`,
  `settingsValidation.js`) and unknown fields are stripped.
- Excel imports map known Arabic headers to known columns (`importConstants.js`).
- Every IPC channel has an argument schema (`CHANNEL_ARG_SCHEMAS` in `ipcValidation.js`, one Joi
  schema per positional argument, matching `preload.js`). The guard checks it after the session and
  role checks and before the handler: wrong types, missing ids, extra arguments or a non-object
  payload are refused with «بيانات غير صالحة.», and the log names the channel and the failed rule,
  never the values. Handlers still validate payload contents with their own schemas.

## Window Navigation

`navigationGuard.js` hardens the `BrowserWindow`'s `webContents`:

- `window.open` / `target="_blank"` is always denied inside Electron; allowlisted external URLs
  are handed to the system browser instead.
- `will-navigate` and `will-redirect` are allowed only for internal URLs (the app's own page:
  `http://localhost:3000` in development, `dist/renderer/index.html` otherwise); allowlisted
  external URLs (exact hosts: `mailto:`, `github.com`, `www.github.com`, `linkedin.com`,
  `www.linkedin.com`, `wa.me`, `api.whatsapp.com`; no credentials in the URL) are opened in the
  system browser; anything else is blocked and logged.

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
