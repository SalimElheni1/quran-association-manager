// Small HTTP helpers shared by the routes.

const { config } = require('../config');

const SESSION_COOKIE = 'qam_sid';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key || key in out) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[key] = part.slice(i + 1).trim();
    }
  }
  return out;
}

/** The session cookie for a path scope (/api/b/<slug> or /api/platform). */
function setSessionCookie(res, token, cookiePath) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: cookiePath,
    maxAge: config.sessionMaxHours * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res, cookiePath) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: cookiePath,
  });
}

function readSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') || '' });

/** Wraps an async route so its errors reach the error handler. */
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
  meta,
  asyncRoute,
  HttpError,
};
