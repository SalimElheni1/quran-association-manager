// /api/platform — the platform console: branches, their Superadmin invitations, platform
// administrators, the audit log. Nothing here reads a branch's own data beyond counts.

const express = require('express');
const Joi = require('joi');
const branches = require('../services/branches');
const sessions = require('../services/sessions');
const admins = require('../services/platformAdmins');
const invitations = require('../services/invitations');
const audit = require('../services/audit');
const rateLimit = require('../services/rateLimit');
const mail = require('../services/mail');
const {
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
  asyncRoute,
  HttpError,
} = require('./util');

const COOKIE_PATH = '/api/platform';

const branchSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).required(),
  slug: Joi.string().trim().lowercase().min(2).max(40).required(),
  region: Joi.string().trim().max(150).allow('', null),
  contactName: Joi.string().trim().max(150).allow('', null),
  contactPhone: Joi.string().trim().max(40).allow('', null),
  contactEmail: Joi.string().trim().email().max(200).allow('', null),
  notes: Joi.string().trim().max(2000).allow('', null),
});

const branchUpdateSchema = branchSchema.fork(['name', 'slug'], (s) => s.optional()).keys({ slug: Joi.forbidden() });

const inviteSchema = Joi.object({
  email: Joi.string().trim().email().max(200).allow('', null),
  name: Joi.string().trim().max(150).allow('', null),
});

function validate(schema, value) {
  const { error, value: clean } = schema.validate(value || {}, { abortEarly: true, stripUnknown: true });
  if (error) throw new HttpError(400, `بيانات غير صالحة: ${error.details[0].message}`);
  return clean;
}

function createPlatformRouter() {
  const router = express.Router();

  router.use(
    asyncRoute(async (req, _res, next) => {
      req.admin = null;
      const token = readSessionToken(req);
      if (token) {
        const session = await sessions.resolve(token, 'platform');
        if (session) {
          const admin = await admins.findActive(session.admin_id);
          if (admin) {
            req.admin = admin;
            req.platformSession = session;
          }
        }
      }
      next();
    }),
  );

  const requireAdmin = (req, _res, next) => {
    if (!req.admin) return next(new HttpError(401, 'مطلوب تسجيل الدخول.'));
    next();
  };
  const by = (req) => ({ adminId: req.admin.id, name: req.admin.name, ip: req.ip });

  router.post(
    '/auth/login',
    asyncRoute(async (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const ipLimit = rateLimit.hit(`platform-login-ip:${req.ip}`, 20, 15 * 60 * 1000);
      const key = `platform-login:${email}`;
      if (!ipLimit.allowed || rateLimit.lockedFor(key)) {
        throw new HttpError(429, 'محاولات كثيرة. حاول مرة أخرى بعد قليل.');
      }
      const admin = await admins.authenticate(email, password);
      if (!admin) {
        rateLimit.fail(key);
        await audit.record({ actorKind: 'anonymous', actorName: email.slice(0, 100), action: 'platform.login.failure', ip: req.ip });
        throw new HttpError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      }
      rateLimit.clear(key);
      const token = await sessions.create({ kind: 'platform', adminId: admin.id, ip: req.ip, userAgent: req.get('user-agent') });
      setSessionCookie(res, token, COOKIE_PATH);
      await audit.record({ actorKind: 'platform', actorId: admin.id, actorName: admin.name, action: 'platform.login.success', ip: req.ip });
      res.json({ admin });
    }),
  );

  router.post(
    '/auth/logout',
    asyncRoute(async (req, res) => {
      const token = readSessionToken(req);
      if (token) await sessions.revoke(token);
      clearSessionCookie(res, COOKIE_PATH);
      res.json({ ok: true });
    }),
  );

  router.get('/auth/me', (req, res) => {
    res.json({ admin: req.admin, mailConfigured: mail.isConfigured() });
  });

  router.use(requireAdmin);

  router.post(
    '/auth/password',
    asyncRoute(async (req, res) => {
      await admins.changePassword(req.admin.id, req.body?.currentPassword, req.body?.newPassword);
      await sessions.revokeAdmin(req.admin.id, req.platformSession.id);
      await audit.record({ actorKind: 'platform', actorId: req.admin.id, actorName: req.admin.name, action: 'platform.password.change', ip: req.ip });
      res.json({ ok: true });
    }),
  );

  router.get(
    '/branches',
    asyncRoute(async (_req, res) => {
      res.json({ branches: await branches.listWithStats() });
    }),
  );

  router.post(
    '/branches',
    asyncRoute(async (req, res) => {
      const data = validate(branchSchema, req.body);
      const branch = await branches.create(data, by(req));
      res.status(201).json({ branch });
    }),
  );

  const loadBranch = asyncRoute(async (req, _res, next) => {
    const id = Number(req.params.id);
    const branch = Number.isInteger(id) ? await branches.findById(id) : null;
    if (!branch) throw new HttpError(404, 'الفرع غير موجود.');
    req.targetBranch = branch;
    next();
  });

  router.patch(
    '/branches/:id',
    loadBranch,
    asyncRoute(async (req, res) => {
      const data = validate(branchUpdateSchema, req.body);
      res.json({ branch: await branches.update(req.targetBranch.id, data, by(req)) });
    }),
  );

  router.post(
    '/branches/:id/status',
    loadBranch,
    asyncRoute(async (req, res) => {
      await branches.setStatus(req.targetBranch.id, req.body?.status, by(req));
      res.json({ ok: true });
    }),
  );

  router.get(
    '/branches/:id/invitations',
    loadBranch,
    asyncRoute(async (req, res) => {
      res.json({ invitations: await invitations.listForBranch(req.targetBranch.id) });
    }),
  );

  // The platform only ever invites a branch's Superadmin.
  router.post(
    '/branches/:id/invitations',
    loadBranch,
    asyncRoute(async (req, res) => {
      const data = validate(inviteSchema, req.body);
      const result = await invitations.create({
        branch: req.targetBranch,
        role: 'Superadmin',
        email: data.email || null,
        name: data.name || null,
        createdBy: { kind: 'platform', adminId: req.admin.id, name: `${req.admin.name} (إدارة المنصة)` },
        meta: { ip: req.ip },
      });
      res.status(201).json(result);
    }),
  );

  router.post(
    '/branches/:id/invitations/:invitationId/revoke',
    loadBranch,
    asyncRoute(async (req, res) => {
      res.json(
        await invitations.revoke({
          branchId: req.targetBranch.id,
          invitationId: Number(req.params.invitationId),
          by: { kind: 'platform', id: req.admin.id, name: req.admin.name },
          meta: { ip: req.ip },
        }),
      );
    }),
  );

  router.get(
    '/admins',
    asyncRoute(async (_req, res) => {
      res.json({ admins: await admins.list() });
    }),
  );

  router.post(
    '/admins',
    asyncRoute(async (req, res) => {
      const admin = await admins.create(req.body || {});
      await audit.record({ actorKind: 'platform', actorId: req.admin.id, actorName: req.admin.name, action: 'platform.admin.create', details: { adminId: admin.id }, ip: req.ip });
      res.status(201).json({ admin });
    }),
  );

  router.post(
    '/admins/:id/status',
    asyncRoute(async (req, res) => {
      await admins.setStatus(Number(req.params.id), req.body?.status, req.admin.id);
      await audit.record({ actorKind: 'platform', actorId: req.admin.id, actorName: req.admin.name, action: `platform.admin.${req.body?.status}`, details: { adminId: Number(req.params.id) }, ip: req.ip });
      res.json({ ok: true });
    }),
  );

  router.get(
    '/audit',
    asyncRoute(async (req, res) => {
      const branchId = req.query.branchId ? Number(req.query.branchId) : null;
      res.json({ entries: await audit.listAll({ limit: Number(req.query.limit) || 200, branchId }) });
    }),
  );

  return router;
}

module.exports = { createPlatformRouter };
