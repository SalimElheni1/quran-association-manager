// Web versions of the desktop channels that depend on the computer (folders, log file,
// relaunch, backup file, restore), and the channels only the web has (invitations, sessions,
// audit log). Registered after the desktop handlers, so they replace them.

const Joi = require('joi');
const context = require('../context');

const SUPERADMIN = ['Superadmin'];
const SESSION = ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'];
const NOT_ON_WEB = 'هذه الميزة غير متاحة في نسخة الويب.';

const BRANCH_ROLES = ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'];

/** Roles of the web-only channels (the desktop ones keep ipcSecurity.js CHANNEL_ROLES). */
const WEB_CHANNEL_ROLES = {
  'web:branch:info': SESSION,
  'web:invitations:list': SUPERADMIN,
  'web:invitations:create': SUPERADMIN,
  'web:invitations:revoke': SUPERADMIN,
  'web:sessions:list': SUPERADMIN,
  'web:sessions:revoke': SUPERADMIN,
  'web:audit:list': SUPERADMIN,
};

const id = Joi.number().integer().positive().required();

const WEB_ARG_SCHEMAS = {
  'web:branch:info': [],
  'web:invitations:list': [],
  'web:invitations:create': [
    Joi.object({
      role: Joi.string()
        .valid(...BRANCH_ROLES)
        .required(),
      email: Joi.string().email().max(200).allow('', null),
      name: Joi.string().max(200).allow('', null),
    }).required(),
  ],
  'web:invitations:revoke': [Joi.object({ id }).required()],
  'web:sessions:list': [],
  'web:sessions:revoke': [Joi.object({ id: Joi.string().hex().length(16).required() }).required()],
  'web:audit:list': [Joi.object({ limit: Joi.number().integer().min(1).max(500) }).allow(null)],
  // Desktop channels whose web version takes other arguments.
  'backup:run': [Joi.any(), Joi.any()],
  'db:import': [
    Joi.object({
      password: Joi.string().max(200).required(),
      filePath: Joi.string().max(4096).required(),
      backupPassword: Joi.string().max(500).allow('', null),
      userId: Joi.any(),
    }).required(),
  ],
};

function actor() {
  const ctx = context.require();
  return { ctx, branch: ctx.branch, user: ctx.user, meta: ctx.meta || {} };
}

function registerWebHandlers(ipcMain) {
  // ---- Desktop channels with a web meaning ----

  // There is no first-run setup on the web: a branch's first superadmin comes by invitation.
  ipcMain.handle('get-initial-credentials', async () => null);

  ipcMain.handle('dialog:openDirectory', async () => ({ success: false, message: NOT_ON_WEB }));

  // The browser reloads the page itself (see the client shim).
  ipcMain.handle('app:relaunch', async () => true);

  // The server log is shared by every branch, so no branch can read it.
  for (const channel of ['logs:get-recent', 'logs:get-filtered']) {
    ipcMain.handle(channel, async () => ({ success: false, message: NOT_ON_WEB, logs: [] }));
  }
  ipcMain.handle('logs:clear', async () => ({ success: false, message: NOT_ON_WEB }));
  ipcMain.handle('logs:get-file-path', async () => null);

  // A backup is a download: the same encrypted .qdb file the desktop makes, so it can also be
  // restored in the desktop app.
  ipcMain.handle('backup:run', async () => {
    const { exportBranchBackup } = require('../services/branchBackup');
    const { ctx, user, meta } = actor();
    return exportBranchBackup(ctx, { user, meta });
  });

  // Restores a desktop (or web) .qdb backup into this branch.
  ipcMain.handle('db:import', async (_event, data) => {
    const { importDesktopBackup } = require('../services/desktopImport');
    const { ctx, user, meta } = actor();
    return importDesktopBackup(ctx, {
      user,
      meta,
      password: data.password,
      filePath: data.filePath,
      backupKey: data.backupPassword || '',
    });
  });

  // ---- Web-only channels ----

  ipcMain.handle('web:branch:info', async () => {
    const { branch } = actor();
    return { id: branch.id, slug: branch.slug, name: branch.name };
  });

  ipcMain.handle('web:invitations:list', async () => {
    const invitations = require('../services/invitations');
    const { branch } = actor();
    return { success: true, invitations: await invitations.listForBranch(branch.id) };
  });

  ipcMain.handle('web:invitations:create', async (_event, data) => {
    const invitations = require('../services/invitations');
    const { branch, user, meta } = actor();
    return invitations.create({
      branch,
      role: data.role,
      email: data.email || null,
      name: data.name || null,
      createdBy: { kind: 'branch', userId: user.id, name: user.username },
      meta,
    });
  });

  ipcMain.handle('web:invitations:revoke', async (_event, { id: invitationId }) => {
    const invitations = require('../services/invitations');
    const { branch, user, meta } = actor();
    return invitations.revoke({
      branchId: branch.id,
      invitationId,
      by: { kind: 'branch', id: user.id, name: user.username },
      meta,
    });
  });

  ipcMain.handle('web:sessions:list', async () => {
    const sessions = require('../services/sessions');
    const { ctx, branch } = actor();
    return { success: true, sessions: await sessions.listForBranch(branch.id, ctx.sessionId) };
  });

  ipcMain.handle('web:sessions:revoke', async (_event, { id: shortId }) => {
    const sessions = require('../services/sessions');
    const audit = require('../services/audit');
    const { branch, user, meta } = actor();
    const revoked = await sessions.revokeByShortId(branch.id, shortId);
    if (revoked) {
      await audit.record({
        actorKind: 'branch',
        actorId: user.id,
        actorName: user.username,
        branchId: branch.id,
        action: 'session.revoke',
        ip: meta.ip,
      });
    }
    return { success: revoked, message: revoked ? 'تم إنهاء الجلسة.' : 'الجلسة غير موجودة.' };
  });

  ipcMain.handle('web:audit:list', async (_event, options) => {
    const audit = require('../services/audit');
    const { branch } = actor();
    return { success: true, entries: await audit.listForBranch(branch.id, options?.limit || 100) };
  });
}

module.exports = { registerWebHandlers, WEB_CHANNEL_ROLES, WEB_ARG_SCHEMAS };
