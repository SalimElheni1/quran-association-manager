// src/main/imagePaths.js
// Where an image named by a relative path (a logo setting such as 'g247.png' or
// 'assets/logos/icon.png') is found: first among the files the user added (userData), then
// among the images bundled with the app (the public/ folder, which Vite copies into
// dist/renderer for the packaged app).

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

/** The folders holding the images bundled with the app. */
function bundledImageDirs() {
  if (app.isPackaged) {
    const dirs = [path.join(app.getAppPath(), 'dist', 'renderer')];
    // Older packages shipped the images as an extra resource folder.
    if (process.resourcesPath) dirs.push(path.join(process.resourcesPath, 'public'));
    return dirs;
  }
  return [path.resolve(__dirname, '..', '..', 'public')];
}

/**
 * Whether a relative path is safe to look up: no traversal, NUL byte or absolute path.
 * @param {string} relPath
 * @returns {boolean}
 */
function isSafeRelativePath(relPath) {
  return (
    typeof relPath === 'string' &&
    relPath !== '' &&
    !relPath.includes('..') &&
    !relPath.includes('\0') &&
    !path.isAbsolute(relPath)
  );
}

/**
 * Finds an image by its relative path.
 * @param {string} relPath e.g. 'g247.png' or 'assets/logos/icon.png'.
 * @returns {string|null} The absolute path, or null when it is unsafe, not an image, or missing.
 */
function findImageFile(relPath) {
  if (!isSafeRelativePath(relPath)) return null;
  if (!IMAGE_EXTENSIONS.includes(path.extname(relPath).toLowerCase())) return null;
  const dirs = [app.getPath('userData'), ...bundledImageDirs()];
  for (const dir of dirs) {
    const candidate = path.resolve(dir, relPath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

module.exports = { IMAGE_EXTENSIONS, isSafeRelativePath, findImageFile, bundledImageDirs };
