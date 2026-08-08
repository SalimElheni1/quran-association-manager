const { app } = require('electron');

/**
 * Credentials Management
 * Resolves sensitive configuration without keeping any secret in version control.
 *
 * Resolution order:
 * 1. process.env (populated by dotenv in development, or by the OS in packaged installs)
 * 2. ./credentials.local.js - an untracked file created from credentials.template.js,
 *    used to embed values into packaged builds.
 *
 * Note: For a desktop application the OAuth "Client Secret" is not a true secret, since it
 * can be extracted from the binary. It must still never be committed: a leaked value in a
 * public repository has to be rotated in the Google Cloud Console.
 */

if (!app || !app.isPackaged) {
  // This module can be loaded before index.js configures dotenv.
  require('dotenv').config();
}

let localCredentials = {};
try {
  // eslint-disable-next-line global-require
  localCredentials = require('./credentials.local.js');
} catch (err) {
  localCredentials = {};
}

const getCredential = (key) => {
  if (process.env[key]) {
    return process.env[key];
  }
  return localCredentials[key];
};

const GOOGLE_CLIENT_ID = getCredential('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = getCredential('GOOGLE_CLIENT_SECRET');
const GOOGLE_REDIRECT_URI = getCredential('GOOGLE_REDIRECT_URI') || 'http://localhost:3001';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  const hint = app && app.isPackaged ? 'credentials.local.js' : '.env';
  console.warn(
    `[credentials] Google Drive credentials are not configured (${hint}). Cloud backup will be unavailable.`,
  );
}

module.exports = {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
};
