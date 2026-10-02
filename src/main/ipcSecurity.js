// src/main/ipcSecurity.js
// Central IPC authorization guard (SEC-01 + SEC-06).
// - Every ipcMain.handle/on registration is wrapped by installIpcGuard.
// - Authorization is decided ONLY from the main-process session registry
//   (sessionManager), never from renderer-supplied tokens.
// - Sender frame validation restricts IPC to the application window itself.

const path = require('path');
const sessionManager = require('./sessionManager');
const { warn: logWarn } = require('./logger');
const { validateChannelArgs, hasArgSchema } = require('./ipcValidation');

const ERRORS = {
  AUTH_REQUIRED: 'مطلوب تسجيل الدخول.',
  FORBIDDEN: 'غير مسموح به.',
  SENDER_REJECTED: 'الوصول مرفوض.',
  INVALID_INPUT: 'بيانات غير صالحة.',
};

const ALLOWED_DEV_URL_ORIGIN = 'http://localhost:3000';
const ALLOWED_PROD_URL_MARKER = path.posix.join('dist', 'renderer', 'index.html');

const ROLES = {
  ADMIN: ['Superadmin', 'Administrator'],
  FINANCE: ['Superadmin', 'Administrator', 'FinanceManager'],
  SESSION: ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'],
  SUPERADMIN: ['Superadmin'],
};

// Channels callable before authentication (login screen, bootstrap, cosmetic UI).
const PUBLIC_CHANNELS = new Set([
  'auth:login',
  'auth:setup-superadmin',
  'get-initial-credentials',
  'get-is-packaged',
  'get-app-version',
  'settings:getLogo',
  'ui:show-error-toast',
  'ui:show-success-toast',
]);

// Role matrix for every protected channel. Any channel registered in the
// application that is missing from here is treated as "any authenticated
// session" and logs a warning in development (default-deny for anonymous).
const CHANNEL_ROLES = {
  // ---- Superadmin only (user management, logs, DB import, dev tooling) ----
  'users:add': ROLES.SUPERADMIN,
  'users:update': ROLES.SUPERADMIN,
  'users:delete': ROLES.SUPERADMIN,
  'users:restore': ROLES.SUPERADMIN,
  'users:getById': ROLES.SUPERADMIN,
  'logs:get-recent': ROLES.SUPERADMIN,
  'logs:get-filtered': ROLES.SUPERADMIN,
  'logs:clear': ROLES.SUPERADMIN,
  'logs:get-file-path': ROLES.SUPERADMIN,
  'db:import': ROLES.SUPERADMIN,
  'backup:reveal-transfer-key': ROLES.SUPERADMIN,
  'backup:set-transfer-key': ROLES.SUPERADMIN,
  'export:generate-dev-template': ROLES.SUPERADMIN,

  // ---- Superadmin / Administrator (settings, backups, educational data) ----
  'users:updateGuide': ROLES.SESSION,
  'settings:get': ROLES.ADMIN,
  'settings:update': ROLES.ADMIN,
  'settings:uploadLogo': ROLES.ADMIN,
  'fee-charges:runManualCheck': ROLES.FINANCE,
  'ageGroups:create': ROLES.ADMIN,
  'ageGroups:update': ROLES.ADMIN,
  'ageGroups:delete': ROLES.ADMIN,
  'ageGroups:validateStudentForClass': ROLES.ADMIN,
  'backup:run': ROLES.ADMIN,
  'backup:getStatus': ROLES.ADMIN,
  'backup:get-reminder-status': ROLES.ADMIN,
  'dialog:openDirectory': ROLES.ADMIN,
  'app:relaunch': ROLES.ADMIN,
  'students:add': ROLES.ADMIN,
  'students:update': ROLES.ADMIN,
  'students:delete': ROLES.ADMIN,
  'students:restore': ROLES.ADMIN,
  'inventory:add': ROLES.ADMIN,
  'inventory:update': ROLES.ADMIN,
  'inventory:delete': ROLES.ADMIN,
  'inventory:restore': ROLES.ADMIN,
  'accounts:add': ROLES.ADMIN,
  'in-kind-categories:add': ROLES.ADMIN,
  'in-kind-categories:update': ROLES.ADMIN,
  'in-kind-categories:delete': ROLES.ADMIN,
  'in-kind-categories:restore': ROLES.ADMIN,
  'teachers:add': ROLES.ADMIN,
  'teachers:update': ROLES.ADMIN,
  'teachers:delete': ROLES.ADMIN,
  'teachers:restore': ROLES.ADMIN,
  'classes:add': ROLES.ADMIN,
  'classes:update': ROLES.ADMIN,
  'classes:delete': ROLES.ADMIN,
  'classes:restore': ROLES.ADMIN,
  'classes:updateEnrollments': ROLES.ADMIN,
  'groups:add': ROLES.ADMIN,
  'groups:update': ROLES.ADMIN,
  'groups:delete': ROLES.ADMIN,
  'groups:restore': ROLES.ADMIN,
  'groups:updateGroupStudents': ROLES.ADMIN,
  'groups:addStudentToGroup': ROLES.ADMIN,
  'groups:removeStudentFromGroup': ROLES.ADMIN,

  // ---- Finance (Superadmin / Administrator / FinanceManager) ----
  'users:get': ROLES.FINANCE,
  'transactions:get': ROLES.FINANCE,
  'transactions:add': ROLES.FINANCE,
  'transactions:update': ROLES.FINANCE,
  'transactions:delete': ROLES.FINANCE,
  'transactions:get-earliest-date': ROLES.FINANCE,
  'financial:get-summary': ROLES.FINANCE,
  'financial:export-pdf': ROLES.FINANCE,
  'financial:export-excel': ROLES.FINANCE,
  'financial:reconcile': ROLES.FINANCE,
  'financial-export:cash-ledger': ROLES.FINANCE,
  'financial-export:inventory-ledger': ROLES.FINANCE,
  'financial-export:inventory-register': ROLES.FINANCE,
  'financial-export:financial-summary': ROLES.FINANCE,
  'financial-export:word-report': ROLES.FINANCE,
  'accounts:get': ROLES.FINANCE,
  'categories:get': ROLES.FINANCE,
  'in-kind-categories:get': ROLES.FINANCE,
  'student-fees:getAcademicYear': ROLES.FINANCE,
  'student-fees:getPaymentHistory': ROLES.FINANCE,
  'student-fees:getClassesWithSpecialFees': ROLES.FINANCE,
  'student-fees:getStatus': ROLES.FINANCE,
  'student-fees:getBalanceSummary': ROLES.FINANCE,
  'student-fees:getFeeGroup': ROLES.FINANCE,
  'student-fees:setFeeGroup': ROLES.FINANCE,
  'student-fees:recordPayment': ROLES.FINANCE,
  'student-fees:deletePayment': ROLES.FINANCE,
  'student-fees:refundPayment': ROLES.FINANCE,
  'student-fees:getAll': ROLES.FINANCE,
  'student-fees:generateAnnualCharges': ROLES.FINANCE,
  'student-fees:generateMonthlyCharges': ROLES.FINANCE,
  'student-fees:generateAllCharges': ROLES.FINANCE,
  'student-fees:refreshStudentCharges': ROLES.FINANCE,
  'student-fees:refreshAllStudentCharges': ROLES.FINANCE,
  'student-fees:resetCharges': ROLES.FINANCE,
  'receipts:generate': ROLES.FINANCE,
  'receipts:getStats': ROLES.FINANCE,
  'receipts:validate': ROLES.FINANCE,
  'receipt-books:get': ROLES.FINANCE,
  'receipt-books:get-active': ROLES.FINANCE,
  'receipt-books:add': ROLES.FINANCE,
  'receipt-books:update': ROLES.FINANCE,
  'receipt-books:delete': ROLES.FINANCE,
  'receipt-books:restore': ROLES.FINANCE,
  'receipt-books:get-next-number': ROLES.FINANCE,
  'receipt-books:check-exists': ROLES.FINANCE,
  'inventory:get': ROLES.FINANCE,
  'inventory:check-uniqueness': ROLES.FINANCE,
  'export:generate': ROLES.FINANCE,
  'import:excel': ROLES.FINANCE,
  'import:get-sheets': ROLES.FINANCE,
  'import:get-sheet-info': ROLES.FINANCE,
  'generate-import-template': ROLES.FINANCE,
  'import:generate-template': ROLES.FINANCE,
  'import:execute': ROLES.FINANCE,
  'dialog:openFile': ROLES.FINANCE,

  // ---- Any authenticated session (attendance/sessions + shared reads) ----
  'auth:getProfile': ROLES.SESSION,
  'auth:updateProfile': ROLES.SESSION,
  'auth:updatePassword': ROLES.SESSION,
  'students:get': ROLES.SESSION,
  'students:getById': ROLES.SESSION,
  'students:getByAgeGroup': ROLES.SESSION,
  'surahs:get': ROLES.SESSION,
  'hizbs:get': ROLES.SESSION,
  'teachers:get': ROLES.SESSION,
  'teachers:getById': ROLES.SESSION,
  'classes:get': ROLES.SESSION,
  'classes:getById': ROLES.SESSION,
  'classes:getEnrollmentData': ROLES.SESSION,
  'classes:getForStudent': ROLES.SESSION,
  'groups:get': ROLES.SESSION,
  'groups:getGroupStudents': ROLES.SESSION,
  'groups:getStudentGroups': ROLES.SESSION,
  'groups:getAssignmentData': ROLES.SESSION,
  'groups:getEligibleGroupsForClass': ROLES.SESSION,
  'groups:getEligibleStudentsForGroup': ROLES.SESSION,
  'ageGroups:get': ROLES.SESSION,
  'ageGroups:matchStudent': ROLES.SESSION,
  'attendance:getClassesForDay': ROLES.SESSION,
  'attendance:getForDate': ROLES.SESSION,
  'attendance:getStudentsForClass': ROLES.SESSION,
  'attendance:save': ROLES.SESSION,
  'db:get-attendance-summary-for-class': ROLES.SESSION,
  'get-dashboard-stats': ROLES.SESSION,
  'get-todays-classes': ROLES.SESSION,

  // ---- Logout: session-bound event channel (silently dropped when no session) ----
  logout: ROLES.SESSION,
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * True when the IPC sender is one of this application's own windows.
 * @param {{ getURL: Function }} webContents
 * @returns {boolean}
 */
function isAllowedSender(webContents) {
  try {
    const url = webContents && typeof webContents.getURL === 'function' ? webContents.getURL() : '';
    if (!url) return false;
    if (url.startsWith('file://') && url.includes(ALLOWED_PROD_URL_MARKER)) return true;
    try {
      return new URL(url).origin === ALLOWED_DEV_URL_ORIGIN;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Resolves the access policy for a channel.
 * @param {string} channel
 * @returns {{ public: boolean, roles: string[]|null, unknown: boolean }}
 */
function getPolicy(channel) {
  if (PUBLIC_CHANNELS.has(channel)) return { public: true, roles: null, unknown: false };
  if (hasOwn(CHANNEL_ROLES, channel))
    return { public: false, roles: CHANNEL_ROLES[channel], unknown: false };
  return { public: false, roles: null, unknown: true };
}

function sessionRoles(event) {
  const senderId = event && event.sender ? event.sender.id : null;
  if (typeof senderId !== 'number') return null;
  const session = sessionManager.getSession(senderId);
  return session ? session.roles : null;
}

/**
 * SEC-011: checks the call's arguments against the channel's schema (ipcValidation.js).
 * Logs the channel and the reason only — never the values, which can hold personal data.
 * @returns {boolean} true when the arguments are acceptable.
 */
function argsAreValid(channel, args) {
  const problem = validateChannelArgs(channel, args);
  if (!problem) return true;
  logWarn(`[ipcSecurity] Rejected invalid arguments for "${channel}": ${problem}`);
  return false;
}

/**
 * Wraps a handle registration with authentication + authorization + sender + argument checks.
 */
function wrapHandle(channel, handler, policy) {
  return async (event, ...args) => {
    if (!isAllowedSender(event && event.sender)) {
      throw new Error(ERRORS.SENDER_REJECTED);
    }
    if (policy.public) {
      if (!argsAreValid(channel, args)) throw new Error(ERRORS.INVALID_INPUT);
      return handler(event, ...args);
    }

    const roles = sessionRoles(event);
    if (!roles) throw new Error(ERRORS.AUTH_REQUIRED);
    if (policy.roles && !policy.roles.some((role) => roles.includes(role))) {
      throw new Error(ERRORS.FORBIDDEN);
    }
    if (policy.unknown) {
      logWarn(
        `[ipcSecurity] Unclassified channel "${channel}" invoked by user with roles [${roles.join(', ')}]. Classify it in CHANNEL_ROLES.`,
      );
    }
    if (!argsAreValid(channel, args)) throw new Error(ERRORS.INVALID_INPUT);
    return handler(event, ...args);
  };
}

/**
 * Wraps an `on` registration. Unauthorized senders are silently dropped
 * (a throw inside a listener would surface as an uncaught main-process error).
 */
function wrapOn(channel, handler, policy) {
  return (event, ...args) => {
    if (!isAllowedSender(event && event.sender)) return;
    if (!policy.public) {
      const roles = sessionRoles(event);
      if (!roles) return;
      if (policy.roles && !policy.roles.some((role) => roles.includes(role))) return;
    }
    if (!argsAreValid(channel, args)) return;
    return handler(event, ...args);
  };
}

/**
 * Installs the authorization guard by patching ipcMain.handle / ipcMain.on.
 * Must be called before any handler registration.
 * @param {object} ipcMain - The electron ipcMain module
 */
function installIpcGuard(ipcMain) {
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);

  const reportMissingSchema = (channel) => {
    if (!hasArgSchema(channel)) {
      logWarn(
        `[ipcSecurity] Channel "${channel}" has no argument schema. Add it to CHANNEL_ARG_SCHEMAS in ipcValidation.js.`,
      );
    }
  };

  ipcMain.handle = (channel, handler) => {
    reportMissingSchema(String(channel));
    const policy = getPolicy(String(channel));
    return originalHandle(channel, wrapHandle(channel, handler, policy));
  };

  ipcMain.on = (channel, handler) => {
    reportMissingSchema(String(channel));
    const policy = getPolicy(String(channel));
    return originalOn(channel, wrapOn(channel, handler, policy));
  };
}

module.exports = {
  ERRORS,
  PUBLIC_CHANNELS,
  CHANNEL_ROLES,
  ROLES,
  installIpcGuard,
  getPolicy,
  isAllowedSender,
  wrapHandle,
  wrapOn,
};
