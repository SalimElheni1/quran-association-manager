// tests/db/migrationRepair.spec.js
// Regression for the 1.4.0 upgrade that would not start: a database from an earlier build
// already had age_groups.annual_fee, so migration 057 failed on its first ALTER with
// "duplicate column name", the runner marked the whole file applied, and
// students.fee_age_group_id was never added. Migration 060 then failed with
// "no such column: fee_age_group_id" on every launch. 059a-059d add the missing column back.

const { useRealDb } = require('./helpers/realDb');

const ctx = useRealDb();
const db = require('../../src/db/db');

const REPAIRS = [
  '059a-repair-age-groups-payment-frequency.sql',
  '059b-repair-age-groups-annual-fee.sql',
  '059c-repair-age-groups-monthly-fee.sql',
  '059d-repair-students-fee-age-group-id.sql',
];

const columnsOf = (table) => ctx.all(`PRAGMA table_info(${table})`).map((c) => c.name);

// Rebuilds `students` without fee_age_group_id (SQLite cannot DROP a column that has a
// foreign key) and forgets the migrations a database in that state had not applied yet.
function recreateSkipped057State() {
  const conn = db.getDb();
  const { sql } = ctx.get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'students'",
  );
  const withoutColumn = sql.replace(
    /,\s*fee_age_group_id INTEGER REFERENCES age_groups\(id\) ON DELETE SET NULL/i,
    '',
  );
  expect(withoutColumn).not.toMatch(/fee_age_group_id/);
  const keep = columnsOf('students')
    .filter((c) => c !== 'fee_age_group_id')
    .join(', ');

  conn.pragma('foreign_keys = OFF');
  conn.exec(`
    ${withoutColumn.replace(/CREATE TABLE\s+"?students"?/i, 'CREATE TABLE students_old_shape')};
    INSERT INTO students_old_shape (${keep}) SELECT ${keep} FROM students;
    DROP TABLE students;
    ALTER TABLE students_old_shape RENAME TO students;
  `);
  conn.pragma('foreign_keys = ON');

  const forget = conn.prepare('DELETE FROM migrations WHERE name = ?');
  [...REPAIRS, '060-retire-unused-teens-age-group.sql'].forEach((name) => forget.run(name));
}

describe('repair migrations for a database where 057 was skipped', () => {
  test('a fresh database has every repaired column and records the repair files', () => {
    expect(columnsOf('age_groups')).toEqual(
      expect.arrayContaining(['payment_frequency', 'annual_fee', 'monthly_fee']),
    );
    expect(columnsOf('students')).toContain('fee_age_group_id');
    const applied = ctx.all('SELECT name FROM migrations').map((r) => r.name);
    expect(applied).toEqual(expect.arrayContaining(REPAIRS));
  });

  test('the app starts again: the missing column is added and 060 applies', async () => {
    ctx.run(
      `INSERT INTO age_groups (uuid, name, min_age, max_age, gender, is_active)
       VALUES ('teens-12-17', 'teens', 12, 17, 'any', 1)
       ON CONFLICT(uuid) DO UPDATE SET is_active = 1`,
    );
    recreateSkipped057State();
    expect(columnsOf('students')).not.toContain('fee_age_group_id');

    await db.closeDatabase();
    await db.initializeDatabase();

    expect(columnsOf('students')).toContain('fee_age_group_id');
    const applied = ctx.all('SELECT name FROM migrations').map((r) => r.name);
    expect(applied).toEqual(
      expect.arrayContaining([...REPAIRS, '060-retire-unused-teens-age-group.sql']),
    );
    // 060 ran: the unused overlapping group is retired.
    expect(ctx.get("SELECT is_active FROM age_groups WHERE uuid = 'teens-12-17'").is_active).toBe(
      0,
    );
  });
});
