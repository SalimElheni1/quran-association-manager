// The audit log: logins, invitations, branch changes, imports and exports.

const { pool } = require('../db/pool');

/**
 * @param {object} entry
 * @param {'platform'|'branch'|'system'|'anonymous'} entry.actorKind
 * @param {number} [entry.actorId]
 * @param {string} [entry.actorName]
 * @param {number} [entry.branchId]
 * @param {string} entry.action - e.g. 'login.success', 'invitation.create'
 * @param {object} [entry.details] - Never passwords, tokens or personal data.
 * @param {string} [entry.ip]
 */
async function record({ actorKind, actorId = null, actorName = null, branchId = null, action, details = {}, ip = null }) {
  try {
    await pool.query(
      `INSERT INTO platform.audit_log (actor_kind, actor_id, actor_name, branch_id, action, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorKind, actorId, actorName, branchId, action, JSON.stringify(details), ip],
    );
  } catch (error) {
    // The audit log must never break the action it records.
    console.error('[audit] could not record', action, error.message);
  }
}

async function listForBranch(branchId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, at, actor_kind, actor_name, action, details, ip
     FROM platform.audit_log WHERE branch_id = $1 ORDER BY at DESC LIMIT $2`,
    [branchId, Math.min(Number(limit) || 100, 500)],
  );
  return rows;
}

async function listAll({ limit = 200, branchId = null } = {}) {
  const { rows } = await pool.query(
    `SELECT a.id, a.at, a.actor_kind, a.actor_name, a.action, a.details, a.ip, a.branch_id, b.name AS branch_name
     FROM platform.audit_log a LEFT JOIN platform.branches b ON b.id = a.branch_id
     WHERE ($1::int IS NULL OR a.branch_id = $1)
     ORDER BY a.at DESC LIMIT $2`,
    [branchId, Math.min(Number(limit) || 200, 1000)],
  );
  return rows;
}

module.exports = { record, listForBranch, listAll };
