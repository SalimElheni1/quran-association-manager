// Runs the shared handlers' SQLite SQL on PostgreSQL.
//
// The handlers in src/main were written for better-sqlite3: `?` placeholders, INSERT OR
// IGNORE / OR REPLACE, camelCase aliases, and SQLite's loose typing ('5' = 5). Functions SQLite
// has and Postgres lacks live in the compat schema (compat.sql). This module covers the rest:
// it rewrites the statement once (cached) and renders each call's values as literals.
//
// Values are rendered as quoted literals because Postgres types an untyped literal from its
// context, the way SQLite accepts '5' for an INTEGER column, which typed bind parameters
// would not. Strings are escaped by doubling quotes; the connection forces
// standard_conforming_strings = on, so a backslash is never an escape character.

const MAX_CACHE = 2000;
const cache = new Map();

// INSERT OR REPLACE needs the conflict target Postgres wants spelled out.
const REPLACE_KEYS = {
  settings: ['key'],
  user_roles: ['user_id', 'role_id'],
  class_students: ['class_id', 'student_id'],
  attendance: ['class_id', 'student_id', 'date'],
  student_groups: ['student_id', 'group_id'],
  student_surahs: ['student_id', 'surah_id'],
  student_hizbs: ['student_id', 'hizb_id'],
  migrations: ['name'],
};

/**
 * Splits SQL into code / string / identifier / comment tokens, so rewrites never touch the
 * inside of a literal.
 * @param {string} sql
 * @returns {{type: 'code'|'string'|'ident'|'comment', text: string}[]}
 */
function tokenize(sql) {
  const tokens = [];
  let code = '';
  let i = 0;
  const flushCode = () => {
    if (code) tokens.push({ type: 'code', text: code });
    code = '';
  };
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === '`') {
      flushCode();
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      let text = sql.slice(i, j + 1);
      // SQLite accepts `backticks` as identifier quotes; Postgres wants double quotes.
      if (ch === '`') text = `"${text.slice(1, -1)}"`;
      tokens.push({ type: ch === "'" ? 'string' : 'ident', text });
      i = j + 1;
    } else if (ch === '-' && next === '-') {
      flushCode();
      const end = sql.indexOf('\n', i);
      const j = end === -1 ? sql.length : end;
      tokens.push({ type: 'comment', text: sql.slice(i, j) });
      i = j;
    } else if (ch === '/' && next === '*') {
      flushCode();
      const end = sql.indexOf('*/', i + 2);
      const j = end === -1 ? sql.length : end + 2;
      tokens.push({ type: 'comment', text: sql.slice(i, j) });
      i = j;
    } else {
      code += ch;
      i += 1;
    }
  }
  flushCode();
  return tokens;
}

const isCamelCase = (name) => /[a-z]/.test(name) && /[A-Z]/.test(name);

/**
 * Translates one SQLite statement. The result is cached by SQL text.
 * @param {string} sql
 * @returns {{parts: string[], paramCount: number, isInsert: boolean}}
 *   parts: the statement split at its placeholders (parts.length === paramCount + 1).
 */
function translate(sql) {
  const cached = cache.get(sql);
  if (cached) return cached;

  const tokens = tokenize(sql);
  const codeTokens = tokens.filter((t) => t.type === 'code');

  // camelCase aliases: Postgres folds unquoted names to lower case, so `AS totalStudents`
  // would come back as `totalstudents`. Quote the alias and every later use of it.
  const aliases = new Set();
  for (const t of codeTokens) {
    for (const m of t.text.matchAll(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi)) {
      if (isCamelCase(m[1])) aliases.add(m[1]);
    }
  }

  let insertMode = null; // null | 'ignore' | {table, columns}
  let firstCode = true;
  for (const t of codeTokens) {
    let text = t.text;
    if (firstCode && /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(text)) {
      text = text.replace(/^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\b/i, '$1INSERT INTO');
      insertMode = 'ignore';
    } else if (firstCode && /^\s*(INSERT\s+OR\s+REPLACE|REPLACE)\s+INTO\b/i.test(text)) {
      const m = text.match(/^\s*(?:INSERT\s+OR\s+REPLACE|REPLACE)\s+INTO\s+"?(\w+)"?\s*\(([^)]*)\)/i);
      if (!m || !REPLACE_KEYS[m[1].toLowerCase()]) {
        throw new Error(`INSERT OR REPLACE is not supported for this statement: ${sql}`);
      }
      insertMode = {
        table: m[1].toLowerCase(),
        columns: m[2].split(',').map((c) => c.trim().replace(/"/g, '')),
      };
      text = text.replace(/^(\s*)(?:INSERT\s+OR\s+REPLACE|REPLACE)\s+INTO\b/i, '$1INSERT INTO');
    }
    if (text.trim()) firstCode = false;
    text = text
      // SQLite's LIKE ignores case (for ASCII); Postgres's LIKE does not.
      .replace(/\bLIKE\b/gi, 'ILIKE')
      .replace(/\bCURRENT_TIMESTAMP\b/gi, 'compat.sqlite_now()')
      .replace(/\bCURRENT_DATE\b/gi, 'compat.sqlite_today()');
    for (const alias of aliases) {
      text = text.replace(new RegExp(`(?<![."\\w])${alias}\\b`, 'g'), `"${alias}"`);
    }
    t.text = text;
  }

  let body = tokens.map((t) => t.text).join('');
  const isInsert = /^\s*INSERT\b/i.test(body.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)*/g, ''));
  if (isInsert) {
    body = body.replace(/;\s*$/, '');
    let suffix = '';
    if (insertMode === 'ignore') {
      suffix += ' ON CONFLICT DO NOTHING';
    } else if (insertMode && insertMode.table) {
      const keys = REPLACE_KEYS[insertMode.table];
      const others = insertMode.columns.filter((c) => !keys.includes(c));
      suffix += ` ON CONFLICT (${keys.join(', ')}) DO ${
        others.length ? `UPDATE SET ${others.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}` : 'NOTHING'
      }`;
    }
    // runQuery returns the new row's id, as better-sqlite3's lastInsertRowid.
    if (!/\bRETURNING\b/i.test(body)) suffix += ' RETURNING *';
    if (suffix) {
      const returningAt = body.search(/\bRETURNING\b/i);
      body =
        returningAt === -1
          ? body + suffix
          : `${body.slice(0, returningAt)}${suffix.replace(' RETURNING *', '')} ${body.slice(returningAt)}`;
    }
  }

  // Split at the placeholders that are outside literals.
  const parts = [''];
  for (const t of tokenize(body)) {
    if (t.type !== 'code') {
      parts[parts.length - 1] += t.text;
      continue;
    }
    const pieces = t.text.split('?');
    parts[parts.length - 1] += pieces[0];
    for (let k = 1; k < pieces.length; k += 1) parts.push(pieces[k]);
  }

  const result = { parts, paramCount: parts.length - 1, isInsert };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(sql, result);
  return result;
}

/**
 * Renders one value as a SQL literal.
 * @param {*} value
 * @returns {string}
 */
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    // Integers are quoted so they also fit text columns (SQLite stores 5 in a TEXT column);
    // fractions stay numeric so that '2.5' never has to become an integer.
    return Number.isInteger(value) ? `'${value}'` : `(${value})`;
  }
  if (typeof value === 'bigint') return `'${value.toString()}'`;
  if (typeof value === 'boolean') return value ? "'1'" : "'0'";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'::bytea`;
  if (typeof value === 'string') {
    if (value.includes('\0')) throw new Error('Text values cannot contain NUL characters.');
    return `'${value.replace(/'/g, "''")}'`;
  }
  throw new TypeError(
    'SQLite3 can only bind numbers, strings, bigints, buffers, and null',
  );
}

/**
 * Builds the final statement text.
 * @param {string} sql - The statement as the handler wrote it.
 * @param {Array} [params]
 * @returns {{text: string, isInsert: boolean}}
 */
function render(sql, params = []) {
  const { parts, paramCount, isInsert } = translate(sql);
  const values = Array.isArray(params) ? params : [params];
  if (values.length < paramCount) throw new RangeError('Too few parameter values were provided');
  if (values.length > paramCount) throw new RangeError('Too many parameter values were provided');
  let text = parts[0];
  for (let i = 0; i < paramCount; i += 1) text += literal(values[i]) + parts[i + 1];
  return { text, isInsert };
}

/**
 * Gives a Postgres error the shape better-sqlite3 errors have, so the handlers' checks
 * (`error.code.startsWith('SQLITE_CONSTRAINT')`, "UNIQUE constraint failed: groups.name")
 * keep working.
 * @param {Error & {code?: string, table?: string, column?: string, detail?: string, constraint?: string}} error
 * @returns {Error}
 */
function toSqliteError(error) {
  if (!error || typeof error.code !== 'string') return error;
  const table = error.table || '';
  const keyColumns = () => {
    const m = /Key \(([^)]+)\)/.exec(error.detail || '');
    return m ? m[1].split(',').map((c) => `${table}.${c.trim()}`).join(', ') : table;
  };
  let mapped = null;
  if (error.code === '23505') {
    mapped = Object.assign(new Error(`UNIQUE constraint failed: ${keyColumns()}`), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
  } else if (error.code === '23503') {
    mapped = Object.assign(new Error('FOREIGN KEY constraint failed'), {
      code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
    });
  } else if (error.code === '23502') {
    mapped = Object.assign(new Error(`NOT NULL constraint failed: ${table}.${error.column || ''}`), {
      code: 'SQLITE_CONSTRAINT_NOTNULL',
    });
  } else if (error.code === '23514') {
    mapped = Object.assign(new Error(`CHECK constraint failed: ${error.constraint || table}`), {
      code: 'SQLITE_CONSTRAINT_CHECK',
    });
  }
  if (!mapped) return error;
  mapped.pgCode = error.code;
  mapped.cause = error;
  return mapped;
}

module.exports = { tokenize, translate, literal, render, toSqliteError, REPLACE_KEYS };
