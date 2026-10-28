// Where the renderer runs: in the desktop app (Electron) or in the browser, served by the web
// server (web/). The web build defines __QAM_WEB__ as true and the desktop build as false
// (vite.config.mjs), so code for the other target is dropped from each bundle; in tests the
// name is undefined, which counts as the desktop.

/* global __QAM_WEB__ */
export const IS_WEB = typeof __QAM_WEB__ !== 'undefined' && __QAM_WEB__ === true;

/**
 * The URL of an image the main process names with the desktop's safe-image:// scheme
 * (a logo setting such as 'assets/logos/x.png'). On the web the branch's server serves it.
 * @param {string|null|undefined} src - 'safe-image://<relative path>', or a relative path.
 * @returns {string|null|undefined}
 */
export function imageSrc(src) {
  if (!src) return src;
  const relative = src.startsWith('safe-image://') ? src.slice('safe-image://'.length) : null;
  if (!IS_WEB) return relative === null ? `safe-image://${src}` : src;
  const path = relative === null ? src : relative;
  const base = (window.__QAM_BRANCH__ && window.__QAM_BRANCH__.apiBase) || '';
  return `${base}/images/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** The branch the web app is open on ({ slug, name, apiBase }), or null on the desktop. */
export function currentBranch() {
  return IS_WEB ? window.__QAM_BRANCH__ || null : null;
}
