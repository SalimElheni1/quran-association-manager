// SEC-017: re-encrypting the database with a new key, against a real encrypted SQLite file.
const Database = require('better-sqlite3-multiple-ciphers');
const bcrypt = require('bcryptjs');
const { useRealDb } = require('./helpers/realDb');
const { registerSystemHandlers } = require('../../src/main/handlers/systemHandlers');
const keyManager = require('../../src/main/keyManager');
const db = require('../../src/db/db');
const sessionManager = require('../../src/main/sessionManager');

const ctx = useRealDb({ register: [registerSystemHandlers] });

const PASSWORD = 'Zitouna#Fes2026';

beforeEach(async () => {
  await ctx.resetDatabase();
  ctx.run('UPDATE users SET password = ? WHERE id = ?', [
    await bcrypt.hash(PASSWORD, 4),
    ctx.user.id,
  ]);
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

describe('db:rotate-key', () => {
  test('is refused until the association transfer key is saved', async () => {
    const oldKey = keyManager.getDbKey();
    ctx.setSettings({ association_transfer_key: '' });

    const result = await ctx.invoke('db:rotate-key', { password: PASSWORD });

    expect(result.success).toBe(false);
    expect(result.message).toContain('رمز النقل الموحد');
    expect(keyManager.getDbKey()).toBe(oldKey);
  });

  test('is refused with a wrong password', async () => {
    const oldKey = keyManager.getDbKey();
    ctx.setSettings({ association_transfer_key: 'branch-transfer-key' });

    const result = await ctx.invoke('db:rotate-key', { password: 'not-my-password' });

    expect(result).toEqual({
      success: false,
      message: 'كلمة المرور الحالية التي أدخلتها غير صحيحة.',
    });
    expect(keyManager.getDbKey()).toBe(oldKey);
  });

  test('is reserved to the Superadmin', async () => {
    ctx.setSettings({ association_transfer_key: 'branch-transfer-key' });
    const oldKey = keyManager.getDbKey();

    await expect(
      ctx.invokeAs(['Administrator'], 'db:rotate-key', { password: PASSWORD }),
    ).rejects.toThrow('غير مسموح به.');

    expect(keyManager.getDbKey()).toBe(oldKey);
  });

  test('rotates the key, re-derives the session secret and ends every session', async () => {
    ctx.setSettings({ association_transfer_key: 'branch-transfer-key' });
    const oldKey = keyManager.getDbKey();
    const oldSecret = process.env.JWT_SECRET;
    // A logged-in window that can receive the force-logout signal.
    const sent = [];
    const sender = { id: 900, send: (channel) => sent.push(channel), isDestroyed: () => false };
    sessionManager.createSession(
      sender,
      { id: ctx.user.id, username: 'test-admin', roles: ['Superadmin'] },
      null,
    );
    const otherWindowId = ctx.event.sender.id;

    const handler = require('electron').__handlers.get('db:rotate-key');
    const result = await handler({ sender }, { password: PASSWORD });

    expect(result).toEqual({
      success: true,
      message: 'تم تغيير مفتاح تشفير قاعدة البيانات. يرجى تسجيل الدخول من جديد.',
    });
    expect(keyManager.getDbKey()).not.toBe(oldKey);
    expect(opensWith(keyManager.getDbKey())).toBe(true);
    expect(process.env.JWT_SECRET).toBe(keyManager.getJwtSecret());
    expect(process.env.JWT_SECRET).not.toBe(oldSecret);
    expect(sessionManager.getSession(sender.id)).toBeNull();
    expect(sessionManager.getSession(otherWindowId)).toBeNull();
    expect(sent).toEqual(['force-logout']);
  });
});
