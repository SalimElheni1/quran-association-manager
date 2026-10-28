// src/main/settingsManager.js for the web server. The desktop keeps one settings cache for
// its one database; on a shared server a module-level cache would hand one branch's
// association name and logo to another branch's exports. Settings are read from the current
// branch on every call instead (a single small query).

const { internalGetSettingsHandler } = require('../../../src/main/handlers/settingsHandlers');

async function refreshSettings() {
  // Nothing is cached, so there is nothing to refresh.
}

async function getSetting(key) {
  const { settings } = await internalGetSettingsHandler();
  const value = settings ? settings[key] : undefined;
  if (value === undefined || value === null) {
    return key === 'adultAgeThreshold' ? 18 : null;
  }
  return value;
}

module.exports = { refreshSettings, getSetting };
