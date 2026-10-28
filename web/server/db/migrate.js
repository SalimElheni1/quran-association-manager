// Database setup: the compat functions, the platform schema, and the migrations of every
// branch schema. Safe to run at every start; each migration is applied once, in its own
// transaction, and recorded where it was applied.

const fs = require('fs');
const path = require('path');
const { pool, transaction } = require('./pool');

const COMPAT_SQL = path.join(__dirname, 'compat.sql');
const PLATFORM_DIR = path.join(__dirname, 'platform-migrations');
const BRANCH_DIR = path.join(__dirname, 'branch-migrations');
const BRANCH_SCHEMA_SQL = path.join(__dirname, 'branch-schema.sql');

const sqlFiles = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : [];

const branchSchemaName = (branchId) => {
  if (!Number.isInteger(branchId) || branchId <= 0) throw new Error('Invalid branch id.');
  return `branch_${branchId}`;
};

async function ensureCompat() {
  // Serialized: two servers starting together must not both create the collation.
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(4242001)');
    await client.query(fs.readFileSync(COMPAT_SQL, 'utf8'));
  });
}

async function migratePlatform(log = console.log) {
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(4242002)');
    await client.query('CREATE SCHEMA IF NOT EXISTS platform');
    await client.query(
      'CREATE TABLE IF NOT EXISTS platform.schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT name FROM platform.schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    for (const file of sqlFiles(PLATFORM_DIR)) {
      if (applied.has(file)) continue;
      log(`[migrate] platform: ${file}`);
      await client.query(fs.readFileSync(path.join(PLATFORM_DIR, file), 'utf8'));
      await client.query('INSERT INTO platform.schema_migrations (name) VALUES ($1)', [file]);
    }
  });
}

/**
 * Applies the pending branch migrations to one branch schema.
 * @returns {Promise<string[]>} The files applied.
 */
async function migrateBranch(branchId, log = console.log) {
  const schema = branchSchemaName(branchId);
  const done = [];
  for (const file of sqlFiles(BRANCH_DIR)) {
    const applied = await transaction(async (client) => {
      await client.query(`SET LOCAL search_path TO ${schema}, compat`);
      await client.query(`SELECT pg_advisory_xact_lock(4242100 + $1::int)`, [branchId]);
      const { rows } = await client.query('SELECT 1 FROM migrations WHERE name = $1', [file]);
      if (rows.length) return false;
      log(`[migrate] ${schema}: ${file}`);
      await client.query(fs.readFileSync(path.join(BRANCH_DIR, file), 'utf8'));
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      return true;
    });
    if (applied) done.push(file);
  }
  return done;
}

/**
 * Migrates every branch. A failing branch is reported and the others still migrate.
 * @returns {Promise<{branchId: number, error: string}[]>} The branches that failed.
 */
async function migrateAllBranches(log = console.log) {
  const { rows } = await pool.query('SELECT id FROM platform.branches ORDER BY id');
  const failures = [];
  for (const { id } of rows) {
    try {
      await migrateBranch(id, log);
    } catch (error) {
      log(`[migrate] branch ${id} FAILED: ${error.message}`);
      failures.push({ branchId: id, error: error.message });
    }
  }
  return failures;
}

/**
 * Creates the schema of a new branch: the desktop tables, their seed rows, and every branch
 * migration marked as applied (branch-schema.sql already includes them).
 * @param {import('pg').PoolClient} client - Inside the caller's transaction.
 */
async function createBranchSchema(client, branchId) {
  const schema = branchSchemaName(branchId);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}, compat`);
  await client.query(fs.readFileSync(BRANCH_SCHEMA_SQL, 'utf8'));
  for (const file of sqlFiles(BRANCH_DIR)) {
    await client.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
  }
  await client.query('SET LOCAL search_path TO public');
}

async function migrateAll(log = console.log) {
  await ensureCompat();
  await migratePlatform(log);
  return migrateAllBranches(log);
}

module.exports = {
  ensureCompat,
  migratePlatform,
  migrateBranch,
  migrateAllBranches,
  migrateAll,
  createBranchSchema,
  branchSchemaName,
};
