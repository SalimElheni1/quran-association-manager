// /api/invitations/:token — what the invitation page shows, and accepting it (creates the
// account and signs the person in to their branch).

const express = require('express');
const invitations = require('../services/invitations');
const sessions = require('../services/sessions');
const rateLimit = require('../services/rateLimit');
const { setSessionCookie, asyncRoute, HttpError } = require('./util');

function createInviteRouter() {
  const router = express.Router();

  const limit = (req) => {
    const { allowed } = rateLimit.hit(`invite-ip:${req.ip}`, 60, 15 * 60 * 1000);
    if (!allowed) throw new HttpError(429, 'محاولات كثيرة. حاول مرة أخرى بعد قليل.');
  };

  router.get(
    '/:token',
    asyncRoute(async (req, res) => {
      limit(req);
      const info = await invitations.describe(String(req.params.token));
      if (!info) throw new HttpError(404, 'رابط الدعوة غير صالح.');
      res.json({ invitation: info });
    }),
  );

  router.post(
    '/:token/accept',
    asyncRoute(async (req, res) => {
      limit(req);
      try {
        const { branch, user } = await invitations.accept(
          String(req.params.token),
          req.body || {},
          { ip: req.ip },
        );
        const token = await sessions.create({
          kind: 'branch',
          branchId: branch.id,
          userId: user.id,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        });
        setSessionCookie(res, token, `/api/b/${branch.slug}`);
        res.json({ ok: true, branchSlug: branch.slug, username: user.username });
      } catch (error) {
        if (error instanceof invitations.InvitationError)
          throw new HttpError(error.status, error.message);
        throw error;
      }
    }),
  );

  return router;
}

module.exports = { createInviteRouter };
