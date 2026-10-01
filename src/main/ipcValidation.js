// src/main/ipcValidation.js
// SEC-011: the shape of the arguments every IPC channel accepts, checked centrally by the guard
// in ipcSecurity.js before the handler runs. This layer stops wrong types, missing ids, extra
// arguments and non-object payloads at the door; the handlers keep their own detailed Joi
// validation of payload contents (validationSchemas.js, settingsValidation.js).
//
// Each entry lists one Joi schema per positional argument after the event, matching how
// src/main/preload.js calls the channel. A call may pass fewer arguments than listed (the
// missing ones are undefined) but never more.

const Joi = require('joi');

// Record ids: a positive integer, or the same as a digit string (some forms send select values).
const id = Joi.alternatives().try(
  Joi.number().integer().positive(),
  Joi.string().pattern(/^[1-9]\d{0,15}$/),
);
const requiredId = id.required();
// A plain object whose fields the handler validates (null and arrays are rejected).
const payload = Joi.object().unknown(true);
const requiredPayload = payload.required();
// Optional filters/options objects; the renderer may also send nothing or null.
const options = payload.allow(null);
const text = (max) => Joi.string().allow('').max(max);
const academicYear = Joi.string().max(20).allow(null, '');
const date = Joi.string().max(40);
const receiptType = Joi.string().max(60).allow(null, '');
// financial:get-summary takes a { startDate, endDate } period, a year, or nothing.
const period = Joi.alternatives()
  .try(payload, Joi.number().integer(), Joi.string().max(40))
  .allow(null);
const gender = Joi.string().max(20).allow(null, '');
const age = Joi.number().min(0).max(150).allow(null);

/** channel -> array of per-argument Joi schemas (the IPC event is not included). */
const CHANNEL_ARG_SCHEMAS = {
  // ---- App, auth and profile ----
  'get-is-packaged': [],
  'get-app-version': [],
  'get-initial-credentials': [],
  'auth:login': [requiredPayload],
  'auth:setup-superadmin': [requiredPayload],
  'auth:getProfile': [],
  'auth:updateProfile': [requiredPayload],
  'auth:updatePassword': [requiredPayload],
  logout: [],
  'ui:show-error-toast': [text(2000)],
  'ui:show-success-toast': [text(2000)],
  'app:relaunch': [],
  'dialog:openDirectory': [],
  'dialog:openFile': [options],

  // ---- Users ----
  'users:get': [options],
  'users:getById': [requiredId],
  'users:add': [requiredPayload],
  'users:update': [Joi.object({ id: requiredId, userData: requiredPayload }).required()],
  'users:delete': [requiredId],
  'users:restore': [requiredId],
  'users:updateGuide': [Joi.object({ id: requiredId, guideData: requiredPayload }).required()],

  // ---- Students ----
  'students:get': [options],
  'students:getById': [requiredId],
  'students:add': [requiredPayload],
  'students:update': [requiredId, requiredPayload],
  'students:delete': [requiredId],
  'students:restore': [requiredId],
  'students:getByAgeGroup': [requiredId],
  'surahs:get': [],
  'hizbs:get': [],

  // ---- Teachers ----
  'teachers:get': [options],
  'teachers:getById': [requiredId],
  'teachers:add': [requiredPayload],
  'teachers:update': [requiredId, requiredPayload],
  'teachers:delete': [requiredId],
  'teachers:restore': [requiredId],

  // ---- Classes ----
  'classes:get': [options],
  'classes:getById': [requiredId],
  'classes:add': [requiredPayload],
  'classes:update': [requiredId, requiredPayload],
  'classes:delete': [requiredId],
  'classes:restore': [requiredId],
  'classes:getForStudent': [requiredPayload],
  'classes:getEnrollmentData': [
    Joi.object({ classId: requiredId, classAgeGroupId: id.allow(null) })
      .unknown(true)
      .required(),
  ],
  'classes:updateEnrollments': [
    Joi.object({ classId: requiredId, studentIds: Joi.array().items(id).required() })
      .unknown(true)
      .required(),
  ],

  // ---- Groups ----
  'groups:get': [options],
  'groups:add': [requiredPayload],
  'groups:update': [requiredId, requiredPayload],
  'groups:delete': [requiredId],
  'groups:restore': [requiredId],
  'groups:getGroupStudents': [requiredId],
  'groups:addStudentToGroup': [
    Joi.object({ studentId: requiredId, groupId: requiredId }).required(),
  ],
  'groups:removeStudentFromGroup': [
    Joi.object({ studentId: requiredId, groupId: requiredId }).required(),
  ],
  'groups:getStudentGroups': [requiredId],
  'groups:getAssignmentData': [requiredId],
  'groups:updateGroupStudents': [
    Joi.object({ groupId: requiredId, studentIds: Joi.array().items(id).required() })
      .unknown(true)
      .required(),
  ],
  'groups:getEligibleGroupsForClass': [requiredId],
  'groups:getEligibleStudentsForGroup': [Joi.string().max(60).required()],

  // ---- Settings, age groups, backups ----
  'settings:get': [text(100)],
  'settings:update': [requiredPayload],
  'settings:getLogo': [],
  'settings:uploadLogo': [],
  'fee-charges:runManualCheck': [Joi.boolean()],
  'ageGroups:get': [],
  'ageGroups:create': [requiredPayload],
  'ageGroups:update': [requiredId, requiredPayload],
  'ageGroups:delete': [requiredId],
  'ageGroups:matchStudent': [age, gender],
  'ageGroups:validateStudentForClass': [age, gender, id.allow(null)],
  'backup:run': [requiredPayload, Joi.string().max(500).allow(null, '')],
  'backup:getStatus': [],
  'backup:get-reminder-status': [],
  'db:import': [requiredPayload],
  'db:rotate-key': [requiredPayload],

  // ---- Dashboard and attendance ----
  'get-dashboard-stats': [],
  'get-todays-classes': [],
  'attendance:getClassesForDay': [date.required()],
  'attendance:getStudentsForClass': [requiredId],
  'attendance:getForDate': [Joi.object({ classId: requiredId, date: date.required() }).required()],
  'attendance:save': [
    Joi.object({
      classId: requiredId,
      date: date.required(),
      records: Joi.object().pattern(/^\d+$/, Joi.string().max(20)).required(),
    }).required(),
  ],
  // Called with an empty value before a class is chosen (the handler then returns []).
  'db:get-attendance-summary-for-class': [id.allow(null, '')],

  // ---- Finances ----
  'transactions:get': [options],
  'transactions:get-earliest-date': [],
  'transactions:add': [requiredPayload],
  'transactions:update': [requiredId, requiredPayload],
  'transactions:delete': [requiredId],
  'financial:get-summary': [period],
  'financial:export-pdf': [options],
  'financial:export-excel': [options],
  'financial:reconcile': [],
  'accounts:get': [],
  'accounts:add': [requiredPayload],
  'categories:get': [Joi.string().max(20).allow(null, '')],
  'in-kind-categories:get': [options],
  'in-kind-categories:add': [Joi.string().max(200).required()],
  'in-kind-categories:update': [requiredId, Joi.string().max(200).required()],
  'in-kind-categories:delete': [requiredId],
  'in-kind-categories:restore': [requiredId],
  'inventory:get': [options],
  'inventory:check-uniqueness': [options],
  'inventory:add': [requiredPayload],
  'inventory:update': [requiredPayload],
  'inventory:delete': [requiredId],
  'inventory:restore': [requiredId],

  // ---- Student fees and receipts ----
  'student-fees:getAcademicYear': [],
  'student-fees:getStatus': [requiredId, academicYear],
  'student-fees:getBalanceSummary': [requiredId, academicYear],
  'student-fees:getFeeGroup': [requiredId],
  'student-fees:setFeeGroup': [
    Joi.object({ studentId: requiredId, ageGroupId: requiredId }).required(),
  ],
  'student-fees:getAll': [academicYear],
  'student-fees:recordPayment': [requiredPayload],
  'student-fees:deletePayment': [Joi.object({ paymentId: requiredId }).required()],
  'student-fees:refundPayment': [Joi.object({ paymentId: requiredId }).required()],
  'student-fees:getPaymentHistory': [
    Joi.object({ studentId: requiredId, academicYear }).required(),
  ],
  'student-fees:getClassesWithSpecialFees': [requiredId],
  'student-fees:generateAllCharges': [academicYear, Joi.boolean()],
  'student-fees:generateAnnualCharges': [academicYear],
  'student-fees:generateMonthlyCharges': [options],
  'student-fees:refreshStudentCharges': [
    Joi.object({ studentId: requiredId, academicYear }).unknown(true).required(),
  ],
  'student-fees:refreshAllStudentCharges': [options],
  'student-fees:resetCharges': [academicYear],
  'receipts:generate': [options],
  'receipts:getStats': [
    Joi.alternatives().try(Joi.number().integer(), Joi.string().max(20)).allow(null),
  ],
  'receipts:validate': [Joi.string().max(100).required()],
  'receipt-books:get': [options],
  'receipt-books:get-active': [receiptType],
  'receipt-books:add': [requiredPayload],
  'receipt-books:update': [requiredPayload],
  'receipt-books:delete': [requiredId],
  'receipt-books:restore': [requiredId],
  'receipt-books:get-next-number': [receiptType],
  'receipt-books:check-exists': [requiredPayload],

  // ---- Exports and imports ----
  'export:generate': [requiredPayload],
  'export:generate-dev-template': [],
  'financial-export:cash-ledger': [requiredPayload],
  'financial-export:inventory-ledger': [],
  'financial-export:inventory-register': [requiredPayload],
  'financial-export:financial-summary': [requiredPayload],
  'financial-export:word-report': [requiredPayload],
  'generate-import-template': [options],
  'import:generate-template': [],
  'import:excel': [Joi.string().max(4096).required(), Joi.array().items(Joi.string().max(200))],
  'import:get-sheets': [],
  'import:get-sheet-info': [Joi.string().max(200).required()],
  'import:execute': [requiredPayload],

  // ---- Logs ----
  'logs:get-recent': [Joi.object({ lines: Joi.number().integer().min(1).max(10000) })],
  'logs:get-filtered': [
    Joi.object({
      keyword: Joi.string().max(200).allow(''),
      lines: Joi.number().integer().min(1).max(10000),
    }),
  ],
  'logs:clear': [],
  'logs:get-file-path': [],
};

/**
 * Checks the arguments of one IPC call.
 * @param {string} channel
 * @param {Array} args The arguments after the IPC event.
 * @returns {string|null} Which argument failed and the Joi rule (never the value) when invalid;
 *   null when valid or when the channel has no schema (the guard reports such channels).
 */
function validateChannelArgs(channel, args) {
  const schemas = CHANNEL_ARG_SCHEMAS[channel];
  if (!schemas) return null;
  if (args.length > schemas.length) {
    return `expected at most ${schemas.length} argument(s), got ${args.length}`;
  }
  for (let i = 0; i < schemas.length; i += 1) {
    const { error } = schemas[i].validate(args[i]);
    if (error) {
      // Joi's own message quotes the rejected value; report only where and which rule failed.
      const [detail] = error.details;
      const field = detail.path.length ? ` (${detail.path.join('.')})` : '';
      return `argument ${i + 1}${field}: ${detail.type}`;
    }
  }
  return null;
}

function hasArgSchema(channel) {
  return Object.prototype.hasOwnProperty.call(CHANNEL_ARG_SCHEMAS, channel);
}

module.exports = { CHANNEL_ARG_SCHEMAS, validateChannelArgs, hasArgSchema };
