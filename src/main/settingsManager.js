const path = require('path');
const { internalGetSettingsHandler } = require(path.join(__dirname, 'handlers', 'settingsHandlers'));

let settingsCache = null;

async function refreshSettings() {
  try {
    const { settings } = await internalGetSettingsHandler();
    settingsCache = settings;
    console.log('Settings cache refreshed.');
  } catch (error) {
    console.error('Failed to refresh settings cache:', error);
    // In case of error, we might want to keep the old cache or clear it.
    // For now, we'll keep it to avoid breaking things that depend on it.
  }
}

function getSetting(key) {
  if (!settingsCache) {
    console.error('CRITICAL: getSetting called before settings cache was initialized.');
    // This is a synchronous fallback for critical early calls.
    // The application should be structured to call refreshSettings on startup.
    return 18; // Hardcoded fallback
  }
  return settingsCache[key];
}

module.exports = {
  refreshSettings,
  getSetting,
};
