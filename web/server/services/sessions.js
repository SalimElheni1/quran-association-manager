// Web sessions. The browser holds a random token in an httpOnly cookie; the database keeps only
// its SHA-256, so a leaked database cannot be replayed as cookies. Sessions slide with use
// (SESSION_IDLE_HOURS) up to an absolute limit (SESSION_MAX_HOURS).

const crypto = require('crypto');
const { pool } = require('../db/pool');
const { config } = require('../config');
const { branchSchemaName } = require('../db/migrate');

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

async function create({ kind, branchId = null, userId = null, adminId = null, ip = null, userAgent = null }) {
  const token = newToken();
  await pool.query(
    `INSERT INTO platform.sessions (id, kind, branch_id, user_id, admin_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6), $7, $8)`,
    [hash(token), kind, branchId, userId, adminId, config.sessionIdleHours, ip, (userAgent || '').slice(0, 300)],
  );
  return token;
}

/**
 * The live session for a cookie token, extended on use; null when absent or expired.
 * @returns {Promise<null|{id: string, kind: string, branch_id: number|null, user_id: number|null, admin_id: number|null}>}
 */
async function resolve(token, kind) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { rows } = await pool.query(
    `UPDATE platform.sessions
        SET last_seen_at = now(),
            expires_at = LEAST(created_at + make_interval(hours => $3), now() + make_interval(hours => $2))
      WHERE id = $1 AND kind = $4 AND expires_at > now()
      RETURNING id, kind, branch_id, user_id, admin_id`,
    [hash(token), config.sessionIdleHours, config.sessionMaxHours, kind],
  );
  return rows[0] || null;
}

async function revoke(token) {
  if (typeof token !== 'string') return;
  await pool.query('DELETE FROM platform.sessions WHERE id = $1', [hash(token)]);
}

async function revokeById(id) {
  await pool.query('DELETE FROM platform.sessions WHERE id = $1', [id]);
}

async function revokeBranchUser(branchId, userId, exceptId = null) {
  await pool.query(
    "DELETE FROM platform.sessions WHERE kind = 'branch' AND branch_id = $1 AND user_id = $2 AND ($3::text IS NULL OR id <> $3)",
    [branchId, userId, exceptId],
  );
}

async function revokeBranch(branchId) {
  await pool.query("DELETE FROM platform.sessions WHERE kind = 'branch' AND branch_id = $1", [branchId]);
}

async function revokeAdmin(adminId, exceptId = null) {
  await pool.query(
    "DELETE FROM platform.sessions WHERE kind = 'platform' AND admin_id = $1 AND ($2::text IS NULL OR id <> $2)",
    [adminId, exceptId],
  );
}

/** The open sessions of a branch, with the user names (for the branch Superadmin). */
async function listForBranch(branchId, currentId) {
  const schema = branchSchemaName(branchId);
  const { rows } = await pool.query(
    `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at, s.ip, s.user_agent,
            u.username, u.first_name, u.last_name
       FROM platform.sessions s
       LEFT JOIN ${schema}.users u ON u.id = s.user_id
      WHERE s.kind = 'branch' AND s.branch_id = $1 AND s.expires_at > now()
      ORDER BY s.last_seen_at DESC`,
    [branchId],
  );
  return rows.map((r) => ({
    id: r.id.slice(0, 16),
    userId: r.user_id,
    username: r.username,
    name: [r.first_name, r.last_name].filter(Boolean).join(' '),
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    ip: r.ip,
    userAgent: r.user_agent,
    current: r.id === currentId,
  }));
}

async function revokeByShortId(branchId, shortId) {
  const { rowCount } = await pool.query(
    "DELETE FROM platform.sessions WHERE kind = 'branch' AND branch_id = $1 AND left(id, 16) = $2",
    [branchId, String(shortId)],
  );
  return rowCount > 0;
}

async function cleanup() {
  await pool.query('DELETE FROM platform.sessions WHERE expires_at < now()').catch(() => {});
}

module.exports = {
  hash,
  newToken,
  create,
  resolve,
  revoke,
  revokeById,
  revokeBranchUser,
  revokeBranch,
  revokeAdmin,
  listForBranch,
  revokeByShortId,
  cleanup,
};
