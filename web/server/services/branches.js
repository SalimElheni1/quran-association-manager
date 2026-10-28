// Branches: creation (a new schema with the desktop tables), listing with statistics,
// suspension, and lookup by slug for every branch request.

require('../bootstrap');
const path = require('path');
const { pool, transaction } = require('../db/pool');
const { createBranchSchema, branchSchemaName } = require('../db/migrate');
const { runInBranch } = require('./branchRunner');
const audit = require('./audit');
const { ROOT } = require('../bootstrap');

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['api', 'platform', 'invite', 'assets', 'static', 'admin', 'login', 'www']);

class BranchError extends Error {}

const toRef = (row) =>
  row && {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    schema: branchSchemaName(row.id),
  };

/** The branch for a slug, or null. Suspended branches are returned (callers decide). */
async function findBySlug(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
  const { rows } = await pool.query(
    'SELECT id, slug, name, status FROM platform.branches WHERE slug = $1',
    [slug],
  );
  return toRef(rows[0]);
}

async function findById(id) {
  const { rows } = await pool.query(
    'SELECT id, slug, name, status FROM platform.branches WHERE id = $1',
    [id],
  );
  return toRef(rows[0]);
}

function validateSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug) || slug.length < 2 || slug.length > 40) {
    throw new BranchError(
      'المعرّف (في الرابط) يجب أن يكون من 2 إلى 40 حرفاً: حروف لاتينية صغيرة وأرقام وشرطات.',
    );
  }
  if (RESERVED_SLUGS.has(slug)) throw new BranchError('هذا المعرّف محجوز. اختر معرّفاً آخر.');
}

/**
 * Creates a branch and its schema, with the desktop's reference data (surahs, hizbs, default
 * age groups, categories, settings) and the branch name in its settings.
 */
async function create({ name, slug, region, contactName, contactPhone, contactEmail, notes }, by) {
  validateSlug(slug);
  if (!name || !String(name).trim()) throw new BranchError('اسم الفرع مطلوب.');

  const branch = await transaction(async (client) => {
    const exists = await client.query('SELECT 1 FROM platform.branches WHERE slug = $1', [slug]);
    if (exists.rows.length) throw new BranchError('هذا المعرّف مستعمل لفرع آخر.');
    const { rows } = await client.query(
      `INSERT INTO platform.branches (slug, name, region, contact_name, contact_phone, contact_email, notes, created_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, slug, name, status`,
      [slug, String(name).trim(), region || null, contactName || null, contactPhone || null, contactEmail || null, notes || null, by?.adminId || null],
    );
    await createBranchSchema(client, rows[0].id);
    return toRef(rows[0]);
  });

  await runInBranch(branch, {}, async () => {
    const { seedSurahs, seedHizbs } = require(path.join(ROOT, 'src', 'db', 'seederFunctions.js'));
    await seedSurahs();
    await seedHizbs();
    const db = require(path.join(ROOT, 'src', 'db', 'db.js'));
    await db.runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      'local_branch_name',
      branch.name,
    ]);
    if (region) {
      await db.runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'regional_association_name',
        region,
      ]);
    }
  });

  await audit.record({
    actorKind: by?.adminId ? 'platform' : 'system',
    actorId: by?.adminId || null,
    actorName: by?.name || null,
    branchId: branch.id,
    action: 'branch.create',
    details: { slug, name: branch.name },
    ip: by?.ip,
  });
  return branch;
}

async function update(id, fields, by) {
  const allowed = {
    name: 'name',
    region: 'region',
    contactName: 'contact_name',
    contactPhone: 'contact_phone',
    contactEmail: 'contact_email',
    notes: 'notes',
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (fields[key] !== undefined) {
      if (key === 'name' && !String(fields.name || '').trim()) throw new BranchError('اسم الفرع مطلوب.');
      values.push(fields[key] === '' ? null : fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) return findById(id);
  values.push(id);
  const { rowCount } = await pool.query(
    `UPDATE platform.branches SET ${sets.join(', ')} WHERE id = $${values.length}`,
    values,
  );
  if (!rowCount) throw new BranchError('الفرع غير موجود.');
  await audit.record({ actorKind: 'platform', actorId: by.adminId, actorName: by.name, branchId: id, action: 'branch.update', details: { fields: Object.keys(fields) }, ip: by.ip });
  return findById(id);
}

/** Suspends or reactivates a branch. Suspension ends its sessions immediately. */
async function setStatus(id, status, by) {
  if (!['active', 'suspended'].includes(status)) throw new BranchError('حالة غير صالحة.');
  const { rowCount } = await pool.query(
    `UPDATE platform.branches SET status = $1, suspended_at = CASE WHEN $1 = 'suspended' THEN now() ELSE NULL END WHERE id = $2`,
    [status, id],
  );
  if (!rowCount) throw new BranchError('الفرع غير موجود.');
  if (status === 'suspended') {
    await pool.query("DELETE FROM platform.sessions WHERE kind = 'branch' AND branch_id = $1", [id]);
  }
  await audit.record({
    actorKind: 'platform',
    actorId: by.adminId,
    actorName: by.name,
    branchId: id,
    action: status === 'suspended' ? 'branch.suspend' : 'branch.reactivate',
    ip: by.ip,
  });
}

/** Every branch with its counts (read from each branch schema). */
async function listWithStats() {
  const { rows } = await pool.query(
    `SELECT b.*,
            (SELECT COUNT(*) FROM platform.sessions s WHERE s.branch_id = b.id AND s.expires_at > now()) AS active_sessions,
            (SELECT COUNT(*) FROM platform.invitations i
              WHERE i.branch_id = b.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()) AS pending_invitations
     FROM platform.branches b ORDER BY b.created_at DESC`,
  );
  const out = [];
  for (const row of rows) {
    const schema = branchSchemaName(row.id);
    let stats = { students: null, teachers: null, classes: null, users: null, superadmins: null };
    try {
      const { rows: s } = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM ${schema}.students WHERE deleted_at IS NULL) AS students,
           (SELECT COUNT(*) FROM ${schema}.teachers WHERE deleted_at IS NULL) AS teachers,
           (SELECT COUNT(*) FROM ${schema}.classes WHERE deleted_at IS NULL) AS classes,
           (SELECT COUNT(*) FROM ${schema}.users WHERE deleted_at IS NULL) AS users,
           (SELECT COUNT(DISTINCT u.id) FROM ${schema}.users u
              JOIN ${schema}.user_roles ur ON ur.user_id = u.id
              JOIN ${schema}.roles r ON r.id = ur.role_id
             WHERE r.name = 'Superadmin' AND u.deleted_at IS NULL) AS superadmins`,
      );
      stats = s[0];
    } catch (error) {
      console.error(`[branches] stats for ${schema}:`, error.message);
    }
    out.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      region: row.region,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
      suspendedAt: row.suspended_at,
      lastActivityAt: row.last_activity_at,
      activeSessions: row.active_sessions,
      pendingInvitations: row.pending_invitations,
      ...stats,
    });
  }
  return out;
}

async function touchActivity(branchId) {
  await pool
    .query(
      "UPDATE platform.branches SET last_activity_at = now() WHERE id = $1 AND (last_activity_at IS NULL OR last_activity_at < now() - interval '5 minutes')",
      [branchId],
    )
    .catch(() => {});
}

module.exports = {
  BranchError,
  SLUG_PATTERN,
  findBySlug,
  findById,
  create,
  update,
  setStatus,
  listWithStats,
  touchActivity,
  validateSlug,
};
