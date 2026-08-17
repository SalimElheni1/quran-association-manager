// tests/importManager.sqlRestore.spec.js
// Verifies the SQL restore path handles real-world backup dumps:
// - statement splitting respects string literals, quoted identifiers and comments
// - column fixing (dropping columns absent from the current schema) survives
//   parentheses and commas inside string values, multi-row inserts, INSERT OR
//   IGNORE commands and leading comment lines

jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn() })),
);
jest.mock('pizzip');
jest.mock('electron');
jest.mock('exceljs');
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/services/matriculeService');
jest.mock('../src/main/keyManager');

const { splitSqlList, parseValuesRows, fixStatementColumns } = require('../src/main/importManager');

describe('splitSqlList (SQL-aware statement splitting)', () => {
  it('splits on the delimiter outside of strings, quotes and comments', () => {
    const sql = "SELECT 1; SELECT 'a;b'; SELECT \"c;d\"; -- don't split ; here\nSELECT 2";
    expect(splitSqlList(sql, ';')).toEqual([
      'SELECT 1',
      "SELECT 'a;b'",
      'SELECT "c;d"',
      "-- don't split ; here\nSELECT 2",
    ]);
  });

  it('ignores escaped quotes inside string literals', () => {
    expect(splitSqlList("SELECT 'it''s; ok'; SELECT 2", ';')).toEqual([
      "SELECT 'it''s; ok'",
      'SELECT 2',
    ]);
  });

  it('drops empty fragments and trims whitespace', () => {
    expect(splitSqlList('  ; ; SELECT 1 ; ; ', ';')).toEqual(['SELECT 1']);
  });
});

describe('parseValuesRows (VALUES section parsing)', () => {
  it('keeps parentheses and commas inside string literals intact', () => {
    expect(parseValuesRows(" (1, 'a (x)', 'b,c'), (2, NULL, 'd')")).toEqual([
      ['1', "'a (x)'", "'b,c'"],
      ['2', 'NULL', "'d'"],
    ]);
  });

  it('handles escaped quotes and comments', () => {
    expect(parseValuesRows(" (1, 'it''s') -- row comment\n, (2, 'y')")).toEqual([
      ['1', "'it''s'"],
      ['2', "'y'"],
    ]);
  });
});

describe('fixStatementColumns (schema drift repair)', () => {
  it('preserves string values containing parentheses', () => {
    const stmt =
      'REPLACE INTO "age_groups" ("id", "name", "description", "min_age") VALUES (2, \'الناشئون (ذكور)\', \'desc (12-14)\', 12)';
    expect(
      fixStatementColumns(stmt, ['id', 'name', 'description', 'min_age', 'uuid'], ['uuid']),
    ).toBe(
      'REPLACE INTO "age_groups" ("id", "name", "description", "min_age") VALUES (2, \'الناشئون (ذكور)\', \'desc (12-14)\', 12)',
    );
  });

  it('preserves string values containing commas', () => {
    const stmt =
      'REPLACE INTO "expenses" ("id", "amount", "description") VALUES (1, 50, \'x, y and z\')';
    expect(fixStatementColumns(stmt, ['id', 'amount', 'description', 'notes'], ['notes'])).toBe(
      'REPLACE INTO "expenses" ("id", "amount", "description") VALUES (1, 50, \'x, y and z\')',
    );
  });

  it('fixes every row of a multi-row VALUES insert', () => {
    const stmt =
      'REPLACE INTO "age_groups" ("id", "name", "description") VALUES (1, \'a\', \'x (1)\'), (2, \'b\', \'y (2)\')';
    expect(fixStatementColumns(stmt, ['id', 'name', 'description', 'uuid'], ['uuid'])).toBe(
      'REPLACE INTO "age_groups" ("id", "name", "description") VALUES (1, \'a\', \'x (1)\'), (2, \'b\', \'y (2)\')',
    );
  });

  it('preserves INSERT OR IGNORE semantics', () => {
    const stmt = 'INSERT OR IGNORE INTO "settings" ("key", "value") VALUES (\'k\', \'v\')';
    expect(fixStatementColumns(stmt, ['key', 'value', 'extra'], ['extra'])).toBe(
      'INSERT OR IGNORE INTO "settings" ("key", "value") VALUES (\'k\', \'v\')',
    );
  });

  it('strips leading comment lines before matching', () => {
    const stmt = '-- comment line\nREPLACE INTO "users" ("id", "name") VALUES (1, \'x\')';
    expect(fixStatementColumns(stmt, ['id', 'name', 'old_col'], ['old_col'])).toBe(
      'REPLACE INTO "users" ("id", "name") VALUES (1, \'x\')',
    );
  });

  it('preserves escaped quotes in values', () => {
    const stmt = 'REPLACE INTO "users" ("id", "notes") VALUES (1, \'it\'\'s fine\')';
    expect(fixStatementColumns(stmt, ['id', 'notes', 'x'], ['x'])).toBe(
      'REPLACE INTO "users" ("id", "notes") VALUES (1, \'it\'\'s fine\')',
    );
  });

  it('pads missing values with NULL', () => {
    const stmt = 'REPLACE INTO "x" ("a", "b", "c") VALUES (1, 2)';
    expect(fixStatementColumns(stmt, ['a', 'b', 'c', 'd'], ['d'])).toBe(
      'REPLACE INTO "x" ("a", "b", "c") VALUES (1, 2, NULL)',
    );
  });

  it('returns null for non-insert statements', () => {
    expect(fixStatementColumns('CREATE TABLE IF NOT EXISTS users (id INTEGER)', [], [])).toBeNull();
  });
});
