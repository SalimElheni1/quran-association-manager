// The migration runner (db.js) against a real database.
const fs = require('fs');
const path = require('path');
const { useRealDb } = require('./helpers/realDb');
const db = require('../../src/db/db');

const ctx = useRealDb();

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');

beforeEach(() => ctx.resetDatabase());

describe('migrations', () => {
  test('a new database records every migration file, each applied whole', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    const recorded = ctx.all('SELECT name FROM migrations ORDER BY name').map((r) => r.name);

    expect(recorded).toEqual(files);
  });

  test('a new database has no row with a broken foreign key', () => {
    expect(db.getDb().pragma('foreign_key_check')).toEqual([]);
  });

  test('migration 047 adds nothing twice: classes keep one age_group_id and its index', () => {
    const columns = ctx.all('PRAGMA table_info(classes)').filter((c) => c.name === 'age_group_id');
    const index = ctx.get(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_classes_age_group_id'",
    );

    expect(columns).toHaveLength(1);
    expect(index).toBeDefined();
  });

  test('only the ADD COLUMN of a column that exists is left out; the rest of the file runs', () => {
    const sql = `ALTER TABLE students ADD COLUMN name TEXT;
      ALTER TABLE students ADD COLUMN favourite_surah TEXT DEFAULT 'الفاتحة';
      CREATE INDEX IF NOT EXISTS idx_students_favourite ON students(favourite_surah);`;

    const kept = db.withoutExistingColumns(sql);
    db.getDb().exec(kept);

    expect(kept).not.toContain('ADD COLUMN name');
    expect(kept).toContain('ADD COLUMN favourite_surah');
    expect(ctx.all('PRAGMA table_info(students)').map((c) => c.name)).toContain('favourite_surah');
    expect(
      ctx.get("SELECT name FROM sqlite_master WHERE name = 'idx_students_favourite'"),
    ).toBeDefined();
  });

  test('a migration that fails part-way is rolled back and not recorded', async () => {
    const realReaddir = fs.readdirSync;
    const realReadFile = fs.readFileSync;
    jest
      .spyOn(fs, 'readdirSync')
      .mockImplementation((dir, ...rest) =>
        dir === MIGRATIONS_DIR
          ? [...realReaddir(dir, ...rest), '999-broken.sql']
          : realReaddir(dir, ...rest),
      );
    jest.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) =>
      String(file).endsWith('999-broken.sql')
        ? `ALTER TABLE students ADD COLUMN name TEXT;
           CREATE TABLE half_done (x);
           INSERT INTO no_such_table VALUES (1);`
        : realReadFile(file, ...rest),
    );
    ctx.expectErrorLogs();
    try {
      await db.closeDatabase();
      await expect(db.initializeDatabase()).rejects.toThrow();
    } finally {
      fs.readdirSync.mockRestore();
      fs.readFileSync.mockRestore();
    }

    await db.initializeDatabase();
    expect(ctx.get("SELECT name FROM migrations WHERE name = '999-broken.sql'")).toBeUndefined();
    expect(ctx.get("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toBeUndefined();
  });
});
