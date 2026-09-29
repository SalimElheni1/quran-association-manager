# IPC API Reference

The renderer talks to the main process only through `window.electronAPI`, which
`src/main/preload.js` builds with one named method per IPC channel:

```javascript
const students = await window.electronAPI.getStudents({ searchTerm: 'أحمد' });
// → ipcRenderer.invoke('students:get', filters) → handler in src/main/handlers/studentHandlers.js
```

## Conventions

- **Names:** `<feature>:<action>` (`students:add`, `settings:update`). A few older channels use
  dashes (`get-app-version`).
- **Results:** methods return a Promise. Most return the data directly; some return
  `{ success, message, … }` objects.
- **Errors:** a failed call rejects with an `Error` whose message is in Arabic and safe to show
  (`toast.error(err.message)`). Joi validation failures read «بيانات غير صالحة: …».
- **Access:** every call passes `src/main/ipcSecurity.js` first: the sender must be the app
  window, the user must be logged in (except public channels), and their roles must include one
  of the channel's allowed roles. The **Allowed** column below comes from that file. "Any
  logged-in user" means the channel is not classified in `CHANNEL_ROLES` yet.
- **Parameters:** see the handler in the listed file; inputs that create or change records are
  validated with the Joi schemas in `src/main/validationSchemas.js` (settings:
  `settingsValidation.js`).

To add a channel, see [development.md](../setup/development.md#a-new-ipc-channel).

## Channels

Generated from the code by `npm run docs:api`; do not edit this section by hand.

<!-- api-doc:start -->

140 channels.

### accounts

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `accounts:add` | `addAccount` | Superadmin, Administrator | `handlers/financialHandlers.js` |
| `accounts:get` | `getAccounts` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |

### ageGroups

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `ageGroups:create` | `createAgeGroup` | Superadmin, Administrator | `handlers/settingsHandlers.js` |
| `ageGroups:delete` | `deleteAgeGroup` | Superadmin, Administrator | `handlers/settingsHandlers.js` |
| `ageGroups:get` | `getAgeGroups` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/settingsHandlers.js` |
| `ageGroups:matchStudent` | `matchStudentToAgeGroups` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/settingsHandlers.js` |
| `ageGroups:update` | `updateAgeGroup` | Superadmin, Administrator | `handlers/settingsHandlers.js` |
| `ageGroups:validateStudentForClass` | `validateStudentForClass` | Superadmin, Administrator | `handlers/settingsHandlers.js` |

### app

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `app:relaunch` | `relaunchApp` | Superadmin, Administrator | `handlers/systemHandlers.js` |

### attendance

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `attendance:getClassesForDay` | `getClassesForDay` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/attendanceHandlers.js` |
| `attendance:getForDate` | `getAttendanceForDate` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/attendanceHandlers.js` |
| `attendance:getStudentsForClass` | `getStudentsForClass` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/attendanceHandlers.js` |
| `attendance:save` | `saveAttendance` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/attendanceHandlers.js` |

### auth

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `auth:getProfile` | `getProfile` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/authHandlers.js` |
| `auth:login` | `login` | Public (before login) | `handlers/authHandlers.js` |
| `auth:setup-superadmin` | `setupSuperadmin` | Public (before login) | `handlers/authHandlers.js` |
| `auth:updatePassword` | `updatePassword` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/authHandlers.js` |
| `auth:updateProfile` | `updateProfile` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/authHandlers.js` |

### backup

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `backup:get-reminder-status` | `getBackupReminderStatus` | Superadmin, Administrator | `handlers/systemHandlers.js` |
| `backup:getStatus` | `getBackupStatus` | Superadmin, Administrator | `handlers/systemHandlers.js` |
| `backup:run` | `runBackup` | Superadmin, Administrator | `handlers/systemHandlers.js` |

### categories

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `categories:get` | `getCategories` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |

### classes

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `classes:add` | `addClass` | Superadmin, Administrator | `handlers/classHandlers.js` |
| `classes:delete` | `deleteClass` | Superadmin, Administrator | `handlers/classHandlers.js` |
| `classes:get` | `getClasses` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/classHandlers.js` |
| `classes:getById` | `getClassById` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/classHandlers.js` |
| `classes:getEnrollmentData` | `getEnrollmentData` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/classHandlers.js` |
| `classes:getForStudent` | `getClassesForStudent` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/classHandlers.js` |
| `classes:update` | `updateClass` | Superadmin, Administrator | `handlers/classHandlers.js` |
| `classes:updateEnrollments` | `updateEnrollments` | Superadmin, Administrator | `handlers/classHandlers.js` |

### db

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `db:get-attendance-summary-for-class` | `getAttendanceSummaryForClass` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/attendanceHandlers.js` |
| `db:import` | `importDatabase` | Superadmin | `handlers/systemHandlers.js` |

### dialog

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `dialog:openDirectory` | `openDirectoryDialog` | Superadmin, Administrator | `handlers/systemHandlers.js` |
| `dialog:openFile` | `openFileDialog` | Superadmin, Administrator, FinanceManager | `index.js` |

### export

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `export:generate` | `generateExport` | Superadmin, Administrator, FinanceManager | `handlers/systemHandlers.js` |
| `export:generate-dev-template` | `generateDevTemplate` | Superadmin | `index.js` |

### fee

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `fee-charges:runManualCheck` | `runManualFeeChargeCheck` | Superadmin, Administrator, FinanceManager | `handlers/settingsHandlers.js` |

### financial

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `financial-export:cash-ledger` | `exportCashLedger` | Superadmin, Administrator, FinanceManager | `index.js` |
| `financial-export:financial-summary` | `exportFinancialSummary` | Superadmin, Administrator, FinanceManager | `services/financialExportService.js` |
| `financial-export:inventory-ledger` | `exportInventoryLedger` | Superadmin, Administrator, FinanceManager | `index.js` |
| `financial-export:inventory-register` | `exportInventoryRegister` | Superadmin, Administrator, FinanceManager | `services/financialExportService.js` |
| `financial-export:word-report` | `exportFinancialReportWord` | Superadmin, Administrator, FinanceManager | `services/financialWordExportService.js` |
| `financial:export-excel` | `exportFinancialReportExcel` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `financial:export-pdf` | `exportFinancialReportPDF` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `financial:get-summary` | `getFinancialSummary` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `financial:reconcile` | — | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |

### generate

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `generate-import-template` | `generateImportTemplate` | Superadmin, Administrator, FinanceManager | `handlers/importHandlers.js` |

### get

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `get-app-version` | `getAppVersion` | Public (before login) | `handlers/systemHandlers.js` |
| `get-dashboard-stats` | `getDashboardStats` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/dashboardHandlers.js` |
| `get-initial-credentials` | `getInitialCredentials` | Public (before login) | `index.js` |
| `get-is-packaged` | `isPackaged` | Public (before login) | `index.js` |
| `get-todays-classes` | `getTodaysClasses` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/dashboardHandlers.js` |

### groups

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `groups:add` | `addGroup` | Superadmin, Administrator | `handlers/groupHandlers.js` |
| `groups:addStudentToGroup` | `addStudentToGroup` | Superadmin, Administrator | `handlers/groupHandlers.js` |
| `groups:delete` | `deleteGroup` | Superadmin, Administrator | `handlers/groupHandlers.js` |
| `groups:get` | `getGroups` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/groupHandlers.js` |
| `groups:getAssignmentData` | `getAssignmentData` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/groupHandlers.js` |
| `groups:getEligibleGroupsForClass` | `getEligibleGroupsForClass` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/groupHandlers.js` |
| `groups:getEligibleStudentsForGroup` | `getEligibleStudentsForGroup` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/groupHandlers.js` |
| `groups:getGroupStudents` | `getGroupStudents` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/groupHandlers.js` |
| `groups:getStudentGroups` | `getStudentGroups` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/groupHandlers.js` |
| `groups:removeStudentFromGroup` | `removeStudentFromGroup` | Superadmin, Administrator | `handlers/groupHandlers.js` |
| `groups:update` | `updateGroup` | Superadmin, Administrator | `handlers/groupHandlers.js` |
| `groups:updateGroupStudents` | `updateGroupStudents` | Superadmin, Administrator | `handlers/groupHandlers.js` |

### hizbs

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `hizbs:get` | `getHizbs` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/studentHandlers.js` |

### import

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `import:excel` | `importExcel` | Superadmin, Administrator, FinanceManager | `handlers/importHandlers.js` |
| `import:execute` | — | Superadmin, Administrator, FinanceManager | `handlers/systemHandlers.js` |
| `import:generate-template` | — | Superadmin, Administrator, FinanceManager | `handlers/systemHandlers.js` |
| `import:get-sheet-info` | `getSheetInfo` | Superadmin, Administrator, FinanceManager | `handlers/importHandlers.js` |
| `import:get-sheets` | `getImportSheets` | Superadmin, Administrator, FinanceManager | `handlers/importHandlers.js` |

### in

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `in-kind-categories:add` | `addInKindCategory` | Superadmin, Administrator | `handlers/financialHandlers.js` |
| `in-kind-categories:delete` | `deleteInKindCategory` | Superadmin, Administrator | `handlers/financialHandlers.js` |
| `in-kind-categories:get` | `getInKindCategories` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `in-kind-categories:update` | `updateInKindCategory` | Superadmin, Administrator | `handlers/financialHandlers.js` |

### inventory

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `inventory:add` | `addInventoryItem` | Superadmin, Administrator | `handlers/inventoryHandlers.js` |
| `inventory:check-uniqueness` | `checkInventoryItemUniqueness` | Superadmin, Administrator, FinanceManager | `handlers/inventoryHandlers.js` |
| `inventory:delete` | `deleteInventoryItem` | Superadmin, Administrator | `handlers/inventoryHandlers.js` |
| `inventory:get` | `getInventoryItems` | Superadmin, Administrator, FinanceManager | `handlers/inventoryHandlers.js` |
| `inventory:update` | `updateInventoryItem` | Superadmin, Administrator | `handlers/inventoryHandlers.js` |

### logout

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `logout` | `logout` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `index.js` |

### logs

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `logs:clear` | `clearLogs` | Superadmin | `handlers/systemHandlers.js` |
| `logs:get-file-path` | `getLogFilePath` | Superadmin | `handlers/systemHandlers.js` |
| `logs:get-filtered` | `getFilteredLogs` | Superadmin | `handlers/systemHandlers.js` |
| `logs:get-recent` | `getRecentLogs` | Superadmin | `handlers/systemHandlers.js` |

### receipt

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `receipt-books:add` | `addReceiptBook` | Superadmin, Administrator, FinanceManager | `handlers/receiptHandlers.js` |
| `receipt-books:check-exists` | `checkReceiptExists` | Superadmin, Administrator, FinanceManager | `handlers/receiptHandlers.js` |
| `receipt-books:delete` | `deleteReceiptBook` | Superadmin, Administrator, FinanceManager | `handlers/receiptHandlers.js` |
| `receipt-books:get` | `getReceiptBooks` | Superadmin, Administrator, FinanceManager | `handlers/receiptHandlers.js` |
| `receipt-books:get-active` | `getActiveReceiptBook` | Superadmin, Administrator, FinanceManager | `handlers/receiptHandlers.js` |
| `receipt-books:get-next-number` | `getNextReceiptNumber` | Superadmin, Administrator, FinanceManager | `handlers/receiptHandlers.js` |
| `receipt-books:update` | `updateReceiptBook` | Superadmin, Administrator, FinanceManager | `handlers/receiptHandlers.js` |

### receipts

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `receipts:generate` | — | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `receipts:getStats` | — | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `receipts:validate` | — | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |

### settings

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `settings:get` | `getSetting` | Superadmin, Administrator | `handlers/settingsHandlers.js` |
| `settings:getLogo` | `getLogo` | Public (before login) | `handlers/settingsHandlers.js` |
| `settings:update` | `updateSettings` | Superadmin, Administrator | `handlers/settingsHandlers.js` |
| `settings:uploadLogo` | `uploadLogo` | Superadmin, Administrator | `handlers/settingsHandlers.js` |

### student

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `student-fees:deletePayment` | `studentFeesDeletePayment` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:generateAllCharges` | `studentFeesGenerateAllCharges` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:generateAnnualCharges` | `studentFeesGenerateAnnualCharges` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:generateMonthlyCharges` | `studentFeesGenerateMonthlyCharges` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:getAcademicYear` | `studentFeesGetAcademicYear` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:getAll` | `studentFeesGetAll` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:getBalanceSummary` | `studentFeesGetBalanceSummary` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:getClassesWithSpecialFees` | `studentFeesGetClassesWithSpecialFees` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:getFeeGroup` | `studentFeesGetFeeGroup` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:getPaymentHistory` | `studentFeesGetPaymentHistory` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:getStatus` | `studentFeesGetStatus` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:recordPayment` | `studentFeesRecordPayment` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:refreshAllStudentCharges` | `studentFeesRefreshAllStudentCharges` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:refreshStudentCharges` | `studentFeesRefreshStudentCharges` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:refundPayment` | `studentFeesRefundPayment` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:resetCharges` | `studentFeesResetCharges` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |
| `student-fees:setFeeGroup` | `studentFeesSetFeeGroup` | Superadmin, Administrator, FinanceManager | `handlers/studentFeeHandlers.js` |

### students

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `students:add` | `addStudent` | Superadmin, Administrator | `handlers/studentHandlers.js` |
| `students:delete` | `deleteStudent` | Superadmin, Administrator | `handlers/studentHandlers.js` |
| `students:get` | `getStudents` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/studentHandlers.js` |
| `students:getByAgeGroup` | `getStudentsByAgeGroup` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/studentHandlers.js` |
| `students:getById` | `getStudentById` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/studentHandlers.js` |
| `students:update` | `updateStudent` | Superadmin, Administrator | `handlers/studentHandlers.js` |

### surahs

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `surahs:get` | `getSurahs` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/studentHandlers.js` |

### teachers

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `teachers:add` | `addTeacher` | Superadmin, Administrator | `handlers/teacherHandlers.js` |
| `teachers:delete` | `deleteTeacher` | Superadmin, Administrator | `handlers/teacherHandlers.js` |
| `teachers:get` | `getTeachers` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/teacherHandlers.js` |
| `teachers:getById` | `getTeacherById` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/teacherHandlers.js` |
| `teachers:update` | `updateTeacher` | Superadmin, Administrator | `handlers/teacherHandlers.js` |

### transactions

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `transactions:add` | `addTransaction` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `transactions:delete` | `deleteTransaction` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `transactions:get` | `getTransactions` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `transactions:get-earliest-date` | `getEarliestTransactionDate` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |
| `transactions:update` | `updateTransaction` | Superadmin, Administrator, FinanceManager | `handlers/financialHandlers.js` |

### ui

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `ui:show-error-toast` | `showErrorToast` | Public (before login) | `handlers/systemHandlers.js` |
| `ui:show-success-toast` | `showSuccessToast` | Public (before login) | `handlers/systemHandlers.js` |

### users

| Channel | `window.electronAPI` | Allowed | File |
|---|---|---|---|
| `users:add` | `addUser` | Superadmin | `handlers/userHandlers.js` |
| `users:delete` | `deleteUser` | Superadmin | `handlers/userHandlers.js` |
| `users:get` | `getUsers` | Superadmin, Administrator, FinanceManager | `handlers/userHandlers.js` |
| `users:getById` | `getUserById` | Superadmin | `handlers/userHandlers.js` |
| `users:update` | `updateUser` | Superadmin | `handlers/userHandlers.js` |
| `users:updateGuide` | `updateUserGuide` | Superadmin, Administrator, FinanceManager, SessionSupervisor | `handlers/userHandlers.js` |

<!-- api-doc:end -->
