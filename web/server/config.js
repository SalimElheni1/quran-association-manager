// Server configuration, from environment variables (see web/.env.example).

const path = require('path');

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

const config = {
  isProduction,
  port: Number(env.PORT) || 8080,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/qam',
  // Signs nothing secret by itself; it seeds the JWT secret the shared auth code expects.
  sessionSecret: env.SESSION_SECRET || '',
  // The address people open, used in invitation links (e.g. https://quran.example.org).
  publicUrl: (env.PUBLIC_URL || `http://localhost:${Number(env.PORT) || 8080}`).replace(/\/+$/, ''),
  // Logos, uploads and generated files. One folder per branch under branches/.
  dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
  // smtp://user:pass@host:587 or smtps://...; empty = invitations are shared by link only.
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || 'no-reply@localhost',
  // Number of reverse proxies in front of the app (for the client IP in rate limits).
  trustProxy: env.TRUST_PROXY === undefined ? 0 : Number(env.TRUST_PROXY) || env.TRUST_PROXY,
  // Per-address limits on logins and invitation pages are multiplied by this (tests raise it).
  rateLimitScale: Number(env.RATE_LIMIT_SCALE) || 1,
  sessionIdleHours: Number(env.SESSION_IDLE_HOURS) || 12,
  sessionMaxHours: Number(env.SESSION_MAX_HOURS) || 72,
  inviteDays: Number(env.INVITE_DAYS) || 7,
  maxUploadMb: Number(env.MAX_UPLOAD_MB) || 50,
  // Hourly fee-charge run for every active branch (the desktop runs it while the app is open).
  schedulerEnabled: env.SCHEDULER_ENABLED !== 'false',
};

/**
 * Refuses to start with an unsafe configuration in production.
 */
function assertProductionReady() {
  if (!isProduction) return;
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 random characters in production.');
  }
  if (!/^https:\/\//.test(config.publicUrl)) {
    throw new Error('PUBLIC_URL must be an https:// address in production.');
  }
}

module.exports = { config, assertProductionReady };
