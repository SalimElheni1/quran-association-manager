// src/main/sessionManager.js
// Main-process session registry. Sessions are the only authority for IPC
// authorization: they are created on successful login, keyed by the sender
// webContents id, and revoked on logout, window destruction, or app quit.
// The renderer never supplies authentication state for IPC calls.

const sessions = new Map();

/**
 * Creates a session bound to a webContents sender.
 * @param {{ id: number }} sender - The IPC sender (event.sender).
 * @param {{ id: number, username: string, roles?: string[] }} user - The authenticated user.
 * @param {number|null} expiresAt - Session expiry as epoch milliseconds (null = no expiry).
 * @returns {object|null} The created session, or null when no valid sender is provided.
 */
function createSession(sender, user, expiresAt) {
  if (!sender || typeof sender.id !== 'number' || !user || !user.id) {
    return null;
  }
  const session = {
    userId: user.id,
    username: user.username || '',
    roles: user.roles || [],
    createdAt: Date.now(),
    expiresAt: expiresAt || null,
  };
  sessions.set(sender.id, session);
  return session;
}

/**
 * Returns the session for a webContents id, or null when absent/expired.
 * Expired sessions are evicted.
 * @param {number} webContentsId
 * @returns {object|null}
 */
function getSession(webContentsId) {
  const session = sessions.get(webContentsId);
  if (!session) return null;
  if (session.expiresAt && Date.now() >= session.expiresAt) {
    sessions.delete(webContentsId);
    return null;
  }
  return session;
}

/**
 * Removes the session bound to a webContents id.
 * @param {number} webContentsId
 */
function revokeSession(webContentsId) {
  sessions.delete(webContentsId);
}

/**
 * Removes every session (app quit, database close).
 */
function revokeAllSessions() {
  sessions.clear();
}

/**
 * True when the webContents has a valid, non-expired session.
 * @param {number} webContentsId
 * @returns {boolean}
 */
function hasSession(webContentsId) {
  return getSession(webContentsId) !== null;
}

module.exports = {
  createSession,
  getSession,
  revokeSession,
  revokeAllSessions,
  hasSession,
};
