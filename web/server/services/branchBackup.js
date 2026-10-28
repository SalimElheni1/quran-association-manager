// A branch's data as a backup file in the desktop's format (.qdb): an encrypted zip holding a
// SQL script (the desktop schema, then REPLACE INTO statements for every row), the salt file,
// an HMAC signature and the branch's assets. It is encrypted and signed with the branch's
// transfer key, exactly as the desktop does, so the file opens in the desktop app too.

require('../bootstrap');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { ROOT } = require('../bootstrap');
const { pool } = require('../db/pool');
const audit = require('./audit');

const main = (rel) => require(path.join(ROOT, 'src', 'main', rel));

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

/** The SQL script of the backup: the desktop schema, then every row of the branch. */
async function buildSqlDump(schemaName) {
  const desktopSchema = require(path.join(ROOT, 'src', 'db', 'schema.js'));
  const parts = ['-- Database Schema', desktopSchema, '', '-- Database Data'];
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> 'migrations'
      ORDER BY table_name`,
    [schemaName],
  );
  for (const { table_name: table } of tables) {
    const { rows } = await pool.query(`SELECT * FROM ${schemaName}."${table}"`);
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    const columnList = columns.map((c) => `"${c}"`).join(', ');
    for (const row of rows) {
      parts.push(
        `REPLACE INTO "${table}" (${columnList}) VALUES (${columns.map((c) => sqlValue(row[c])).join(', ')});`,
      );
    }
  }
  return parts.join('\n');
}

function addAssets(zip, assetsDir) {
  const walk = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full, `${prefix}${entry}/`);
      else if (stat.isFile()) zip.file(`assets/${prefix}${entry}`, fs.readFileSync(full));
    }
  };
  walk(assetsDir, '');
}

/**
 * Writes the backup file.
 * @param {import('../context').RequestContext} ctx
 * @param {string} filePath
 * @param {string} key - The transfer key.
 */
async function writeBackupFile(ctx, filePath, key) {
  const { encryptBackup, generateSignature } = main('backupManager');
  const { getDbSalt } = main('keyManager');
  const { app } = require('electron');

  const sqlDump = await buildSqlDump(ctx.branch.schema);
  const zip = new PizZip();
  zip.file('backup.sql', sqlDump);
  zip.file('salt.json', Buffer.from(JSON.stringify({ 'db-salt': getDbSalt() }, null, 2)));
  zip.file('signature.txt', generateSignature(sqlDump, key));
  addAssets(zip, path.join(app.getPath('userData'), 'assets'));
  const content = encryptBackup(zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }), key);
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  return content.length;
}

/** backup:run on the web: the backup file is downloaded by the browser. */
async function exportBranchBackup(ctx, { user, meta = {} }) {
  const { internalGetSettingsHandler } = main('handlers/settingsHandlers');
  const { dialog } = require('electron');
  const Store = require('electron-store');
  const store = new Store();

  const { settings } = await internalGetSettingsHandler();
  const key = settings && settings.association_transfer_key;
  if (!key) {
    return {
      success: false,
      message:
        'حدد أولاً رمز النقل (رمز النسخة الاحتياطية) في الإعدادات: به تُحمى النسخة الاحتياطية وتُفتح.',
    };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `backup-${ctx.branch.slug}-${stamp}.qdb`,
  });
  try {
    const size = await writeBackupFile(ctx, filePath, key);
    store.set('last_backup_status', {
      success: true,
      message: 'Backup completed successfully.',
      timestamp: new Date().toISOString(),
      filePath: path.basename(filePath),
    });
    await audit.record({
      actorKind: 'branch',
      actorId: user?.id,
      actorName: user?.username,
      branchId: ctx.branch.id,
      action: 'branch.export',
      details: { size },
      ip: meta.ip,
    });
    return {
      success: true,
      message: 'تم إنشاء النسخة الاحتياطية. سيبدأ تنزيل الملف الآن؛ احفظه في مكان آمن.',
      size,
    };
  } catch (error) {
    store.set('last_backup_status', {
      success: false,
      message: `فشل النسخة الاحتياطية: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

module.exports = { exportBranchBackup, writeBackupFile, buildSqlDump };
