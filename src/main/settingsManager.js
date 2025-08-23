const { internalGetSettingsHandler } = require('./handlers/settingsHandlers');

let settingsCache = null;

async function refreshSettings() {
  try {
    const { settings } = await internalGetSettingsHandler();
    settingsCache = settings;
    console.log('Settings cache refreshed:', settingsCache);
  } catch (error) {
    console.error('Failed to refresh settings cache:', error);
    // In case of error, fall back to a default or previously known good state
    if (!settingsCache) {
      settingsCache = {
        adultAgeThreshold: 18, // Default fallback
      };
    }
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

// Initial load of settings
refreshSettings();

module.exports = {
  getSetting,
  refreshSettings,
};
