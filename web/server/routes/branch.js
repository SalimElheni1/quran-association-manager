// /api/b/:slug — one branch: its login, its RPC endpoint (the desktop handlers), uploads,
// downloads and images. The session cookie is scoped to this path, so someone can be signed
// in to two branches in the same browser without the sessions mixing.

require('../bootstrap');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { ROOT } = require('../bootstrap');
const { config } = require('../config');
const { pool } = require('../db/pool');
const branches = require('../services/branches');
const sessions = require('../services/sessions');
const rateLimit = require('../services/rateLimit');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const downloads = require('../services/downloads');
const { runInBranch } = require('../services/branchRunner');
const { invoke, RpcError } = require('../rpc/dispatch');
const {
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
  meta,
  asyncRoute,
  HttpError,
} = require('./util');

const db = require(path.join(ROOT, 'src', 'db', 'db.js'));
const { findImageFile } = require(path.join(ROOT, 'src', 'main', 'imagePaths.js'));

const SUSPENDED_MESSAGE = 'هذا الفرع موقوف حالياً. يرجى التواصل مع إدارة المنصة.';
const BAD_CREDENTIALS = 'اسم المستخدم أو كلمة المرور غير صحيحة';
const cookiePath = (branch) => `/api/b/${branch.slug}`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

/** The branch's user for a session, with the roles they hold now (not at login). */
async function loadUser(branch, userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.status, u.deleted_at, u.need_guide,
            COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM ${branch.schema}.users u
       LEFT JOIN ${branch.schema}.user_roles ur ON ur.user_id = u.id
       LEFT JOIN ${branch.schema}.roles r ON r.id = ur.role_id
      WHERE u.id = $1
      GROUP BY u.id`,
    [userId],
  );
  const user = rows[0];
  if (!user || user.deleted_at || (user.status && user.status !== 'active')) return null;
  return user;
}

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  first_name: user.first_name,
  last_name: user.last_name,
  roles: user.roles,
  need_guide: !!user.need_guide,
});

function createBranchRouter() {
  const router = express.Router({ mergeParams: true });

  // Every route: the branch from the URL.
  router.use(
    asyncRoute(async (req, _res, next) => {
      const branch = await branches.findBySlug(req.params.slug);
      if (!branch) throw new HttpError(404, 'الفرع غير موجود.');
      req.branch = branch;
      next();
    }),
  );

  // The session, when there is one. Routes that need it check req.user.
  router.use(
    asyncRoute(async (req, res, next) => {
      req.user = null;
      req.session = null;
      const token = readSessionToken(req);
      if (!token) return next();
      const session = await sessions.resolve(token, 'branch');
      if (!session || session.branch_id !== req.branch.id) return next();
      if (req.branch.status !== 'active') {
        await sessions.revoke(token);
        clearSessionCookie(res, cookiePath(req.branch));
        return next();
      }
      const user = await loadUser(req.branch, session.user_id);
      if (!user) {
        await sessions.revoke(token);
        clearSessionCookie(res, cookiePath(req.branch));
        return next();
      }
      req.session = session;
      req.user = { id: user.id, username: user.username, roles: user.roles };
      req.userRow = user;
      branches.touchActivity(req.branch.id);
      next();
    }),
  );

  const requireUser = (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'مطلوب تسجيل الدخول.'));
    next();
  };

  router.get('/info', (req, res) => {
    res.json({ name: req.branch.name, slug: req.branch.slug, status: req.branch.status });
  });

  router.post(
    '/auth/login',
    asyncRoute(async (req, res) => {
      const { branch } = req;
      if (branch.status !== 'active') throw new HttpError(403, SUSPENDED_MESSAGE);
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      if (!username || !password || username.length > 100 || password.length > 200) {
        return res.json({ success: false, message: BAD_CREDENTIALS });
      }

      const ipLimit = rateLimit.hit(`login-ip:${req.ip}`, 30, 15 * 60 * 1000);
      const accountKey = `login:${branch.id}:${username.toLowerCase()}`;
      const locked = rateLimit.lockedFor(accountKey);
      if (!ipLimit.allowed || locked) {
        const minutes = Math.max(1, Math.ceil((locked || ipLimit.retryAfterSec) / 60));
        return res.json({
          success: false,
          message: `تم قفل تسجيل الدخول مؤقتاً بسبب عدة محاولات فاشلة. حاول مرة أخرى بعد ${minutes} دقيقة.`,
        });
      }

      const found = await runInBranch(branch, {}, () =>
        db.getQuery('SELECT id, password, deleted_at, status FROM users WHERE username = ?', [
          username,
        ]),
      );
      const ok = found && (await bcrypt.compare(password, found.password));
      if (!ok) {
        rateLimit.fail(accountKey);
        await audit.record({
          actorKind: 'anonymous',
          actorName: username.slice(0, 50),
          branchId: branch.id,
          action: 'login.failure',
          ip: req.ip,
        });
        return res.json({ success: false, message: BAD_CREDENTIALS });
      }
      rateLimit.clear(accountKey);
      // Checked after the password, as on the desktop, so the message reveals nothing.
      if (found.deleted_at) {
        return res.json({
          success: false,
          message: 'هذا الحساب محذوف. يرجى التواصل مع مدير النظام.',
        });
      }
      if (found.status && found.status !== 'active') {
        return res.json({
          success: false,
          message: 'هذا الحساب غير نشط. يرجى التواصل مع مدير النظام.',
        });
      }

      const user = await loadUser(branch, found.id);
      const mustChangePassword = await bcrypt.compare('123456', found.password);
      const oldToken = readSessionToken(req);
      if (oldToken) await sessions.revoke(oldToken);
      const token = await sessions.create({
        kind: 'branch',
        branchId: branch.id,
        userId: user.id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      setSessionCookie(res, token, cookiePath(branch));
      await audit.record({
        actorKind: 'branch',
        actorId: user.id,
        actorName: user.username,
        branchId: branch.id,
        action: 'login.success',
        ip: req.ip,
      });
      res.json({ success: true, mustChangePassword, user: publicUser(user) });
    }),
  );

  router.post(
    '/auth/logout',
    asyncRoute(async (req, res) => {
      const token = readSessionToken(req);
      if (token) await sessions.revoke(token);
      clearSessionCookie(res, cookiePath(req.branch));
      res.json({ success: true });
    }),
  );

  router.get('/auth/me', (req, res) => {
    if (req.branch.status !== 'active') {
      return res.status(403).json({
        user: null,
        branch: { name: req.branch.name, status: req.branch.status },
        message: SUSPENDED_MESSAGE,
      });
    }
    res.json({
      user: req.userRow ? publicUser(req.userRow) : null,
      branch: { name: req.branch.name, slug: req.branch.slug, status: req.branch.status },
    });
  });

  router.post(
    '/rpc/:channel',
    asyncRoute(async (req, res) => {
      if (req.branch.status !== 'active') throw new HttpError(403, SUSPENDED_MESSAGE);
      const args = Array.isArray(req.body?.args) ? req.body.args : [];
      const uploadIds = Array.isArray(req.body?.uploads) ? req.body.uploads.slice(0, 5) : [];
      try {
        const out = await invoke({
          branch: req.branch,
          user: req.user,
          sessionId: req.session ? req.session.id : null,
          channel: String(req.params.channel),
          args,
          uploadIds,
          meta: meta(req),
        });
        res.json({ ok: true, ...out });
      } catch (error) {
        if (error instanceof RpcError) {
          return res.status(error.status).json({ ok: false, error: error.message });
        }
        // A handler that throws: the desktop shows the message to the user.
        res.status(200).json({ ok: false, error: error.message || 'حدث خطأ غير متوقع في الخادم.' });
      }
    }),
  );

  router.post(
    '/uploads',
    requireUser,
    upload.single('file'),
    asyncRoute(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'لم يتم اختيار أي ملف.');
      res.json({ ok: true, ...uploads.save(req.session.id, req.file) });
    }),
  );

  router.get(
    '/downloads/:id',
    requireUser,
    asyncRoute(async (req, res) => {
      const entry = downloads.take(String(req.params.id), req.session.id);
      if (!entry || !fs.existsSync(entry.path))
        throw new HttpError(404, 'الملف غير موجود أو انتهت صلاحيته.');
      res.download(entry.path, entry.name, () => downloads.remove(entry));
    }),
  );

  // Logos are shown on the login page, so they need no session; other images do.
  router.get(
    /^\/images\/(.+)$/,
    asyncRoute(async (req, res) => {
      let relPath;
      try {
        relPath = decodeURIComponent(req.params[0]).replace(/\\/g, '/');
      } catch {
        throw new HttpError(400, 'Bad path');
      }
      const isLogo = relPath.startsWith('assets/logos/') || !relPath.includes('/');
      if (!isLogo && !req.user) throw new HttpError(401, 'مطلوب تسجيل الدخول.');
      const file = await runInBranch(req.branch, {}, async () => findImageFile(relPath));
      if (!file) throw new HttpError(404, 'Not found');
      res.set('Cache-Control', 'private, max-age=300');
      res.sendFile(file);
    }),
  );

  return router;
}

module.exports = { createBranchRouter, loadUser };
