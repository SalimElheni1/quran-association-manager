// Lets the desktop main-process code (src/main, src/db) run on the web server unchanged.
// Must be required before any of that code. It redirects a few modules:
//   electron, electron-store             → shims (per-request, per-branch)
//   src/db/db.js                         → the PostgreSQL adapter
//   src/main/settingsManager.js          → no cross-branch settings cache
//   src/main/logger.js                   → stdout with the branch id, no log file
//   src/main/index.js                    → the Electron entry point is never loaded
//   better-sqlite3-multiple-ciphers      → the Node build in web/node_modules (desktop imports)

const Module = require('module');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SHIMS = path.join(__dirname, 'shims');

const BARE = new Map([
  ['electron', path.join(SHIMS, 'electron.js')],
  ['electron-store', path.join(SHIMS, 'electron-store.js')],
  ['better-sqlite3-multiple-ciphers', require.resolve('better-sqlite3-multiple-ciphers')],
]);

const FILES = new Map([
  [path.join(ROOT, 'src', 'db', 'db.js'), path.join(__dirname, 'db', 'adapter.js')],
  [path.join(ROOT, 'src', 'main', 'settingsManager.js'), path.join(SHIMS, 'settingsManager.js')],
  [path.join(ROOT, 'src', 'main', 'logger.js'), path.join(SHIMS, 'logger.js')],
  [path.join(ROOT, 'src', 'main', 'index.js'), path.join(SHIMS, 'mainIndex.js')],
]);

let installed = false;

function install() {
  if (installed) return;
  installed = true;
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function resolveForWeb(request, parent, isMain, options) {
    if (BARE.has(request)) return BARE.get(request);
    const resolved = originalResolve.call(this, request, parent, isMain, options);
    return FILES.get(resolved) || resolved;
  };
}

install();

module.exports = { ROOT, install };
