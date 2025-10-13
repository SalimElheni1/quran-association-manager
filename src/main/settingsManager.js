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

  let value = settingsCache?.[key];

  // Handle age threshold key mapping between camelCase and snake_case
  if (value === undefined && key === 'adult_age_threshold') {
    value = settingsCache?.['adultAgeThreshold'];
  } else if (value === undefined && key === 'adultAgeThreshold') {
    value = settingsCache?.['adult_age_threshold'];
  }

  if (value === undefined || value === null) {
    // Provide sensible defaults for critical settings
    if (key === 'adult_age_threshold' || key === 'adultAgeThreshold') {
      return 18;
    }
    return null;
  }

  return value;
}

module.exports = {
  refreshSettings,
  getSetting,
};
