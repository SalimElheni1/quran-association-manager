// An in-memory SQLite database with the desktop schema at its latest migration, built the way
// src/db/db.js builds it (schema.js, then every migration in its own transaction; a migration
// failing on "duplicate column" counts as applied). Used to generate branch-schema.sql and to
// read desktop backups.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3-multiple-ciphers');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function buildDesktopSqlite() {
  const schema = require(path.join(ROOT, 'src', 'db', 'schema.js'));
  const db = new Database(':memory:');
  db.exec(schema);
  const migrationsDir = path.join(ROOT, 'src', 'db', 'migrations');
  for (const file of fs.readdirSync(migrationsDir).sort()) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
      })();
    } catch {
      db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(file);
    }
  }
  return db;
}

/** The tables of a SQLite database, referenced tables first. */
function tablesInDependencyOrder(db) {
  const tables = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  const deps = {};
  for (const t of tables) {
    deps[t.name] = [...t.sql.matchAll(/REFERENCES\s+"?(\w+)"?/gi)].map((m) => m[1]).filter((n) => n !== t.name);
  }
  const ordered = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    (deps[name] || []).forEach(visit);
    if (tables.some((t) => t.name === name)) ordered.push(name);
  };
  tables.forEach((t) => visit(t.name));
  return ordered.map((name) => tables.find((t) => t.name === name));
}

module.exports = { buildDesktopSqlite, tablesInDependencyOrder, ROOT };
