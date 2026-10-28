// Restores a desktop backup (.qdb) — or a backup made by the web version — into a branch.
// The file is opened with the desktop's own code (decryption, signature), its SQL is replayed
// into an in-memory SQLite database built from the desktop schema (dropping columns and tables
// that no longer exist, as the desktop restore does), cleaned of rows Postgres would refuse,
// and copied into the branch schema in one transaction. Users, roles and password hashes come
// across, so people sign in as before. Everyone's session in the branch ends afterwards.

require('../bootstrap');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const PizZip = require('pizzip');
const { ROOT } = require('../bootstrap');
const { pool } = require('../db/pool');
const { literal } = require('../db/sql');
const { buildDesktopSqlite, tablesInDependencyOrder } = require('../db/desktopSchema');
const audit = require('./audit');
const sessions = require('./sessions');

const main = (rel) => require(path.join(ROOT, 'src', 'main', rel));

const INTEGER_TYPES = new Set(['integer', 'bigint', 'smallint']);
const FLOAT_TYPES = new Set(['double precision', 'real', 'numeric']);

const isZip = (b) =>
  b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

class ImportError extends Error {}

/** Decrypts and checks the backup; returns the zip. */
function openBackup(buffer, keys) {
  const { decryptBackup, verifySignature } = main('backupManager');
  let zipBuffer = null;
  let usedKey = null;
  if (isZip(buffer)) {
    zipBuffer = buffer; // backups from v1.2.9 and earlier were not encrypted
  } else {
    for (const key of keys) {
      try {
        zipBuffer = decryptBackup(buffer, key);
        usedKey = key;
        break;
      } catch {
        // try the next key
      }
    }
  }
  if (!zipBuffer) {
    throw new ImportError(
      'تعذر فتح النسخة الاحتياطية: رمز النسخة الاحتياطية (رمز النقل) غير صحيح، أو الملف ليس نسخة احتياطية صالحة.',
    );
  }
  let zip;
  try {
    zip = new PizZip(zipBuffer);
  } catch {
    throw new ImportError('ملف النسخ الاحتياطي غير صالح أو تالف.');
  }
  const sqlFile = zip.file('backup.sql');
  const saltFile = zip.file('salt.json') || zip.file('config.json');
  if (!sqlFile || !saltFile) throw new ImportError('ملف النسخ الاحتياطي غير صالح أو تالف.');
  const sql = sqlFile.asText();
  const signature = zip.file('signature.txt');
  if (signature) {
    const candidates = usedKey ? [usedKey, ...keys] : keys;
    if (!candidates.some((key) => verifySignature(sql, key, signature.asText()))) {
      throw new ImportError(
        'توقيع النسخة الاحتياطية غير مطابق. قد يكون الملف تالفاً أو تم تعديله.',
      );
    }
  }
  let salt = null;
  try {
    salt = JSON.parse(saltFile.asText())['db-salt'] || null;
  } catch {
    salt = null;
  }
  return { zip, sql, salt };
}

/** Replays the backup's INSERT/REPLACE statements into a fresh desktop-schema SQLite. */
function loadIntoSqlite(sqlScript) {
  const { splitSqlList, fixStatementColumns } = main('importManager');
  const sqlite = buildDesktopSqlite();
  sqlite.pragma('foreign_keys = OFF');
  // The seed rows of a fresh desktop database are replaced by the backup's own rows.
  for (const { name } of tablesInDependencyOrder(sqlite)) {
    if (name !== 'migrations') sqlite.prepare(`DELETE FROM "${name}"`).run();
  }

  const columnsOf = new Map();
  for (const { name } of tablesInDependencyOrder(sqlite)) {
    columnsOf.set(
      name,
      new Set(
        sqlite
          .prepare(`PRAGMA table_info("${name}")`)
          .all()
          .map((c) => c.name),
      ),
    );
  }

  let applied = 0;
  let failed = 0;
  const skippedTables = new Set();
  const insert = sqlite.transaction((statements) => {
    for (const raw of statements) {
      // A statement can start with comment lines ("-- Database Data" before the first row).
      const statement = raw.replace(/^(\s*--[^\n]*\n)+/, '');
      const match = statement.match(
        /^\s*(?:REPLACE|INSERT)\s+(?:OR\s+\w+\s+)?INTO\s+["']?([^\s"'(]+)["']?\s*\(/i,
      );
      if (!match) continue; // schema statements: the database already has the current schema
      const table = match[1];
      if (table === 'migrations' || table === 'sqlite_sequence') continue;
      if (!columnsOf.has(table)) {
        skippedTables.add(table);
        continue;
      }
      let finalStatement = statement;
      const columnsMatch = statement.match(/\(([^)]+)\)\s*VALUES/i);
      if (columnsMatch) {
        const columns = splitSqlList(columnsMatch[1], ',').map((c) =>
          c.trim().replace(/^"|"$/g, ''),
        );
        const invalid = columns.filter((c) => !columnsOf.get(table).has(c));
        if (invalid.length) {
          finalStatement = fixStatementColumns(statement, columns, invalid);
          if (!finalStatement) continue;
        }
      }
      try {
        sqlite.prepare(finalStatement).run();
        applied += 1;
      } catch {
        failed += 1;
      }
    }
  });
  insert(splitSqlList(sqlScript, ';').filter((s) => s.trim()));

  // What the desktop restore also does: users without a role become Administrators, and old
  // six-digit matricules get the four-digit form.
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user_roles (user_id, role_id)
       SELECT u.id, (SELECT id FROM roles WHERE name = 'Administrator') FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
          AND (SELECT id FROM roles WHERE name = 'Administrator') IS NOT NULL`,
    )
    .run();
  for (const table of ['students', 'teachers', 'users', 'groups', 'inventory_items']) {
    const rows = sqlite
      .prepare(
        `SELECT id, matricule FROM ${table} WHERE matricule IS NOT NULL AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4`,
      )
      .all();
    for (const row of rows) {
      const [prefix, num] = row.matricule.split('-');
      if (num !== undefined && /^\d+$/.test(num)) {
        sqlite
          .prepare(`UPDATE ${table} SET matricule = ? WHERE id = ?`)
          .run(`${prefix}-${String(parseInt(num, 10)).padStart(4, '0')}`, row.id);
      }
    }
  }

  // Rows pointing at rows that no longer exist (SQLite let them in while foreign keys were off;
  // Postgres refuses them): the reference is cleared when the column allows it, else the row goes.
  let orphansFixed = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    const violations = sqlite.prepare('PRAGMA foreign_key_check').all();
    if (!violations.length) break;
    for (const v of violations) {
      const fk = sqlite
        .prepare(`PRAGMA foreign_key_list("${v.table}")`)
        .all()
        .filter((f) => f.id === v.fkid);
      const info = sqlite.prepare(`PRAGMA table_info("${v.table}")`).all();
      const nullable = fk.every(
        (f) =>
          !info.find((c) => c.name === f.from)?.notnull && !info.find((c) => c.name === f.from)?.pk,
      );
      if (nullable && fk.length) {
        sqlite
          .prepare(
            `UPDATE "${v.table}" SET ${fk.map((f) => `"${f.from}" = NULL`).join(', ')} WHERE rowid = ?`,
          )
          .run(v.rowid);
      } else {
        sqlite.prepare(`DELETE FROM "${v.table}" WHERE rowid = ?`).run(v.rowid);
      }
      orphansFixed += 1;
    }
  }

  return { sqlite, applied, failed, skippedTables: [...skippedTables], orphansFixed };
}

/** A value as the Postgres column type accepts it (SQLite stores '' in INTEGER columns). */
function coerce(value, pgType) {
  if (value === null || value === undefined) return null;
  if (INTEGER_TYPES.has(pgType)) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
    const n = Number(String(value).trim());
    return String(value).trim() !== '' && Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (FLOAT_TYPES.has(pgType)) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const n = Number(String(value).trim());
    return String(value).trim() !== '' && Number.isFinite(n) ? n : null;
  }
  if (Buffer.isBuffer(value)) return value.toString('utf8').replace(/\0/g, '');
  return String(value).replace(/\0/g, '');
}

/** Copies every table into the branch schema, replacing what is there, in one transaction. */
async function copyToBranch(sqlite, schemaName) {
  const client = await pool.connect();
  const counts = {};
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO ${schemaName}, compat`);
    const { rows: columns } = await client.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = $1`,
      [schemaName],
    );
    const pgColumns = new Map();
    for (const c of columns) {
      if (!pgColumns.has(c.table_name)) pgColumns.set(c.table_name, new Map());
      pgColumns.get(c.table_name).set(c.column_name, c.data_type);
    }
    const tables = tablesInDependencyOrder(sqlite)
      .map((t) => t.name)
      .filter((name) => name !== 'migrations' && pgColumns.has(name));

    await client.query(
      `TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );

    for (const table of tables) {
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
      counts[table] = rows.length;
      if (!rows.length) continue;
      const types = pgColumns.get(table);
      const cols = Object.keys(rows[0]).filter((c) => types.has(c));
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const values = batch
          .map((row) => `(${cols.map((c) => literal(coerce(row[c], types.get(c)))).join(', ')})`)
          .join(',\n');
        try {
          await client.query(
            `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${values}`,
          );
        } catch (error) {
          throw new ImportError(`تعذر نسخ بيانات الجدول «${table}»: ${error.message}`);
        }
      }
    }
    await client.query('SELECT compat.reset_sequences()');
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function extractAssets(zip, assetsDir) {
  let count = 0;
  for (const file of zip.file(/^assets\//)) {
    const rel = file.name.replace(/^assets\//, '');
    if (!rel || file.dir) continue;
    const dest = path.resolve(assetsDir, rel);
    if (!dest.startsWith(path.resolve(assetsDir) + path.sep)) continue; // zip entries are untrusted
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.asNodeBuffer());
    count += 1;
  }
  return count;
}

/**
 * db:import on the web.
 * @param {import('../context').RequestContext} ctx
 */
async function importDesktopBackup(ctx, { user, meta = {}, password, filePath, backupKey }) {
  const db = require(path.join(ROOT, 'src', 'db', 'db.js'));
  const { internalGetSettingsHandler } = main('handlers/settingsHandlers');
  const { app } = require('electron');
  const Store = require('electron-store');

  try {
    // The person restoring confirms with their own password.
    const me = await db.getQuery('SELECT password FROM users WHERE id = ?', [user.id]);
    if (!me || !(await bcrypt.compare(String(password || ''), me.password))) {
      return { success: false, message: 'كلمة المرور الحالية التي أدخلتها غير صحيحة.' };
    }
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, message: 'لم يتم تحديد أي ملف.' };
    }

    const { settings } = await internalGetSettingsHandler();
    const savedKey = settings?.association_transfer_key || '';
    const keys = [backupKey, savedKey].filter(Boolean);
    const { zip, sql, salt } = openBackup(fs.readFileSync(filePath), keys);

    // A safety copy of the branch as it is now, kept on the server.
    const safetyKey = savedKey || backupKey;
    if (safetyKey) {
      const { writeBackupFile } = require('./branchBackup');
      const dir = path.join(app.getPath('userData'), 'safety-backups');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await writeBackupFile(ctx, path.join(dir, `pre-import-${stamp}.qdb`), safetyKey);
    }

    const loaded = loadIntoSqlite(sql);
    const counts = await copyToBranch(loaded.sqlite, ctx.branch.schema);
    loaded.sqlite.close();

    const assets = extractAssets(zip, path.join(app.getPath('userData'), 'assets'));
    if (salt && typeof salt === 'string' && salt.length >= 32) {
      new Store({ name: 'db-salt-config' }).set('db-salt', salt);
    }

    // As after a desktop restore: charges for students that have none.
    try {
      const { checkAndGenerateChargesForAllStudents } = main('handlers/studentFeeHandlers');
      await checkAndGenerateChargesForAllStudents();
    } catch (error) {
      console.warn('[import] charge generation after import:', error.message);
    }

    await sessions.revokeBranch(ctx.branch.id);
    await audit.record({
      actorKind: 'branch',
      actorId: user.id,
      actorName: user.username,
      branchId: ctx.branch.id,
      action: 'branch.import',
      details: {
        students: counts.students || 0,
        users: counts.users || 0,
        statementsFailed: loaded.failed,
        orphansFixed: loaded.orphansFixed,
        skippedTables: loaded.skippedTables,
        assets,
      },
      ip: meta.ip,
    });

    return {
      success: true,
      message: `تم استيراد البيانات بنجاح (${counts.students || 0} طالب، ${counts.users || 0} مستخدم). سجّل الدخول من جديد بحسابات النسخة المستوردة.`,
      counts,
    };
  } catch (error) {
    if (error instanceof ImportError) return { success: false, message: error.message };
    console.error('[import] failed:', error);
    return { success: false, message: `حدث خطأ فادح أثناء الاستيراد: ${error.message}` };
  }
}

module.exports = { importDesktopBackup, openBackup, loadIntoSqlite, copyToBranch, coerce };
