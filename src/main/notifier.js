/**
 * @fileoverview Helpers for pushing user-facing notifications from the main process
 * to the renderer.
 *
 * The main process has no reference to the window it created, so notifications must be
 * resolved from the live window list. When no window can receive a message the message is
 * logged instead of disappearing.
 */

const { BrowserWindow } = require('electron');
const { warn: logWarn, error: logError } = require('./logger');

/**
 * Sends a message to every live renderer window.
 *
 * @param {string} channel - IPC channel name.
 * @param {...any} args - Payload forwarded to the renderer.
 * @returns {boolean} True when at least one window received the message.
 */
const sendToRenderer = (channel, ...args) => {
  try {
    const windows = (BrowserWindow?.getAllWindows() || []).filter((win) => !win.isDestroyed());

    if (windows.length === 0) {
      logWarn(`No renderer window available for "${channel}":`, ...args);
      return false;
    }

    windows.forEach((win) => win.webContents.send(channel, ...args));
    return true;
  } catch (error) {
    // A broken notification must never break the operation that reports through it.
    logError(`Failed to notify the renderer on "${channel}":`, error, ...args);
    return false;
  }
};

/**
 * Shows an error toast in the renderer.
 *
 * @param {string} message - Message to display (Arabic, user facing).
 * @returns {boolean} True when the message was delivered.
 */
const notifyError = (message) => sendToRenderer('ui:show-error-toast', message);

/**
 * Shows a success toast in the renderer.
 *
 * @param {string} message - Message to display (Arabic, user facing).
 * @returns {boolean} True when the message was delivered.
 */
const notifySuccess = (message) => sendToRenderer('ui:show-success-toast', message);

module.exports = { sendToRenderer, notifyError, notifySuccess };
