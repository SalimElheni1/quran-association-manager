// SEC-017: re-encrypting the database with a new key, against a real encrypted SQLite file.
const Database = require('better-sqlite3-multiple-ciphers');
const { useRealDb } = require('./helpers/realDb');
const { registerSystemHandlers } = require('../../src/main/handlers/systemHandlers');
const keyManager = require('../../src/main/keyManager');
const db = require('../../src/db/db');

const ctx = useRealDb({ register: [registerSystemHandlers] });

beforeEach(async () => {
  await ctx.resetDatabase();
});

/** Whether `key` opens the database file (a separate connection, like a fresh start). */
function opensWith(key) {
  const probe = new Database(db.getDatabasePath(), { fileMustExist: true });
  try {
    probe.pragma(`key = '${key}'`);
    probe.prepare('SELECT count(*) FROM sqlite_master').get();
    return true;
  } catch {
    return false;
  } finally {
    probe.close();
  }
}

const migrationCount = () => ctx.get('SELECT count(*) AS n FROM migrations').n;

describe('rotateDatabaseKey', () => {
  test('re-encrypts the file with a new live key; the old key no longer opens it', async () => {
    const oldKey = keyManager.getDbKey();
    const rows = migrationCount();

    await db.rotateDatabaseKey();

    const newKey = keyManager.getDbKey();
    expect(newKey).toMatch(/^[0-9a-f]{64}$/);
    expect(newKey).not.toBe(oldKey);
    expect(opensWith(newKey)).toBe(true);
    expect(opensWith(oldKey)).toBe(false);
    expect(keyManager.getPendingDbKey()).toBeNull();
    expect(migrationCount()).toBe(rows);
    expect(db.getDb().pragma('journal_mode', { simple: true })).toBe('wal');
  });

  test('a rotation interrupted after re-keying is finished at the next start', async () => {
    const newKey = keyManager.generateDbKey();
    keyManager.setPendingDbKey(newKey);
    db.getDb().pragma('journal_mode = DELETE');
    db.getDb().pragma(`rekey = '${newKey}'`);
    await db.closeDatabase();

    await db.initializeDatabase();

    expect(keyManager.getDbKey()).toBe(newKey);
    expect(keyManager.getPendingDbKey()).toBeNull();
    expect(migrationCount()).toBeGreaterThan(0);
  });

  test('a rotation interrupted before re-keying leaves the old key and drops the pending one', async () => {
    const oldKey = keyManager.getDbKey();
    keyManager.setPendingDbKey(keyManager.generateDbKey());
    await db.closeDatabase();

    await db.initializeDatabase();

    expect(keyManager.getDbKey()).toBe(oldKey);
    expect(keyManager.getPendingDbKey()).toBeNull();
    expect(opensWith(oldKey)).toBe(true);
  });
});

// The database key stays automatic: no screen rotates it any more (removed 2026-10-02), so the
// channel that did must not come back by accident.
describe('db:rotate-key', () => {
  test('is no longer registered', () => {
    expect(require('electron').__handlers.has('db:rotate-key')).toBe(false);
  });
});
