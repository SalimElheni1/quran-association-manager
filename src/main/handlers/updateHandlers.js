// Application updates from the project's GitHub releases (electron-updater reads the latest.yml
// the release workflow publishes next to the installer). Nothing happens on its own: the user
// checks, downloads and installs from the About page.
const { ipcMain, app } = require('electron');
const { log, error: logError } = require('../logger');

const NOT_PACKAGED_MESSAGE = 'التحقق من التحديثات متاح فقط في النسخة المثبتة من التطبيق.';
const CHECK_FAILED_MESSAGE = 'تعذر التحقق من التحديثات. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.';
const DOWNLOAD_FAILED_MESSAGE = 'تعذر تنزيل التحديث. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.';

let updater = null;
let downloading = false;
let downloaded = false;

/** electron-updater, configured on first use (it needs the packaged app's app-update.yml). */
function getUpdater() {
  if (updater) return updater;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: log, warn: log, error: logError, debug: () => {} };
  autoUpdater.on('download-progress', (progress) => {
    sendToSenders('update:progress', { percent: Math.round(progress.percent || 0) });
  });
  updater = autoUpdater;
  return updater;
}

const progressTargets = new Set();
function sendToSenders(channel, payload) {
  for (const contents of progressTargets) {
    if (!contents.isDestroyed()) contents.send(channel, payload);
  }
}

async function handleCheck() {
  if (!app.isPackaged) return { success: false, message: NOT_PACKAGED_MESSAGE };
  try {
    const result = await getUpdater().checkForUpdates();
    const info = result?.updateInfo;
    const available = !!result?.isUpdateAvailable;
    return {
      success: true,
      available,
      currentVersion: app.getVersion(),
      version: info?.version || null,
      releaseDate: info?.releaseDate || null,
      downloaded: available && downloaded,
    };
  } catch (err) {
    logError('Update check failed:', err);
    return { success: false, message: CHECK_FAILED_MESSAGE };
  }
}

async function handleDownload(event) {
  if (!app.isPackaged) return { success: false, message: NOT_PACKAGED_MESSAGE };
  if (downloaded) return { success: true };
  if (downloading) return { success: false, message: 'جاري تنزيل التحديث بالفعل.' };
  downloading = true;
  progressTargets.add(event.sender);
  try {
    await getUpdater().downloadUpdate();
    downloaded = true;
    return { success: true };
  } catch (err) {
    logError('Update download failed:', err);
    return { success: false, message: DOWNLOAD_FAILED_MESSAGE };
  } finally {
    downloading = false;
    progressTargets.delete(event.sender);
  }
}

function handleInstall() {
  if (!downloaded) return { success: false, message: 'لم يتم تنزيل التحديث بعد.' };
  log('Quitting to install the downloaded update.');
  // Let the IPC reply reach the window before the app quits.
  setImmediate(() => getUpdater().quitAndInstall(false, true));
  return { success: true };
}

function registerUpdateHandlers() {
  ipcMain.handle('update:check', handleCheck);
  ipcMain.handle('update:download', handleDownload);
  ipcMain.handle('update:install', handleInstall);
}

module.exports = { registerUpdateHandlers, handleCheck, handleDownload, handleInstall };
