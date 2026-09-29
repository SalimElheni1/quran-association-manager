# Testing Guide

The app has two test layers:

- **Jest** unit and integration tests. They run in Node without Electron: the database, Electron,
  and a few libraries are mocked, so they are fast and run in CI on every release.
- **Playwright** end-to-end tests. They launch the real Electron app (main process, preload
  bridge, encrypted SQLite database, built renderer) and drive it like a user.

## Commands

```bash
npm test                                 # all Jest tests
npm test -- tests/studentHandlers.spec.js   # one file
npm test -- -t "minimum age"             # tests whose name matches
npm test -- --coverage                   # with a coverage report in coverage/
npm run lint                             # ESLint + Prettier (run before pushing)

npm run test:e2e                         # build the renderer, then the e2e suite
npm run test:e2e:debug                   # same, with the Playwright inspector
npm run test:e2e:report                  # open the last HTML report
npm run test:e2e:realworld               # the long real-world scenario (see below)
npm run e2e:open-data                    # open the data the real-world scenario left behind
```

## Jest

`jest.config.js` defines two projects:

| Project | Environment | Files | Notes |
|---|---|---|---|
| `main-process` | node | `tests/*.spec.js` | `moduleNameMapper` swaps `electron`, `electron-store`, `bcryptjs`, `jsonwebtoken`, `joi`, `exceljs`, `pizzip`, `fs` and `../db/db` for the mocks in `tests/mocks/`. |
| `renderer-process` | jsdom | `tests/renderer/**/*.spec.js` | Babel transforms JSX; `@renderer/*` resolves to `src/renderer/*`; `tests/renderer/setup.js` loads jest-dom and stubs `window.electronAPI` and `react-toastify`. |

Only those two patterns run. A spec anywhere else is silently skipped, so put new specs in
`tests/` or `tests/renderer/`.

### Main-process tests

Handler tests register the handlers and call them through the mocked `ipcMain`:

```javascript
const { ipcMain } = require('electron');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');
const db = require('../src/db/db');

jest.mock('../src/db/db');
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));

beforeAll(() => registerStudentHandlers());

it('deletes a student', async () => {
  db.runQuery.mockResolvedValue({ changes: 1 });
  await ipcMain.invoke('students:delete', 1);
  expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM students WHERE id = ?', [1]);
});
```

- `joi` is mocked in this project, so a handler test controls what validation returns
  (`schema.validateAsync.mockResolvedValue(...)`). To test a real schema, load Joi past the
  mapper as `tests/settingsSchema.spec.js` does:
  `require('../node_modules/joi/lib/index.js')`. (`validationSchemas*.spec.js` run against the
  mock, so they check wiring rather than the validation rules.)
- Code that depends on today's date should take the date as a parameter, or use
  `jest.useFakeTimers()` + `jest.setSystemTime(...)`, so results don't change with the calendar.
- Errors shown to users are in Arabic; assert on the handler's own message.

### Renderer tests

```javascript
import { render, screen } from '@testing-library/react';
import StatCard from '@renderer/components/StatCard';

it('shows the value', () => {
  render(<StatCard title="الطلاب" value={12} />);
  expect(screen.getByText('12')).toBeInTheDocument();
});
```

Stub any extra `window.electronAPI` method a component calls in the test itself.

## End-to-end tests (Playwright + Electron)

Specs live in `tests/e2e/` and end in `.e2e.js`, so Jest never picks them up. They run against
the built renderer (`dist/renderer`), which `npm run test:e2e` builds first.

`tests/e2e/fixtures.js` provides:

- `electronApp` / `page`: a fresh app with a throwaway user-data directory (fresh encrypted
  database) for every test.
- `authedPage`: the same, with the first superadmin created, logged in and onboarding dismissed.
- Helpers: `login`, `logout`, `navigate(page, sidebarLabel)`, `modal`, `expectToast`,
  `confirmDialog`, `createUser`, `setAppDate` (moves the main-process clock), and `launchApp`
  to relaunch on the same data.

```javascript
const { test, expect, navigate } = require('./fixtures');

test('students page opens', async ({ authedPage: page }) => {
  await navigate(page, 'شؤون الطلاب');
  await expect(page.locator('table.students-table')).toBeVisible();
});
```

The app runs in e2e mode (`QBM_E2E=1`): data goes to the temporary directory, the keyring is
replaced by a `basic` password store, and `QBM_E2E_NOW` can set the app clock. Tests run one at a
time (`workers: 1`). On Linux without a display, use `xvfb-run -a npm run test:e2e`.

### Real-world scenario, screenshots and video guide

These are opt-in, selected by environment variables in `playwright.config.js`:

| Command | Variable | What it runs |
|---|---|---|
| `npm run test:e2e:realworld` | `QBM_REALWORLD=1` | `tests/e2e/realworld/`: a branch's first weeks at scale (120+ students, staff per role, fees, income, expenses, in-kind donations, inventory, attendance), then a backup restored on a fresh install and more work on it; and a months scenario that moves the clock from September to January across an academic-year rollover. Data is kept in `e2e-artifacts/` for `npm run e2e:open-data`. |
| `npm run docs:screenshots` | `QBM_SCREENSHOTS=1` | `tests/e2e/readme/`: the README screenshots in `docs/screenshots/`, taken from the real-world data. |
| `npm run docs:guide` | `QBM_GUIDE=1` | `tests/e2e/guide/`: the Arabic video guide (see the README). |

## Before pushing

1. `npm run lint`
2. `npm test`
3. For UI or handler changes: `npm run test:e2e` (or the specs for the pages you touched,
   e.g. `npx playwright test tests/e2e/students.e2e.js` after `npm run build`).

The release workflow runs lint and Jest on every version tag and does not build the installer
if they fail.
