// SEC-002: the database key goes into a SQLCipher PRAGMA, so db.js must refuse any key that is
// not the 64 hex characters the app generates — before the database file is opened or created.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertInsideTmpdir } = require('./helpers/realDb');

let mockKey;
jest.mock('../../src/main/keyManager', () => ({
  ...jest.requireActual('../../src/main/keyManager'),
  getDbKey: () => mockKey,
}));

describe('database key validation (real db.js)', () => {
  let electron;
  let db;
  let dir;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    electron = require('electron');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbm-db-key-'));
    electron.__setUserDataDir(dir);
    db = require('../../src/db/db');
    assertInsideTmpdir(db.getDatabasePath());
  });

  afterEach(async () => {
    await db.closeDatabase();
    electron.__setUserDataDir(null);
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it.each([
    ['empty', ''],
    ['short', 'ab'.repeat(16)],
    ['non-hex', 'z'.repeat(64)],
    ['one that would end the PRAGMA string', `${'a'.repeat(60)}'; --`],
  ])('refuses a %s key without creating the database file', async (_label, key) => {
    mockKey = key;

    await expect(db.initializeDatabase()).rejects.toThrow(
      'Invalid database encryption key: expected 64 hexadecimal characters.',
    );
    expect(fs.existsSync(db.getDatabasePath())).toBe(false);
    expect(db.isDbOpen()).toBeFalsy();
  });

  it('opens an encrypted database with a valid key', async () => {
    mockKey = 'c3'.repeat(32);

    await db.initializeDatabase();

    expect(db.isDbOpen()).toBe(true);
    const header = fs.readFileSync(db.getDatabasePath()).subarray(0, 16).toString('latin1');
    expect(header).not.toBe('SQLite format 3\u0000');
  });
});
