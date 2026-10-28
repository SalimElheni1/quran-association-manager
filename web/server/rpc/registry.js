// Registers the desktop IPC handlers (src/main) on the shim ipcMain, in the same order as
// src/main/index.js, then the web replacements for the channels that only make sense on a
// desktop. rpc/dispatch.js calls them for HTTP requests.

require('../bootstrap');
const path = require('path');
const { ipcMain, dialog } = require('electron');
const { ROOT } = require('../bootstrap');

const main = (rel) => require(path.join(ROOT, 'src', 'main', rel));

let loaded = false;

function loadHandlers() {
  if (loaded) return ipcMain._handlers;
  loaded = true;

  // The desktop starts timers when settings are saved (backups to a folder, the daily fee
  // check). On a shared server a timer would keep running for whichever branch saved last, so
  // they are switched off before the handlers capture them; services/scheduler.js runs the
  // fee check for every branch instead.
  const feeChargeScheduler = main('feeChargeScheduler');
  feeChargeScheduler.startScheduler = () => {};
  feeChargeScheduler.stopScheduler = () => {};
  const backupManager = main('backupManager');
  backupManager.startScheduler = () => {};
  backupManager.stopScheduler = () => {};

  const { requireRoles } = main('authMiddleware');
  const { registerFinancialHandlers } = main('handlers/financialHandlers');
  const { registerStudentFeeHandlers } = main('handlers/studentFeeHandlers');
  const { registerFinancialWordExportHandlers } = main('services/financialWordExportService');
  const { registerFinancialExportHandlers } = main('services/financialExportService');
  const { generateCashLedgerReport } = main('services/cashLedgerExport');
  const { generateInventoryLedger } = main('services/inventoryLedgerExport');

  ipcMain.handle('get-is-packaged', () => true);
  ipcMain.handle('dialog:openFile', async (_event, options) => dialog.showOpenDialog(options));

  registerFinancialHandlers();
  registerStudentFeeHandlers();
  registerFinancialWordExportHandlers();
  registerFinancialExportHandlers();
  ipcMain.handle(
    'financial-export:cash-ledger',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(generateCashLedgerReport),
  );
  ipcMain.handle(
    'financial-export:inventory-ledger',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(generateInventoryLedger),
  );
  main('handlers/studentHandlers').registerStudentHandlers();
  main('handlers/teacherHandlers').registerTeacherHandlers();
  main('handlers/classHandlers').registerClassHandlers();
  main('handlers/groupHandlers').registerGroupHandlers();
  main('handlers/userHandlers').registerUserHandlers();
  main('handlers/attendanceHandlers').registerAttendanceHandlers();
  main('handlers/authHandlers').registerAuthHandlers();
  main('handlers/settingsHandlers').registerSettingsHandlers(
    main('settingsManager').refreshSettings,
  );
  main('handlers/dashboardHandlers').registerDashboardHandlers();
  main('handlers/systemHandlers').registerSystemHandlers();
  main('handlers/importHandlers').registerImportHandlers();
  main('handlers/receiptHandlers').registerReceiptHandlers();
  main('handlers/inventoryHandlers').registerInventoryHandlers();

  // The web versions of desktop-only channels.
  require('./webHandlers').registerWebHandlers(ipcMain);

  return ipcMain._handlers;
}

module.exports = { loadHandlers, ipcMain };
