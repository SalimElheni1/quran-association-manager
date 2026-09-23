/**
 * qbm-demo — Playwright-free Electron capture driver.
 *
 * Boots the REAL app end-to-end (real main process, real preload bridge,
 * real better-sqlite3 DB, real Arabic RTL renderer) and captures portfolio
 * PNGs using ONLY Electron's built-ins:
 *   - webContents.capturePage() → nativeImage → toPNG()
 *   - webContents.executeJavaScript() → drive the real login + real nav
 *
 * No Playwright package, no browser driver, no extra dependency. The app is
 * launched via this file AS the Electron main entry, so the real
 * src/main/index.js boots inside it and the capture hooks attach to the real
 * browser-window it creates.
 *
 * Screenshots land in qbm-demo/ (gitignored portfolio-only output) and match
 * the exact 9 portfolio areas of the earlier demo run.
 *
 * REQUIRES the renderer to be up first (the app loads http://localhost:3000):
 *   npm run react-dev &
 *   npx electron scripts/capture-demo.js
 */
process.env.QBM_DEMO_CAPTURE = '1';

const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '..', 'qbm-demo');

// Each portfolio area maps to the real React Router route it lives on.
// Dashboard is the index route ('/'); all others match App.jsx routes exactly.
const ROUTES = [
  { key: '01-dashboard', selector: 'a[href="/"]' },
  { key: '02-students', selector: 'a[href="/students"]' },
  { key: '03-teachers', selector: 'a[href="/teachers"]' },
  { key: '04-classes', selector: 'a[href="/classes"]' },
  { key: '05-attendance', selector: 'a[href="/attendance"]' },
  { key: '06-financials', selector: 'a[href="/financials"]' },
  { key: '07-users', selector: 'a[href="/users"]' },
  { key: '08-profile', selector: 'a[href="/profile"]' },
  { key: '09-settings', selector: 'a[href="/settings"]' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runJS(win, code) {
  return win.webContents.executeJavaScript(code, true);
}

async function capturePage(win, name) {
  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, png);
  return file;
}

async function login(win) {
  const done = await runJS(
    win,
    `(() => {
      const user = document.querySelector('#username');
      if (!user) return false来信;
      const setVal = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      ).set;
      setVal.call(user, 'admin');
      user.dispatchEvent(new Event('input', { bubbles: true }));
      const pass = document.querySelector('input[type="password"]');
      if (pass) {
        setVal.call(pass, 'admin123');
        pass.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const btn = [...document.querySelectorAll('button')].find(
        (b) => (b.textContent || '').includes('تسجيل الدخول'),
      );
      if (btn) btn.click();
      return true;
    })()`,
  );
  return done;
}

async function goRoute(win, selector) {
  const clicked = await runJS(
    win,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`,
  );
  return clicked;
}

async function walk(win) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Dev builds force-open DevTools; close it so the shots are clean/portfolio.
  win.webContents.closeDevTools();
  await sleep(200);

  // Give the real renderer time to mount LoginPage at localhost:3000.
  await sleep(1500);
  const loggedIn = await login(win);
  console.log(`[qbm-demo] login form ${loggedIn ? 'driven' : 'skipped (already authed)'}`);
  await sleep(1600);

  for (const route of ROUTES) {
    const clicked = await goRoute(win, route.selector);
    await sleep(vid(route.key === '01-dashboard' ? 600 : 1000));
    const file = clicked ? await capturePage(win, route.key) : await capturePage(win, route.key);
    console.log(`[qbm-demo] ${route.key} → ${path.relative(process.cwd(), file)}`);
  }
  console.log('[qbm-demo] done — real renderer screenshots in qbm-demo/');
  app.quit();
}

const { app, BrowserWindow } = require('electron');

// Boot against the SAME userData as your real daily dev flow, otherwise the
// app opens a fresh empty ~/.config/Electron/ DB and dies at src/db/db.js:353
// with "no such table: migrations / Incorrect password or corrupt database".
// The real app persists to ~/.config/quran-branch-manager/quran_assoc_manager.sqlite.
app.setPath('userData', path.join(app.getPath('home'), '.config', 'quran-branch-manager'));

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => walk(win), 300);
  });
});

// Boot the REAL application main (real DB, real IPC, real preload, real window)
// inside this electron entry — the capture hooks above attach to the window it
// really creates.
require(path.join(__dirname, '..', 'src', 'main', 'index.js'));
