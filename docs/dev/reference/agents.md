# Quick Reference for AI Agents

A short map of the project for AI coding agents. The working rules are in the root
[AGENTS.md](../../../AGENTS.md): never delete or refactor away work unrelated to the task, and
ask before removing any feature.

## Project

An Electron desktop app (Windows) for managing a Quranic association branch, offline, in Arabic
(RTL).

- **Main process:** Node.js/CommonJS in `src/main/` (not bundled).
- **Renderer:** React 19 + Vite + Bootstrap in `src/renderer/`.
- **Database:** SQLite, encrypted (`better-sqlite3-multiple-ciphers`), in `src/db/`.

Details: [project-structure.md](project-structure.md), [architecture.md](../specs/architecture.md),
[development.md](../setup/development.md).

## Commands

```bash
npm install
npm run dev        # Vite on :3000 + Electron (needs JWT_SECRET in .env; see .env.example)
npm run lint       # must pass
npm test           # Jest, must pass
npm run test:e2e   # Playwright against the built app (xvfb-run -a on a headless Linux box)
```

## Adding an IPC channel

1. `ipcMain.handle('feature:action', …)` in `src/main/handlers/<feature>Handlers.js`; validate
   input with Joi.
2. Add the channel and its allowed roles to `CHANNEL_ROLES` in `src/main/ipcSecurity.js`.
3. Expose a named method in `src/main/preload.js`:
   `doAction: (args) => ipcRenderer.invoke('feature:action', args)`.
4. Call `window.electronAPI.doAction(args)` from the renderer (there is no generic `invoke`).
5. Run `npm run docs:api` to refresh [api.md](../specs/api.md), and add a Jest test.

## Changing the database

Add `src/db/migrations/NNN-description.sql` with the next free number. Never rename or edit a
shipped migration (they are tracked by filename). Keep an `ALTER TABLE … ADD COLUMN` in its own
file. See [development.md](../setup/development.md#a-database-change).

## Changing the UI

Pages in `src/renderer/pages/`, components in `src/renderer/components/` (financial UI in
`components/financial/`), imported with `@renderer/…`. User-facing text is Arabic. Use
`toLocalISODate` for dates, `calculateAge` from `utils/age.js` for ages, and
`@renderer/utils/logger` instead of `console`.

## Tests

- Main-process specs: `tests/*.spec.js`; renderer specs: `tests/renderer/**/*.spec.js`. Files
  elsewhere are not run.
- E2E specs: `tests/e2e/*.e2e.js`, using the fixtures in `tests/e2e/fixtures.js`.

See [testing.md](../setup/testing.md).
