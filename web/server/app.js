// The Express application: API routes, the built browser app, security headers.

require('./bootstrap');
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { config } = require('./config');
const { pool } = require('./db/pool');
const { createBranchRouter } = require('./routes/branch');
const { createPlatformRouter } = require('./routes/platform');
const { createInviteRouter } = require('./routes/invites');
const { BranchError } = require('./services/branches');
const { AdminError } = require('./services/platformAdmins');

const CLIENT_DIR = path.resolve(__dirname, '..', 'dist');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.isProduction,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // CSRF: every state-changing API call must carry this header. A form or link from another
  // site cannot set it, and the API answers no cross-origin requests.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-qam') !== '1') return res.status(403).json({ error: 'Missing X-QAM header.' });
    next();
  });
  app.use('/api', express.json({ limit: '5mb' }));

  app.use('/api/b/:slug', createBranchRouter());
  app.use('/api/platform', createPlatformRouter());
  app.use('/api/invitations', createInviteRouter());
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // The browser app (built by `npm run build:client`).
  if (fs.existsSync(CLIENT_DIR)) {
    app.use(
      express.static(CLIENT_DIR, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    const indexHtml = path.join(CLIENT_DIR, 'index.html');
    app.get(['/', '/platform', '/platform/*', '/invite/*', '/b/:slug', '/b/:slug/*'], (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (_req, res) =>
      res.type('text').send('The browser app is not built. Run `npm run build:client` in web/.'),
    );
  }

  // Errors: a known status keeps its message; anything else is logged and hidden.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let status = err.status || err.statusCode || 500;
    if (err instanceof BranchError || err instanceof AdminError) status = err.status || 400;
    if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      err.message = `الملف أكبر من الحد المسموح (${config.maxUploadMb} ميغابايت).`;
    }
    if (status >= 500) {
      console.error(`[http] ${req.method} ${req.originalUrl}:`, err);
      return res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم.' });
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}

module.exports = { createApp };
