const path = require('path');
const { fileURLToPath } = require('url');

/**
 * Path to the packaged/e2e renderer entry point.
 * Must match the path passed to mainWindow.loadFile() in index.js.
 */
const INDEX_HTML_PATH = path.resolve(__dirname, '../../dist/renderer/index.html');

/**
 * Hostnames that the user is allowed to open in the system browser.
 * Matches the external links rendered in AboutPage/SupportTab/TechnicalDetailsTab.
 */
const ALLOWED_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'linkedin.com',
  'www.linkedin.com',
  'wa.me',
  'api.whatsapp.com',
]);

/**
 * Returns true when `url` belongs to the app's own origin.
 *
 * Development (not packaged, not E2E): only http://localhost:3000 is internal.
 * Packaged/E2E: only file:// URLs whose path resolves to dist/renderer/index.html
 * are internal; hash fragments (used by HashRouter) are ignored.
 *
 * @param {string} url
 * @param {{ isPackaged: boolean, isE2E: boolean }} options
 * @returns {boolean}
 */
function isInternalUrl(url, { isPackaged, isE2E }) {
  try {
    const parsed = new URL(url);
    if (!isPackaged && !isE2E) {
      return parsed.protocol === 'http:' && parsed.host === 'localhost:3000';
    }
    if (parsed.protocol !== 'file:') {
      return false;
    }
    return path.normalize(fileURLToPath(parsed)) === path.normalize(INDEX_HTML_PATH);
  } catch {
    return false;
  }
}

/**
 * Returns true when `url` is an allowlisted external navigation target.
 *
 * Allowed: mailto: links and https: links whose hostname is exactly one of
 * github.com, www.github.com, linkedin.com, www.linkedin.com, wa.me or
 * api.whatsapp.com.
 *
 * Rejected: unparsable URLs, http:, file:, javascript:, data:, custom schemes,
 * URLs with credentials (user:pass@), and any other host.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'mailto:') {
      return true;
    }
    if (parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Hardens a BrowserWindow's webContents against unwanted navigation.
 *
 * - window.open / target="_blank" is always denied inside Electron; allowlisted
 *   external URLs are handed to the system browser instead.
 * - will-navigate and will-redirect are allowed only for internal URLs;
 *   allowlisted external URLs are opened externally, and anything else is logged
 *   and blocked.
 *
 * @param {Electron.WebContents} webContents
 * @param {{ shell: Electron.Shell, isPackaged: boolean, isE2E: boolean, log: Function }} options
 */
function installNavigationGuard(webContents, { shell, isPackaged, isE2E, log }) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      Promise.resolve(shell.openExternal(url)).catch(() => {});
    } else {
      log('Blocked window.open:', url);
    }
    return { action: 'deny' };
  });

  const handleNavigation = (event, url) => {
    if (isInternalUrl(url, { isPackaged, isE2E })) {
      return;
    }
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      Promise.resolve(shell.openExternal(url)).catch(() => {});
    } else {
      log('Blocked navigation:', url);
    }
  };

  webContents.on('will-navigate', handleNavigation);
  webContents.on('will-redirect', handleNavigation);
}

module.exports = {
  isInternalUrl,
  isAllowedExternalUrl,
  installNavigationGuard,
};
