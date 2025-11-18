const { internalGetSettingsHandler } = require('./handlers/settingsHandlers');
const { log, error: logError } = require('./logger');

let settingsCache = null;

async function refreshSettings() {
  try {
    const { settings } = await internalGetSettingsHandler();
    settingsCache = settings;
    log('Settings cache refreshed.');
  } catch (error) {
    logError('Failed to refresh settings cache:', error);
    // In case of error, we might want to keep the old cache or clear it.
    // For now, we'll keep it to avoid breaking things that depend on it.
  }
}

async function getSetting(key) {
  if (!settingsCache) {
    await refreshSettings();
  }

  const value = settingsCache?.[key];

  if (value === undefined || value === null) {
    return null;
  }

  return value;
}

module.exports = {
  refreshSettings,
  getSetting,
};
