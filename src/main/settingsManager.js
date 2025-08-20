const path = require('path');

const settings = {
  adultAgeThreshold: 18,
};

function getSetting(key) {
  return settings[key];
}

module.exports = {
  getSetting,
};
