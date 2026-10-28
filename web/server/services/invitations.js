// Invitations: a platform admin invites a branch's Superadmin; a branch Superadmin invites any
// role. A link carries a random token; only its SHA-256 is stored. Single use, expires, can be
// revoked, and the role is fixed when it is created.

require('../bootstrap');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { config } = require('../config');
const { ROOT } = require('../bootstrap');
const { runInBranch } = require('./branchRunner');
const audit = require('./audit');
const mail = require('./mail');

const ROLE_LABELS = {
  Superadmin: 'مدير النظام',
  Administrator: 'مدير',
  FinanceManager: 'مدير مالي',
  SessionSupervisor: 'مشرف حصص',
};

class InvitationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const linkFor = (token) => `${config.publicUrl}/invite/${token}`;

function statusOf(row) {
  if (row.accepted_at) return 'accepted';
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at) <= new Date()) return 'expired';
  return 'pending';
}

/**
 * Creates an invitation and emails it when an address is given and mail is configured.
 * @returns {Promise<{success: true, invitation: object, link: string, emailed: boolean}>}
 */
async function create({ branch, role, email, name, createdBy, meta = {} }) {
  if (!ROLE_LABELS[role]) throw new InvitationError('دور غير صالح.');
  if (branch.status !== 'active') throw new InvitationError('هذا الفرع موقوف.');
  const token = crypto.randomBytes(32).toString('base64url');
  const { rows } = await pool.query(
    `INSERT INTO platform.invitations
       (token_hash, branch_id, role, email, name, created_by_kind, created_by_admin_id, created_by_user_id, created_by_name, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(days => $10))
     RETURNING id, role, email, name, created_at, expires_at, created_by_kind, created_by_name`,
    [
      hash(token),
      branch.id,
      role,
      email || null,
      name || null,
      createdBy.kind,
      createdBy.adminId || null,
      createdBy.userId || null,
      createdBy.name || null,
      config.inviteDays,
    ],
  );
  const invitation = rows[0];
  const link = linkFor(token);

  let emailed = false;
  if (email) {
    try {
      emailed = await mail.sendInvitation({
        to: email,
        inviteeName: name,
        branchName: branch.name,
        roleLabel: ROLE_LABELS[role],
        link,
        expiresAt: invitation.expires_at,
        invitedBy: createdBy.name,
      });
      if (emailed) {
        await pool.query('UPDATE platform.invitations SET email_sent_at = now() WHERE id = $1', [invitation.id]);
      }
    } catch (error) {
      console.error('[invitations] email failed:', error.message);
    }
  }

  await audit.record({
    actorKind: createdBy.kind,
    actorId: createdBy.adminId || createdBy.userId || null,
    actorName: createdBy.name,
    branchId: branch.id,
    action: 'invitation.create',
    details: { invitationId: invitation.id, role, emailed },
    ip: meta.ip,
  });

  return {
    success: true,
    invitation: { ...invitation, status: 'pending', roleLabel: ROLE_LABELS[role] },
    link,
    emailed,
    mailConfigured: mail.isConfigured(),
  };
}

async function listForBranch(branchId) {
  const { rows } = await pool.query(
    `SELECT id, role, email, name, created_by_kind, created_by_name, created_at, expires_at,
            accepted_at, accepted_user_id, revoked_at, email_sent_at
       FROM platform.invitations WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [branchId],
  );
  return rows.map((row) => ({ ...row, status: statusOf(row), roleLabel: ROLE_LABELS[row.role] }));
}

async function revoke({ branchId, invitationId, by, meta = {} }) {
  const { rowCount } = await pool.query(
    `UPDATE platform.invitations SET revoked_at = now()
      WHERE id = $1 AND branch_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [invitationId, branchId],
  );
  if (rowCount) {
    await audit.record({
      actorKind: by.kind,
      actorId: by.id,
      actorName: by.name,
      branchId,
      action: 'invitation.revoke',
      details: { invitationId },
      ip: meta.ip,
    });
  }
  return { success: rowCount > 0, message: rowCount ? 'تم إلغاء الدعوة.' : 'لا يمكن إلغاء هذه الدعوة.' };
}

/** What the invitation page shows before the account is created. */
async function describe(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { rows } = await pool.query(
    `SELECT i.*, b.name AS branch_name, b.slug AS branch_slug, b.status AS branch_status
       FROM platform.invitations i JOIN platform.branches b ON b.id = i.branch_id
      WHERE i.token_hash = $1`,
    [hash(token)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.branch_status !== 'active' ? 'suspended' : statusOf(row),
    branchName: row.branch_name,
    branchSlug: row.branch_slug,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role],
    email: row.email,
    name: row.name,
    invitedBy: row.created_by_name,
    expiresAt: row.expires_at,
  };
}

/**
 * Creates the invitee's account in the branch and marks the invitation used.
 * @returns {Promise<{branch: object, user: {id: number, username: string, roles: string[]}}>}
 */
async function accept(token, form, meta = {}) {
  const { userValidationSchema } = require(path.join(ROOT, 'src', 'main', 'validationSchemas.js'));
  const { generateMatricule } = require(path.join(ROOT, 'src', 'main', 'services', 'matriculeService.js'));
  const db = require(path.join(ROOT, 'src', 'db', 'db.js'));
  const branches = require('./branches');

  if (typeof token !== 'string' || token.length < 20 || token.length > 100) {
    throw new InvitationError('رابط الدعوة غير صالح.', 404);
  }
  if (!form || form.password !== form.confirm_password) {
    throw new InvitationError('كلمتا المرور غير متطابقتين.');
  }

  // Claim the invitation first: a link can only be used once, even by two clicks at once.
  const { rows } = await pool.query(
    `UPDATE platform.invitations SET accepted_at = now()
      WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      RETURNING id, branch_id, role, email`,
    [hash(token)],
  );
  const invitation = rows[0];
  if (!invitation) throw new InvitationError('رابط الدعوة غير صالح أو منتهي الصلاحية أو مستعمل.', 410);

  const release = () =>
    pool.query('UPDATE platform.invitations SET accepted_at = NULL WHERE id = $1', [invitation.id]);

  const branch = await branches.findById(invitation.branch_id);
  if (!branch || branch.status !== 'active') {
    await release();
    throw new InvitationError('هذا الفرع موقوف.', 403);
  }

  let user;
  try {
    user = await runInBranch(branch, {}, async () =>
      db.withTransaction(async () => {
        const matricule = await generateMatricule('user');
        const data = await userValidationSchema.validateAsync(
          {
            matricule,
            username: form.username,
            password: form.password,
            first_name: form.first_name,
            last_name: form.last_name,
            national_id: form.national_id,
            phone_number: form.phone_number,
            email: form.email || invitation.email || null,
            roles: [invitation.role],
          },
          { abortEarly: false, stripUnknown: true },
        );
        const taken = await db.getQuery('SELECT id FROM users WHERE username = ?', [data.username]);
        if (taken) throw new InvitationError('اسم المستخدم هذا موجود مسبقاً. الرجاء اختيار اسم آخر.');
        const result = await db.runQuery(
          `INSERT INTO users (matricule, username, password, first_name, last_name, national_id, phone_number, email, status, need_guide, current_step)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 0)`,
          [
            data.matricule,
            data.username,
            await bcrypt.hash(data.password, 10),
            data.first_name,
            data.last_name,
            data.national_id,
            data.phone_number,
            data.email || null,
          ],
        );
        const role = await db.getQuery('SELECT id FROM roles WHERE name = ?', [invitation.role]);
        await db.runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.id, role.id]);
        return { id: result.id, username: data.username, roles: [invitation.role] };
      }),
    );
  } catch (error) {
    await release();
    if (error instanceof InvitationError) throw error;
    if (error.isJoi) {
      throw new InvitationError(error.details.map((d) => d.message).join(' — '));
    }
    if (/UNIQUE constraint failed: users\.national_id/.test(error.message)) {
      throw new InvitationError('رقم بطاقة التعريف هذا مسجل لمستخدم آخر في هذا الفرع.');
    }
    if (/UNIQUE constraint failed: users\.email/.test(error.message)) {
      throw new InvitationError('البريد الإلكتروني هذا مسجل لمستخدم آخر في هذا الفرع.');
    }
    throw error;
  }

  await pool.query('UPDATE platform.invitations SET accepted_user_id = $1 WHERE id = $2', [user.id, invitation.id]);
  await audit.record({
    actorKind: 'branch',
    actorId: user.id,
    actorName: user.username,
    branchId: branch.id,
    action: 'invitation.accept',
    details: { invitationId: invitation.id, role: invitation.role },
    ip: meta.ip,
  });
  return { branch, user };
}

module.exports = { create, listForBranch, revoke, describe, accept, InvitationError, ROLE_LABELS };
