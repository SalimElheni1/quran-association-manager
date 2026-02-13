const { app } = require('electron');

/**
 * Credentials Management
 * Handles loading of sensitive configuration for both Development and Production environments.
 * 
 * In Development: Uses environment variables loaded by dotenv.
 * In Production: Uses embedded values since .env is not packaged.
 * 
 * Note: For a desktop application, "Client Secret" is technically public information 
 * as it can be extracted from the binary. This is standard for installed apps using OAuth.
 */

// Embedded credentials for Production Release
// These are used when the app is packaged and .env is not available
const PROD_CREDENTIALS = {
    GOOGLE_CLIENT_ID: '65479159565-g7buosioj6tq2tihm3atnn18a7e7hh0n.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: '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',
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
