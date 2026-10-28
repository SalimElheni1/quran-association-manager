// Loaded with --require by web/playwright.config.js: a desktop spec (tests/e2e/*.e2e.js) that
// requires './fixtures' gets the web fixtures (test/e2e/fixtures.js) instead. Other modules,
// the web fixtures included, still get the desktop file.
const Module = require('module');
const path = require('path');

const DESKTOP_E2E = path.resolve(__dirname, '..', '..', '..', 'tests', 'e2e');
const DESKTOP_FIXTURES = path.join(DESKTOP_E2E, 'fixtures.js');
const WEB_FIXTURES = path.join(__dirname, 'fixtures.js');

const original = Module._resolveFilename;
Module._resolveFilename = function resolveWebFixtures(request, parent, ...rest) {
  const resolved = original.call(this, request, parent, ...rest);
  if (
    resolved === DESKTOP_FIXTURES &&
    parent &&
    parent.filename &&
    path.dirname(parent.filename) === DESKTOP_E2E &&
    parent.filename !== DESKTOP_FIXTURES
  ) {
    return WEB_FIXTURES;
  }
  return resolved;
};
