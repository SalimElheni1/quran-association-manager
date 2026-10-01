// tests/db/helpers/realDb.js
// Gives a test file a real, migrated database in its own temporary directory, and a way to
// call the registered IPC handlers the way ipcMain would.
//
// Safety: the database must never be the developer's real one. 'electron' and 'electron-store'
// are mapped to in-memory mocks for this project (jest.config.js); this helper points the
// mocked app's userData at a fresh fs.mkdtempSync() directory under os.tmpdir() and refuses to
// open a database whose path resolves anywhere else.
//
// Usage (in a spec):
//   const { useRealDb } = require('./helpers/realDb');
//   const { registerGroupHandlers } = require('../../src/main/handlers/groupHandlers');
//   const ctx = useRealDb({ register: [registerGroupHandlers] });
//   test('...', async () => { await ctx.invoke('groups:add', {...}); ctx.get('SELECT ...'); });

const fs = require('fs');
const os = require('os');
const path = require('path');

const SENDER_ID = 1;
const ALL_ROLES = ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'];

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Throws unless `dbPath` resolves inside os.tmpdir() (symlinks resolved on both sides).
 * @param {string} dbPath
 */
function assertInsideTmpdir(dbPath) {
  const tmpRoot = fs.realpathSync(os.tmpdir());
  const resolved = path.join(fs.realpathSync(path.dirname(dbPath)), path.basename(dbPath));
  if (!isInside(resolved, tmpRoot)) {
    throw new Error(
      `REFUSING TO OPEN ${resolved}: db-integration tests only use a database under ${tmpRoot}. ` +
        'The electron mock is not in place, so this could be a real database.',
    );
  }
}

/**
 * Sets up a fresh database for the calling test file (beforeAll) and removes it (afterAll).
 * @param {object} [options]
 * @param {Array<Function>} [options.register] Handler registration functions to call once the
 *   database is open (e.g. registerGroupHandlers).
 * @returns {object} Context filled in by beforeAll: invoke/invokeAs/invokeWithoutSession for
 *   IPC calls, get/all/run for SQL assertions, setSettings, user, dir.
 */
function useRealDb(options = {}) {
  const register = options.register || [];
  const ctx = {
    dir: null,
    dbPath: null,
    user: null,
    event: { sender: { id: SENDER_ID } },
  };

  let db;
  let electron;
  let sessionManager;
  let nextSenderId = 100;

  function handlerFor(channel) {
    const handler = electron.__handlers.get(channel);
    if (!handler) throw new Error(`No IPC handler registered for '${channel}'.`);
    return handler;
  }

  // Calls a handler as the logged-in test user (a Superadmin with every role).
  ctx.invoke = (channel, ...args) => handlerFor(channel)(ctx.event, ...args);

  // Calls a handler as a logged-in user holding only the given roles.
  ctx.invokeAs = (roles, channel, ...args) => {
    const sender = { id: nextSenderId++ };
    sessionManager.createSession(sender, { id: ctx.user.id, username: 'limited', roles }, null);
    return handlerFor(channel)({ sender }, ...args);
  };

  // Calls a handler from a window nobody logged in from.
  ctx.invokeWithoutSession = (channel, ...args) =>
    handlerFor(channel)({ sender: { id: nextSenderId++ } }, ...args);

  ctx.get = (sql, params = []) =>
    db
      .getDb()
      .prepare(sql)
      .get(...params);
  ctx.all = (sql, params = []) =>
    db
      .getDb()
      .prepare(sql)
      .all(...params);
  ctx.run = (sql, params = []) =>
    db
      .getDb()
      .prepare(sql)
      .run(...params);

  // Settings rows the way settings:update stores them (strings), without starting its
  // schedulers.
  ctx.setSettings = (values) => {
    const stmt = db.getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    Object.entries(values).forEach(([key, value]) =>
      stmt.run(key, value === null || value === undefined ? '' : String(value)),
    );
  };

  // Opens a new database at ctx.dbPath (removing any previous file) and logs the test user in.
  async function openFreshDatabase() {
    if (db.isDbOpen()) await db.closeDatabase();
    sessionManager.revokeAllSessions();
    assertInsideTmpdir(ctx.dbPath);
    ['', '-wal', '-shm'].forEach((suffix) => fs.rmSync(`${ctx.dbPath}${suffix}`, { force: true }));

    await db.initializeDatabase();

    // A real user row: audit columns such as created_by_user_id point at users.
    ctx.user = await db.createSuperadminUser('test-admin', 'not-a-real-hash');
    sessionManager.createSession(
      ctx.event.sender,
      { id: ctx.user.id, username: ctx.user.username, roles: ALL_ROLES },
      null,
    );
  }

  // Starts over with an empty, migrated database (the registered handlers stay registered).
  ctx.resetDatabase = () => openFreshDatabase();

  // The message a call failed with. Use it instead of `.rejects.toThrow()` when a handler
  // rethrows a raw SqliteError: the native module keeps the SqliteError class of the first test
  // file its Jest worker ran, so in later files that error is not an `Error` of the current realm
  // and `.rejects.toThrow()` reports "did not throw" even though the call failed.
  ctx.rejectionMessage = async (promise) => {
    try {
      await promise;
    } catch (error) {
      return String(error && error.message);
    }
    throw new Error('Expected the call to fail, but it succeeded.');
  };

  // Console output a test expects, silenced for that test only (restored after it).
  let consoleSpies = [];
  const silence = (method) => {
    const spy = jest.spyOn(console, method).mockImplementation(() => {});
    consoleSpies.push(spy);
    return spy;
  };
  // For a test that exercises an error path: the handler's console.error is expected there.
  ctx.expectErrorLogs = () => silence('error');
  // For handlers that trace every step with console.log (e.g. recordStudentPayment).
  ctx.quietLogs = () => silence('log');
  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    consoleSpies = [];
  });

  beforeAll(async () => {
    if (!process.versions.electron) {
      throw new Error(
        'db-integration tests need Electron’s Node (the SQLite module is built for it). ' +
          'Run them with `npm run test:db`.',
      );
    }
    electron = require('electron');
    if (typeof electron.__setUserDataDir !== 'function') {
      throw new Error(
        "'electron' is not mapped to tests/db/helpers/electronMock.js; refusing to open a database.",
      );
    }

    ctx.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbm-db-test-'));
    electron.__setUserDataDir(ctx.dir);

    db = require('../../../src/db/db');
    sessionManager = require('../../../src/main/sessionManager');

    ctx.dbPath = db.getDatabasePath();
    assertInsideTmpdir(ctx.dbPath);
    if (fs.existsSync(ctx.dbPath)) {
      throw new Error(`Expected a new database, but ${ctx.dbPath} already exists.`);
    }

    await openFreshDatabase();

    register.forEach((registerHandlers) => registerHandlers());
  });

  afterAll(async () => {
    if (sessionManager) sessionManager.revokeAllSessions();
    if (db) await db.closeDatabase();
    if (electron) electron.__setUserDataDir(null);
    if (ctx.dir) {
      // Only ever remove the directory this helper created.
      assertInsideTmpdir(path.join(ctx.dir, 'x'));
      fs.rmSync(ctx.dir, { recursive: true, force: true });
    }
  });

  return ctx;
}

module.exports = { useRealDb, assertInsideTmpdir, ALL_ROLES };
