const path = require('path');

// In the future, this could be expanded to read from a JSON file,
// electron-store, or a database table to make settings dynamic.

const settings = {
  // Using placeholder paths as the actual logos were not found in the project.
  logoNationalPath: path.join(__dirname, 'assets/g13.png'),
  logoLocalPath: path.join(__dirname, 'assets/g247.png'),

  // PDF Template Settings
  pdf: {
    // Using the bold font for both seems to be more stable with fontkit.
    font: path.join(__dirname, '../renderer/assets/fonts/cairo-v30-arabic_latin-700.woff2'),
    fontBold: path.join(__dirname, '../renderer/assets/fonts/cairo-v30-arabic_latin-700.woff2'),
    fontSize: 10,
    titleFontSize: 16,
    headerColor: '#444444',
    textColor: '#333333',
  },

  // Business Logic Settings
  adultAgeThreshold: 18,
};

/**
 * Retrieves a setting value by key.
 * @param {string} key - The key of the setting to retrieve.
 * @returns {any} The value of the setting.
 */
function getSetting(key) {
  return settings[key];
}

module.exports = {
  getSetting,
};
