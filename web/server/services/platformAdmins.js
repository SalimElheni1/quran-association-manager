// Platform administrators: they create and manage branches and invite each branch's first
// Superadmin. They have no access to any branch's data.

const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');

const MIN_PASSWORD = 10;

class AdminError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash = null;
const getDummyHash = async () => (dummyHash ||= await bcrypt.hash('not-a-real-password', 12));

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function checkAdminPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `كلمة مرور مدير المنصة يجب أن تتكون من ${MIN_PASSWORD} أحرف على الأقل.`;
  }
  return null;
}

async function create({ email, name, password }) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AdminError('بريد إلكتروني غير صالح.');
  if (!name || !String(name).trim()) throw new AdminError('الاسم مطلوب.');
  const problem = checkAdminPassword(password);
  if (problem) throw new AdminError(problem);
  try {
    const { rows } = await pool.query(
      `INSERT INTO platform.admins (email, name, password_hash) VALUES ($1, $2, $3)
       RETURNING id, email, name, status, created_at`,
      [normalized, String(name).trim(), await bcrypt.hash(password, 12)],
    );
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw new AdminError('يوجد مدير بهذا البريد الإلكتروني.');
    throw error;
  }
}

/** The admin for these credentials, or null. Compares a hash even for unknown emails. */
async function authenticate(email, password) {
  const { rows } = await pool.query(
    'SELECT id, email, name, password_hash, status FROM platform.admins WHERE lower(email) = $1',
    [normalizeEmail(email)],
  );
  const admin = rows[0];
  const ok = await bcrypt.compare(
    String(password || ''),
    admin ? admin.password_hash : await getDummyHash(),
  );
  if (!admin || !ok || admin.status !== 'active') return null;
  await pool.query('UPDATE platform.admins SET last_login_at = now() WHERE id = $1', [admin.id]);
  return { id: admin.id, email: admin.email, name: admin.name };
}

async function findActive(id) {
  const { rows } = await pool.query(
    "SELECT id, email, name FROM platform.admins WHERE id = $1 AND status = 'active'",
    [id],
  );
  return rows[0] || null;
}

async function list() {
  const { rows } = await pool.query(
    'SELECT id, email, name, status, created_at, last_login_at FROM platform.admins ORDER BY created_at',
  );
  return rows;
}

async function setStatus(id, status, byId) {
  if (!['active', 'disabled'].includes(status)) throw new AdminError('حالة غير صالحة.');
  if (id === byId && status === 'disabled') throw new AdminError('لا يمكنك تعطيل حسابك.');
  if (status === 'disabled') {
    const { rows } = await pool.query(
      "SELECT COUNT(*) AS n FROM platform.admins WHERE status = 'active' AND id <> $1",
      [id],
    );
    if (rows[0].n === 0) throw new AdminError('يجب أن يبقى مدير منصة نشط واحد على الأقل.');
  }
  const { rowCount } = await pool.query('UPDATE platform.admins SET status = $1 WHERE id = $2', [status, id]);
  if (!rowCount) throw new AdminError('المدير غير موجود.', 404);
  if (status === 'disabled') {
    await pool.query("DELETE FROM platform.sessions WHERE kind = 'platform' AND admin_id = $1", [id]);
  }
}

async function changePassword(id, currentPassword, newPassword) {
  const { rows } = await pool.query('SELECT password_hash FROM platform.admins WHERE id = $1', [id]);
  if (!rows[0] || !(await bcrypt.compare(String(currentPassword || ''), rows[0].password_hash))) {
    throw new AdminError('كلمة المرور الحالية غير صحيحة.');
  }
  const problem = checkAdminPassword(newPassword);
  if (problem) throw new AdminError(problem);
  await pool.query('UPDATE platform.admins SET password_hash = $1 WHERE id = $2', [
    await bcrypt.hash(newPassword, 12),
    id,
  ]);
}

async function count() {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM platform.admins');
  return rows[0].n;
}

module.exports = { AdminError, create, authenticate, findActive, list, setStatus, changePassword, count, checkAdminPassword };
