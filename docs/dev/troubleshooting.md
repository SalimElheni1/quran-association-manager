# Developer Troubleshooting

Problems you are likely to meet while developing, building or testing. For problems users meet
in the installed app, see [docs/user/troubleshooting.md](../user/troubleshooting.md) (Arabic) and
[deployment.md](setup/deployment.md).

## Install and Native Module

The only native dependency is `better-sqlite3-multiple-ciphers`. Since version 13 it ships N-API
binaries for every platform inside the package (`prebuilds/<platform>.node`) and always loads
those, so the same file works under Electron and under plain Node, and nothing is compiled: no
build tools are needed, and neither `npm install` nor packaging rebuilds it (`npmRebuild: false`
in `electron-builder.yml`).

**"Failed to load the SQLite native module" / `ERR_DLOPEN_FAILED`**: the package is incomplete
(for example `node_modules` copied from another platform). Reinstall: `npm ci`.

- Scripts that need the app's database should run inside Electron, as `npm run seed:manual` does
  (`electron scripts/<script>.js`), so they see the app's data folder and key store.
- Jest does not need the module: the database is mocked in unit tests, which is why CI installs
  with `npm ci --ignore-scripts`.

## Running in Development

- **"FATAL ERROR: JWT_SECRET could not be derived"**: the session secret is derived from the
  database key (HKDF, `keyManager.getJwtSecret`); this error means the key could not be read or is
  not 64 hex characters. Check the key store (`db-secure-config.json` in the user data folder) and
  the OS keychain. `JWT_SECRET` in `.env` is no longer used.
- **Port 3000 in use**: `npm run dev` expects Vite on 3000 (the main process loads
  `http://localhost:3000`, and `ipcSecurity.js` only trusts that origin in development). Stop the
  other process rather than changing the port.
- **Every IPC call fails with «الوصول مرفوض.»**: the window is not on an allowed origin (see
  above), for example because the renderer was opened in a normal browser.
- **«مطلوب تسجيل الدخول.» after restarting Electron**: sessions live in the main process and do
  not survive a restart (live reload of the main process included); log in again.
- **Start from an empty database**: quit the app and delete `quran_assoc_manager.sqlite` (and the
  `-wal`/`-shm` files) from Electron's `userData` folder for this app. The app then asks for the
  first superadmin.

## Database

- **The file cannot be opened with the `sqlite3` CLI or DB Browser**: it is encrypted
  (SQLite3 Multiple Ciphers). Inspect data through the app, a backup export, or a script that uses
  `src/db/db.js` (run with Electron's Node, see above).
- **A migration failed**: the app stops starting and the log names the file. The file was rolled
  back and not recorded, so it runs again on the next start once fixed. Only an `ADD COLUMN`
  of a column that already exists is skipped (logged as a warning); see
  [development.md](setup/development.md#a-database-change).
- **"uq_fee_charges_monthly (or _annual) not created" in the log**: the database still holds a
  student charged twice for one month (or one academic year), from before the unique indexes.
  The app works without them; they are created at the first start after the duplicates are gone
  («إعادة ضبط الرسوم» removes the unpaid ones; paid ones have to be settled by hand).
- **Account balances look wrong**: they are recomputed from the transactions on every start
  (`recomputeAccountBalances`), so restart the app before investigating.

## Tests

- **A spec is never run**: Jest only picks up `tests/*.spec.js` and `tests/renderer/**/*.spec.js`.
- **A handler test sees validation that "doesn't validate"**: `joi` is mocked in the
  main-process project; see [testing.md](setup/testing.md).
- **"Renderer build not found"** in e2e tests: run `npm run build` (or use `npm run test:e2e`,
  which builds first).
- **Electron fails to start in e2e tests on Linux**: there is no display; run
  `xvfb-run -a npx playwright test`.
- **An e2e test fails only around a date**: the app clock can be set with `setAppDate` /
  `QBM_E2E_NOW`; make date-dependent tests set it.

## Build

- **`npm run dist` cannot find `release/.icon-ico/icon.ico`**: generate the icon first; see
  [building.md](setup/building.md#building-locally).
- **`npm run dist:ci` fails on signing**: it forces code signing and needs a certificate; use
  `npm run dist`.

## Logs

The main process writes `app-logs.txt` in the `userData` folder (secrets are redacted). In
development the log also goes to the terminal, and the renderer's DevTools console shows
renderer errors.

## Seeding

- **`npm run seed:manual` changes nothing you can see**: quit the app first, and run it from the
  project folder so it uses the dev app's data folder.
- **Linux as root (containers, CI)**: Electron refuses to start without `--no-sandbox`; run
  `npx electron --no-sandbox scripts/manual-seeder.js` (under `xvfb-run -a` without a display).
