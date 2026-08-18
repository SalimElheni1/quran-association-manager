const jwt = require('jsonwebtoken');
const db = require('../db/db');
const sessionManager = require('./sessionManager');

const getUserFromToken = async (token) => {
  if (!token) {
    throw new Error('Authentication token not provided.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.getQuery('SELECT id, username FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      throw new Error('User not found.');
    }

    const roles = await db.allQuery(
      'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
      [user.id],
    );

    user.roles = roles.map((r) => r.name);
    return user;
  } catch (error) {
    throw new Error('Invalid or expired authentication token.');
  }
};

const requireRoles = (allowedRoles) => {
  return (originalHandler) => {
    return async (event, ...args) => {
      // Authorization is decided from the main-process session registry
      // (created at login, keyed by the sender webContents id). The renderer
      // never supplies authentication state for IPC calls.
      const senderId = event && event.sender ? event.sender.id : null;
      const session = typeof senderId === 'number' ? sessionManager.getSession(senderId) : null;

      if (!session) {
        throw new Error('مطلوب تسجيل الدخول.');
      }

      const hasRole = allowedRoles.some((role) => session.roles.includes(role));
      if (!hasRole) {
        throw new Error('غير مسموح به.');
      }

      // Call the original handler with the event and arguments
      return await originalHandler(event, ...args);
    };
  };
};

module.exports = {
  getUserFromToken,
  requireRoles,
};
