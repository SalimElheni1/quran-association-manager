const sessionManager = require('./sessionManager');

const requireRoles = (allowedRoles) => {
  return (originalHandler) => {
    return async (event, ...args) => {
      // Authorization is decided from the main-process session registry
      // (created at login, keyed by the sender webContents id). The renderer
      // never supplies authentication state for IPC calls.
      const session = sessionManager.getSessionForEvent(event);

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
  requireRoles,
};
