const { app } = require('electron');

/**
 * Credentials Management Template
 * 
 * 1. Copy this file to "credentials.js"
 * 2. Fill in the "PROD_CREDENTIALS" values below with your real Google Cloud secrets.
 * 3. Do not commit "credentials.js" to version control.
 */

// Embedded credentials for Production Release
// Replace these placeholders with your actual values from Google Cloud Console
const PROD_CREDENTIALS = {
    GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID_HERE',
    GOOGLE_CLIENT_SECRET: 'YOUR_CLIENT_SECRET_HERE',
    GOOGLE_REDIRECT_URI: 'http://localhost:3001'
};

const getCredential = (key) => {
    // In development, prefer process.env (loaded from .env)
    if (!app.isPackaged && process.env[key]) {
        return process.env[key];
    }
    // in production, or if env var is missing, use embedded value
    return PROD_CREDENTIALS[key];
};

module.exports = {
    GOOGLE_CLIENT_ID: getCredential('GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: getCredential('GOOGLE_CLIENT_SECRET'),
    GOOGLE_REDIRECT_URI: getCredential('GOOGLE_REDIRECT_URI')
};
