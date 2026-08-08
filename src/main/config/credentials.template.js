/**
 * Credentials Template
 *
 * 1. Copy this file to "credentials.local.js" (untracked).
 * 2. Fill in the values below with your Google Cloud OAuth client details.
 *    They are embedded in packaged builds, where no .env file is available.
 * 3. In development, prefer setting the same keys in ".env" instead.
 */

module.exports = {
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID_HERE',
  GOOGLE_CLIENT_SECRET: 'YOUR_CLIENT_SECRET_HERE',
  GOOGLE_REDIRECT_URI: 'http://localhost:3001',
};
