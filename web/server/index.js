// Entry point of the web server: `npm start` in web/.

require('./bootstrap');
const fs = require('fs');
const crypto = require('crypto');
const { config, assertProductionReady } = require('./config');
const { migrateAll } = require('./db/migrate');
const { createApp } = require('./app');
const { loadHandlers } = require('./rpc/registry');
const scheduler = require('./services/scheduler');
const admins = require('./services/platformAdmins');
const { pool } = require('./db/pool');

async function main() {
  assertProductionReady();
  fs.mkdirSync(config.dataDir, { recursive: true });

  // The shared auth code signs its tokens with JWT_SECRET (the desktop derives it from the
  // database key). Sessions here are cookies; the secret only has to be stable and private.
  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    (config.sessionSecret
      ? crypto.createHash('sha256').update(`qam-jwt:${config.sessionSecret}`).digest('hex')
      : crypto.randomBytes(32).toString('hex'));

  const failures = await migrateAll();
  if (failures.length) {
    console.error(
      `[startup] ${failures.length} branch(es) failed to migrate; they may not work until fixed.`,
    );
  }
  loadHandlers();

  if ((await admins.count()) === 0) {
    console.warn(
      '[startup] No platform administrator yet. Create one with: npm run create-admin -- --email you@example.org --name "Your name"',
    );
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(
      `[startup] Quran Association Manager (web) listening on port ${config.port} — ${config.publicUrl}`,
    );
  });
  if (config.schedulerEnabled) scheduler.start();

  const shutdown = (signal) => {
    console.log(`[shutdown] ${signal}`);
    scheduler.stop();
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[startup] fatal:', error);
  process.exit(1);
});
