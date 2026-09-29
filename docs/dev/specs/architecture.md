# Architecture

How the Quran Branch Manager is put together. For the file layout see
[project-structure.md](../reference/project-structure.md); for the IPC channels see
[api.md](api.md); for security details see [security.md](security.md).

## Overview

An Electron desktop app for one branch, working offline on one computer:

```
┌──────────────────────────── Electron ────────────────────────────┐
│                                                                  │
│  Renderer (React, sandboxed)          Main process (Node.js)     │
│  ┌──────────────────────┐   IPC      ┌─────────────────────────┐ │
│  │ pages / components   │──────────► │ ipcSecurity guard       │ │
│  │ AuthContext, hooks   │  preload   │ (session + role check)  │ │
│  │ window.electronAPI.* │ ◄──────────│ handlers/ → services/   │ │
│  └──────────────────────┘            │ schedulers: backup, fees│ │
│                                      └───────────┬─────────────┘ │
│                                                  │               │
│                                      ┌───────────▼─────────────┐ │
│                                      │ db.js (better-sqlite3-  │ │
│                                      │ multiple-ciphers)       │ │
│                                      │ encrypted SQLite file   │ │
│                                      └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Principles: all data stays on the computer, encrypted; the renderer has no Node.js access and
every privileged action goes through a checked IPC channel; the interface is Arabic and RTL.

## Processes

### Main process (`src/main/index.js`)

On start it:

1. Loads or creates the database key (`keyManager.js`) and the session secret.
2. Opens the encrypted database, applying `schema.js` on a fresh file and then pending
   migrations (`db.js`).
3. Installs the IPC guard (`ipcSecurity.js`) and registers every `handlers/*Handlers.js`.
4. Registers the `safe-image://` protocol for branch logos and creates the window
   (`nodeIntegration: false`, `contextIsolation: true`).
5. Starts two schedulers from the settings: automatic backups (`backupManager.js`) and monthly
   fee charges (`feeChargeScheduler.js`, which bills a month once it starts, from the configured
   generation day).

### Preload (`src/main/preload.js`)

Exposes `window.electronAPI` through `contextBridge`: one named method per channel
(`getStudents: (filters) => ipcRenderer.invoke('students:get', filters)`) plus a few event
subscriptions (`onForceLogout`, …). The renderer never sees `ipcRenderer` itself.

### Renderer (`src/renderer/`)

React 19 with React Router. Pages other than the dashboard and login are loaded lazily.
State is local to pages and hooks (`useStudents`, `useTransactions`, …); the only context is
`AuthContext` (the logged-in user and their roles). The UI uses Bootstrap 5 / react-bootstrap
with RTL styles and the Cairo font.

## Request Flow

```
Component → window.electronAPI.addStudent(data)
  → ipcRenderer.invoke('students:add', data)
  → ipcSecurity: sender is the app window? session exists and not expired? role allowed?
  → handler: Joi validation → db.withTransaction(...) → result
  → resolved promise, or an Error with an Arabic message → toast in the UI
```

## Authentication and Authorization

- **Login** (`auth:login`): bcrypt check, lockout after repeated failures, inactive users refused.
  A successful login creates a **main-process session** for that window (`sessionManager.js`,
  8-hour expiry). The renderer gets the user and roles for display only.
- **Authorization** happens in the main process on every call: `ipcSecurity.js` maps each
  channel to the roles allowed (`CHANNEL_ROLES`) and rejects anything else; a few handlers add
  `requireRoles` checks of their own. Nothing the renderer sends is trusted for this.
- **Roles:** Superadmin, Administrator, FinanceManager, SessionSupervisor; a user can have
  several (`user_roles`). The renderer mirrors the matrix in `utils/permissions.js` to hide what
  a user cannot do.
- **First run:** no account exists; the app asks for the first superadmin
  (`auth:setup-superadmin`).

## Data

- **Storage:** one SQLite file in `userData`, encrypted with SQLite3 Multiple Ciphers (SQLCipher
  compatible; older SQLCipher v3 files are migrated on open). The key is random per install and
  protected by the OS through Electron's `safeStorage`.
- **Access:** `db.js` wraps the synchronous driver in `runQuery` / `getQuery` / `allQuery` and
  `withTransaction`. Queries are parameterized.
- **Schema changes:** numbered SQL migrations, recorded by filename in the `migrations` table.
- **Identifiers:** integer primary keys, plus readable matricules (`S-0001`, `T-0001`, …) used by
  imports and search.
- **Deletes are real deletes**, with foreign keys (`ON DELETE CASCADE` where children belong to
  the parent). Students and users also have a `status` (active/inactive) to keep records of people
  who left.
- **Money:** a unified `transactions` table with `accounts` for income and expenses; student
  fees use `student_fee_charges`, `student_payments` and `student_payment_breakdown`. See
  [financial-spec.md](financial-spec.md).

## Import, Export and Backup

- **Exports:** Excel (exceljs), PDF (pdfmake) and Word (docx) reports, from `exportManager.js`
  and `services/*Export*.js`.
- **Imports:** an Excel import wizard (`importManager.js`, matricule-aware upsert). Column
  mapping: [import-export-map.md](../reference/import-export-map.md).
- **Backups:** `.qdb` files, AES-256-GCM encrypted with the association transfer key (or this
  computer's key when none is set), made on demand or by the scheduler. Restoring replaces the
  database and restarts the app.

## Errors

Handlers log the technical error with `logger.js` (secrets redacted) and throw an `Error` with
an Arabic message; Joi errors become «بيانات غير صالحة: …». The renderer shows the message in a
toast.

## Packaging

`npm run build` bundles the renderer with Vite into `dist/renderer`; electron-builder packages it
with `src/main`, `src/db` and production `node_modules` into a Windows NSIS installer. There is
no auto-updater. See [building.md](../setup/building.md).
