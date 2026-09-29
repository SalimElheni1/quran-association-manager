# Development Guide

How to set up, run and change the Quran Branch Manager. For where files live see
[project-structure.md](../reference/project-structure.md); for how the pieces fit together see
[architecture.md](../specs/architecture.md).

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 32 (main process in plain Node.js/CommonJS, no bundler) |
| UI | React 19, React Router 6, Bootstrap 5 / react-bootstrap, Vite 5 (renderer only), Sass |
| Database | SQLite, encrypted, through `better-sqlite3-multiple-ciphers` (synchronous API) |
| Validation | Joi |
| Auth | bcryptjs password hashes; sessions held in the main process |
| Exports | exceljs (Excel), pdfmake (PDF), docx (Word) |
| Tests | Jest + Testing Library; Playwright for end-to-end tests of the real Electron app |
| Packaging | electron-builder (Windows NSIS installer) |

## Setup

Prerequisites: Node.js 22+, npm 10+, Git. On Windows, the native SQLite module needs the
"Desktop development with C++" build tools only if no prebuilt binary matches.

```bash
git clone https://github.com/SalimElheni1/quran-association-manager.git
cd quran-association-manager
npm install              # postinstall rebuilds the native SQLite module for Electron
cp .env.example .env     # then fill it in
```

`.env` is read in development only:

| Variable | Used for |
|---|---|
| `JWT_SECRET` | Required in development (the packaged app generates its own). Any long random string. |
| `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD` | Login of the demo superadmin created by `npm run seed:manual`. The app itself never seeds a default account. |

## Running

```bash
npm run dev          # Vite dev server on :3000 + Electron, with live reload
```

`npm run seed:manual` fills the development database with demo data (users for each role,
teachers, students, classes, enrollments and attendance). Quit the app first; the script runs with
Electron so it opens the same database and key as `npm run dev`. The demo superadmin logs in with
`SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` from `.env`; the other demo users are in
`src/db/seederFunctions.js`. For a larger, realistic data set, run the real-world e2e scenario and
open it with `npm run e2e:open-data`.

On first start the app asks you to create the first superadmin. In development the database is
in Electron's `userData` folder, like the installed app, so it survives restarts; delete it to
start over.

## Everyday Commands

```bash
npm run lint     # ESLint + Prettier on .js/.jsx/.mjs
npm run format   # Prettier --write
npm test         # Jest
npm run build    # renderer build to dist/renderer (needed by e2e tests)
npm run test:e2e # Playwright e2e suite
```

See [testing.md](testing.md) and [building.md](building.md).

## Making Changes

### A new IPC channel

1. Add the handler in `src/main/handlers/<feature>Handlers.js` inside its `register…Handlers()`
   function (`ipcMain.handle('feature:action', …)`), validating input with a Joi schema from
   `validationSchemas.js` where it takes user data.
2. Add the channel to `CHANNEL_ROLES` in `src/main/ipcSecurity.js` with the roles allowed to
   call it. A channel missing there is open to any logged-in user and logs a warning in
   development; only `PUBLIC_CHANNELS` work before login.
3. Expose it in `src/main/preload.js` as a named method
   (`doAction: (args) => ipcRenderer.invoke('feature:action', args)`).
4. Call it from the renderer: `await window.electronAPI.doAction(args)`.
5. Add a Jest test in `tests/` (see [testing.md](testing.md)).

### A database change

Add a new file `src/db/migrations/NNN-description.sql` with the next free number. Migrations
run in filename order at startup, on fresh and existing databases alike (fresh installs run
`schema.js` first). The runner records each file by **name**, so never rename, renumber or edit
a migration that has shipped: add a new one. Each file runs in one transaction. If it fails with
"duplicate column name" the runner rolls the whole file back and records it as applied, so any
other statement in that file never runs: keep an `ALTER TABLE … ADD COLUMN` in a file of its own
(or last).

### UI

Pages are in `src/renderer/pages/`, reusable pieces in `src/renderer/components/`. Import with
the `@renderer/…` alias. All user-facing text is Arabic and the layout is right-to-left; use
Bootstrap classes first and the files in `src/renderer/styles/` for the rest. Check permissions
with `usePermissions()` and the `PERMISSIONS` constants in `utils/permissions.js`.

## Conventions

- **Formatting:** Prettier (single quotes, trailing commas, 100 columns); `npm run lint` fails
  on differences.
- **Messages:** errors thrown to the renderer and toasts are in Arabic.
- **Logging:** use `src/main/logger.js` (`log`, `warn`, `error`) in the main process and
  `@renderer/utils/logger` in the renderer, not `console`. The main-process logger redacts
  secrets.
- **Dates:** SQLite stores local dates as `YYYY-MM-DD` / `YYYY-MM-DD HH:MM:SS`. Use
  `toLocalISODate` / `toLocalISODateTime` (`src/main/utils/dates.js`, `src/renderer/utils/dates.js`),
  not `toISOString()`, which converts to UTC and can move a date to the previous day.
- **Money:** amounts are dinars with millimes; round with `roundCurrency` (`src/main/utils.js`).
- **Ages:** use `calculateAge` from `utils/age.js` (one copy per process; keep them in step).
- **SQL:** always parameterized (`?` placeholders); build column lists only from whitelists.

## Paths in Electron + Vite

- **Imports:** the renderer uses Vite aliases (`@renderer`, `@main`, `@db`, `@` in
  `vite.config.mjs`). The main process is not bundled, so it uses plain relative `require`s.
- **Files at runtime:** build absolute paths with `path.join`. User data (database, logs, key
  store) goes under `app.getPath('userData')`; files shipped with the app are read relative to
  `__dirname` (inside the `.asar` archive, read-only) or `process.resourcesPath`. Branch logos
  are served to the renderer through the `safe-image://` protocol, which only serves files under
  those folders.

## Design Notes

### Matricules

Students, teachers, users, groups and inventory items get a readable, unique number generated by
`services/matriculeService.js`: a prefix (`S-`, `T-`, `U-`, `G-`, `INV-`) and a 4-digit
sequence (`S-0001`). Excel imports use it to update an existing record instead of creating a
duplicate, and it is searchable in the UI.

### Age groups

Age groups (`age_groups`) drive which students fit a class and how they are billed. Each has an
age range (`max_age` NULL = no upper limit), a `gender` (`any`, `male_only`, `female_only`), a
`gender_policy` (`mixed`, `separated`, `single_gender`), a `payment_frequency` (`MONTHLY` or
`ANNUAL`) and optional `annual_fee` / `monthly_fee` (empty = the branch fees from the settings).
Classes point to one through `classes.age_group_id`; the older `classes.gender` column is kept for
compatibility.

A fresh database gets these groups from migrations 043 and 048:

| uuid | Ages | Gender | Policy |
|---|---|---|---|
| `children-6-11` | 6-11 | any | mixed |
| `teens-12-17` | 12-17 | any | mixed |
| `youth-boys-12-14` / `youth-girls-12-14` | 12-14 | male_only / female_only | separated |
| `young-adults-boys-15-17` / `young-adults-girls-15-17` | 15-17 | male_only / female_only | separated |
| `men-18-plus` / `women-18-plus` | 18+ | male_only / female_only | single_gender |

Channels: `ageGroups:get`, `ageGroups:create`, `ageGroups:update`, `ageGroups:delete`,
`ageGroups:matchStudent`, `ageGroups:validateStudentForClass`, `students:getByAgeGroup`.
