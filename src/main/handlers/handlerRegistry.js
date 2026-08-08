const { ipcMain } = require('electron');
const { requireRoles, requireAuth } = require('../authMiddleware');

/**
 * Registration helpers that attach the authentication/authorisation checks to IPC channels.
 * Every channel that reads or writes association data must be registered through one of these
 * instead of `ipcMain.handle` directly, so that a compromised renderer cannot invoke it without
 * a valid session token.
 */
const ROLES = {
  superadmin: ['Superadmin'],
  admin: ['Superadmin', 'Administrator'],
  finance: ['Superadmin', 'Administrator', 'FinanceManager'],
  attendance: ['Superadmin', 'Administrator', 'SessionSupervisor'],
};

const handleWithRoles = (roles) => (channel, handler) =>
  ipcMain.handle(channel, requireRoles(roles)(handler));

module.exports = {
  ROLES,
  handleSuperadmin: handleWithRoles(ROLES.superadmin),
  handleAdmin: handleWithRoles(ROLES.admin),
  handleFinance: handleWithRoles(ROLES.finance),
  handleAttendance: handleWithRoles(ROLES.attendance),
  handleAuthenticated: (channel, handler) => ipcMain.handle(channel, requireAuth(handler)),
};
