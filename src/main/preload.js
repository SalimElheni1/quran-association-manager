/**
 * @fileoverview Preload script for secure IPC communication between main and renderer processes.
 * This script runs in a sandboxed environment and exposes a controlled API to the renderer process
 * using Electron's contextBridge for security.
 *
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposes a secure API to the renderer process through contextBridge.
 * This API provides controlled access to main process functionality without
 * exposing the entire Node.js environment to the renderer.
 *
 * All methods return Promises and use IPC channels for communication.
 * The API is organized by feature namespaces for better maintainability.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ========================================================================
  // GENERAL APPLICATION APIs
  // ========================================================================

  /**
   * Checks if the application is running in packaged mode (production).
   * @returns {Promise<boolean>} True if packaged, false if in development
   */
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),

  /**
   * Gets the current application version.
   * @returns {Promise<string>} The application version string
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * Retrieves a specific application setting by key.
   * @param {string} key - The setting key to retrieve
   * @returns {Promise<string|null>} The setting value or null if not found
   */
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),

  // ========================================================================
  // AUTHENTICATION APIs
  // ========================================================================

  /**
   * Authenticates a user with username and password.
   * @param {Object} credentials - The login credentials
   * @param {string} credentials.username - The username
   * @param {string} credentials.password - The password
   * @returns {Promise<Object>} Authentication result with token and user info
   */
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),

  /**
   * Logs out the current user and closes database connections.
   * This is a one-way message (send, not invoke).
   */
  logout: () => ipcRenderer.send('logout'),

  /**
   * Retrieves the current user's profile information.
   * @param {Object} [data] - Optional data object containing token
   * @param {string} [data.token] - JWT token (defaults to localStorage token)
   * @returns {Promise<Object>} User profile object or error response
   */
  getProfile: (data) => {
    // Allow caller to pass { token } or call without args; when called without args, forward token from localStorage
    const payload = data ?? { token: localStorage.getItem('token') };
    return ipcRenderer.invoke('auth:getProfile', payload).then((res) => {
      // Return profile object or pass through error shape
      if (res && res.success) return res.profile;
      return res;
    });
  },

  /**
   * Updates the current user's profile information.
   * @param {Object} data - Profile update data including token and profile fields
   * @returns {Promise<Object>} Update result
   */
  updateProfile: (data) => ipcRenderer.invoke('auth:updateProfile', data),

  /**
   * Updates the current user's password.
   * @param {Object} data - Password update data
   * @param {string} data.currentPassword - Current password for verification
   * @param {string} data.newPassword - New password
   * @param {string} data.token - JWT token
   * @returns {Promise<Object>} Update result
   */
  updatePassword: (data) => ipcRenderer.invoke('auth:updatePassword', data),

  // ========================================================================
  // STUDENT MANAGEMENT APIs
  // ========================================================================

  /**
   * Retrieves students with optional filtering.
   * @param {Object} [filters] - Optional filters for student search
   * @param {string} [filters.search] - Search term for name or matricule
   * @param {string} [filters.status] - Student status filter
   * @param {number} [filters.branchId] - Branch ID filter
   * @returns {Promise<Array>} Array of student objects
   */
  getStudents: (filters) => ipcRenderer.invoke('students:get', filters),

  /**
   * Retrieves a specific student by ID.
   * @param {number} id - The student ID
   * @returns {Promise<Object|null>} Student object or null if not found
   */
  getStudentById: (id) => ipcRenderer.invoke('students:getById', id),

  /**
   * Adds a new student to the database.
   * @param {Object} studentData - Student information
   * @param {string} studentData.name - Student's full name
   * @param {string} [studentData.email] - Student's email address
   * @param {string} [studentData.contact_info] - Contact information
   * @param {string} [studentData.parent_name] - Parent/guardian name
   * @param {string} [studentData.memorization_level] - Current memorization level
   * @returns {Promise<Object>} Creation result with new student ID
   */
  addStudent: (studentData) => ipcRenderer.invoke('students:add', studentData),

  /**
   * Updates an existing student's information.
   * @param {number} id - The student ID to update
   * @param {Object} studentData - Updated student information
   * @returns {Promise<Object>} Update result
   */
  updateStudent: (id, studentData) => ipcRenderer.invoke('students:update', id, studentData),

  /**
   * Deletes a student from the database.
   * @param {number} id - The student ID to delete
   * @returns {Promise<Object>} Deletion result
   */
  deleteStudent: (id) => ipcRenderer.invoke('students:delete', id),

  /**
   * Retrieves all surahs in the Quran.
   * @returns {Promise<Array>} Array of surah objects
   */
  getSurahs: () => ipcRenderer.invoke('surahs:get'),

  /**
   * Retrieves all hizbs in the Quran.
   * @returns {Promise<Array>} Array of hizb objects
   */
  getHizbs: () => ipcRenderer.invoke('hizbs:get'),

  // Teachers API
  getTeachers: (filters) => ipcRenderer.invoke('teachers:get', filters),
  getTeacherById: (id) => ipcRenderer.invoke('teachers:getById', id),
  addTeacher: (teacherData) => ipcRenderer.invoke('teachers:add', teacherData),
  updateTeacher: (id, teacherData) => ipcRenderer.invoke('teachers:update', id, teacherData),
  deleteTeacher: (id) => ipcRenderer.invoke('teachers:delete', id),

  // Classes API
  getClasses: (filters) => ipcRenderer.invoke('classes:get', filters),
  getClassesForStudent: (criteria) => ipcRenderer.invoke('classes:getForStudent', criteria),
  addClass: (classData) => ipcRenderer.invoke('classes:add', classData),
  updateClass: (id, classData) => ipcRenderer.invoke('classes:update', id, classData),
  deleteClass: (id) => ipcRenderer.invoke('classes:delete', id),
  getClassById: (id) => ipcRenderer.invoke('classes:getById', id),
  getEnrollmentData: (data) => ipcRenderer.invoke('classes:getEnrollmentData', data),
  updateEnrollments: (classId, studentIds) =>
    ipcRenderer.invoke('classes:updateEnrollments', { classId, studentIds }),

  // Groups API
  getGroups: (filters) => ipcRenderer.invoke('groups:get', filters),
  addGroup: (groupData) => ipcRenderer.invoke('groups:add', groupData),
  updateGroup: (id, groupData) => ipcRenderer.invoke('groups:update', id, groupData),
  deleteGroup: (id) => ipcRenderer.invoke('groups:delete', id),
  getGroupStudents: (groupId) => ipcRenderer.invoke('groups:getGroupStudents', groupId),
  addStudentToGroup: (studentId, groupId) =>
    ipcRenderer.invoke('groups:addStudentToGroup', { studentId, groupId }),
  removeStudentFromGroup: (studentId, groupId) =>
    ipcRenderer.invoke('groups:removeStudentFromGroup', { studentId, groupId }),
  getStudentGroups: (studentId) => ipcRenderer.invoke('groups:getStudentGroups', studentId),
  getAssignmentData: (groupId) => ipcRenderer.invoke('groups:getAssignmentData', groupId),
  updateGroupStudents: (data) => ipcRenderer.invoke('groups:updateGroupStudents', data),
  getEligibleGroupsForClass: (classId) =>
    ipcRenderer.invoke('groups:getEligibleGroupsForClass', classId),
  getEligibleStudentsForGroup: (groupCategory) =>
    ipcRenderer.invoke('groups:getEligibleStudentsForGroup', groupCategory),

  // Settings API
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settingsData) => ipcRenderer.invoke('settings:update', settingsData),
  uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),
  getLogo: () => ipcRenderer.invoke('settings:getLogo'),

  // Dialog API
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),

  // Backup API
  runBackup: (settings) => ipcRenderer.invoke('backup:run', settings),
  getBackupStatus: () => ipcRenderer.invoke('backup:getStatus'),
  getBackupReminderStatus: () => ipcRenderer.invoke('backup:get-reminder-status'),
  importDatabase: (data) => ipcRenderer.invoke('db:import', data),

  // User Management API (for Superadmin)
  getUsers: (filters) => ipcRenderer.invoke('users:get', filters),
  addUser: (userData) => ipcRenderer.invoke('users:add', userData),
  getUserById: (id) => ipcRenderer.invoke('users:getById', id),
  updateUser: (id, userData) => ipcRenderer.invoke('users:update', { id, userData }),
  deleteUser: (id) => ipcRenderer.invoke('users:delete', id),
  // Onboarding helpers
  updateUserGuide: (id, guideData) =>
    // Use lightweight handler that only updates onboarding fields to avoid validation errors
    ipcRenderer.invoke('users:updateGuide', { id, guideData }),

  // Dashboard API
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getTodaysClasses: () => ipcRenderer.invoke('get-todays-classes'),

  // Attendance API
  getClassesForDay: (date) => ipcRenderer.invoke('attendance:getClassesForDay', date),
  getStudentsForClass: (classId) => ipcRenderer.invoke('attendance:getStudentsForClass', classId),
  getAttendanceForDate: (classId, date) =>
    ipcRenderer.invoke('attendance:getForDate', { classId, date }),
  saveAttendance: (data) => ipcRenderer.invoke('attendance:save', data),
  getAttendanceSummaryForClass: (classId) =>
    ipcRenderer.invoke('db:get-attendance-summary-for-class', classId),

  // Financials API
  getExpenses: () => ipcRenderer.invoke('get-expenses'),
  addExpense: (expense) => ipcRenderer.invoke('add-expense', expense),
  updateExpense: (expense) => ipcRenderer.invoke('update-expense', expense),
  deleteExpense: (id) => ipcRenderer.invoke('delete-expense', id),

  getDonations: () => ipcRenderer.invoke('get-donations'),
  addDonation: (donation) => ipcRenderer.invoke('add-donation', donation),
  updateDonation: (donation) => ipcRenderer.invoke('update-donation', donation),
  deleteDonation: (id) => ipcRenderer.invoke('delete-donation', id),

  // Inventory API
  getInventoryItems: () => ipcRenderer.invoke('inventory:get'),
  checkInventoryItemUniqueness: (data) => ipcRenderer.invoke('inventory:check-uniqueness', data),
  addInventoryItem: (item) => ipcRenderer.invoke('inventory:add', item),
  updateInventoryItem: (item) => ipcRenderer.invoke('inventory:update', item),
  deleteInventoryItem: (id) => ipcRenderer.invoke('inventory:delete', id),

  getSalaries: () => ipcRenderer.invoke('get-salaries'),
  addSalary: (salary) => ipcRenderer.invoke('add-salary', salary),
  updateSalary: (salary) => ipcRenderer.invoke('update-salary', salary),
  deleteSalary: (id) => ipcRenderer.invoke('delete-salary', id),

  getPayments: () => ipcRenderer.invoke('get-payments'),
  addPayment: (payment) => ipcRenderer.invoke('add-payment', payment),
  updatePayment: (payment) => ipcRenderer.invoke('update-payment', payment),
  deletePayment: (id) => ipcRenderer.invoke('delete-payment', id),

  // New Unified Financial API
  getTransactions: (filters) => ipcRenderer.invoke('transactions:get', filters),
  addTransaction: (transaction) => ipcRenderer.invoke('transactions:add', transaction),
  updateTransaction: (id, transaction) =>
    ipcRenderer.invoke('transactions:update', id, transaction),
  deleteTransaction: (id) => ipcRenderer.invoke('transactions:delete', id),
  getFinancialSummary: (period) => ipcRenderer.invoke('financial:get-summary', period),
  exportFinancialReportPDF: (data) => ipcRenderer.invoke('financial:export-pdf', data),
  exportFinancialReportExcel: (data) => ipcRenderer.invoke('financial:export-excel', data),
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  addAccount: (account) => ipcRenderer.invoke('accounts:add', account),
  getCategories: (type) => ipcRenderer.invoke('categories:get', type),
  getInKindCategories: () => ipcRenderer.invoke('in-kind-categories:get'),
  addInKindCategory: (name) => ipcRenderer.invoke('in-kind-categories:add', name),
  updateInKindCategory: (id, name) => ipcRenderer.invoke('in-kind-categories:update', id, name),
  deleteInKindCategory: (id) => ipcRenderer.invoke('in-kind-categories:delete', id),

  // Student Fees API
  studentFeesGetStatus: (studentId) => ipcRenderer.invoke('student-fees:getStatus', studentId),
  studentFeesGetAll: () => ipcRenderer.invoke('student-fees:getAll'),
  studentFeesRecordPayment: (paymentDetails) => ipcRenderer.invoke('student-fees:recordPayment', paymentDetails),
  studentFeesGetPaymentHistory: (studentId, academicYear) => ipcRenderer.invoke('student-fees:getPaymentHistory', { studentId, academicYear }),
  studentFeesGetClassesWithSpecialFees: (studentId) => ipcRenderer.invoke('student-fees:getClassesWithSpecialFees', studentId),
  studentFeesTriggerManualGeneration: () => ipcRenderer.invoke('student-fees:triggerManualGeneration'),
  studentFeesGenerateAllCharges: (academicYear) => ipcRenderer.invoke('student-fees:generateAllCharges', academicYear),
  studentFeesGenerateAnnualCharges: (academicYear) => ipcRenderer.invoke('student-fees:generateAnnualCharges', academicYear),
  studentFeesGenerateMonthlyCharges: (data) => ipcRenderer.invoke('student-fees:generateMonthlyCharges', data),

  // Legacy Financial API (kept for backward compatibility)
  getMonthlySnapshot: (period) => ipcRenderer.invoke('get-monthly-snapshot', period),
  getStatementOfActivities: (period) => ipcRenderer.invoke('get-statement-of-activities', period),

  // Exports API
  generateExport: (options) => ipcRenderer.invoke('export:generate', options),

  // Financial Export API
  exportCashLedger: (period) => ipcRenderer.invoke('financial-export:cash-ledger', period),
  exportInventoryLedger: () => ipcRenderer.invoke('financial-export:inventory-ledger'),
  exportInventoryRegister: (period) =>
    ipcRenderer.invoke('financial-export:inventory-register', period),
  exportFinancialSummary: (period) =>
    ipcRenderer.invoke('financial-export:financial-summary', period),
  exportFinancialReportWord: (data) => ipcRenderer.invoke('financial-export:word-report', data),

  // Imports API
  generateImportTemplate: (options) => ipcRenderer.invoke('generate-import-template', options),
  generateDevTemplate: () => ipcRenderer.invoke('export:generate-dev-template'),

  // Single-step Excel Import API
  importExcel: (filePath, selectedSheets) =>
    ipcRenderer.invoke('import:excel', filePath, selectedSheets),
  getImportSheets: () => ipcRenderer.invoke('import:get-sheets'),
  getSheetInfo: (sheetName) => ipcRenderer.invoke('import:get-sheet-info', sheetName),

  // Receipt Books API
  getReceiptBooks: (filters) => ipcRenderer.invoke('receipt-books:get', filters),
  getActiveReceiptBook: (receiptType) =>
    ipcRenderer.invoke('receipt-books:get-active', receiptType),
  addReceiptBook: (book) => ipcRenderer.invoke('receipt-books:add', book),
  updateReceiptBook: (book) => ipcRenderer.invoke('receipt-books:update', book),
  deleteReceiptBook: (id) => ipcRenderer.invoke('receipt-books:delete', id),
  getNextReceiptNumber: (receiptType) =>
    ipcRenderer.invoke('receipt-books:get-next-number', receiptType),
  checkReceiptExists: (data) => ipcRenderer.invoke('receipt-books:check-exists', data),

  // Listener for events from main process
  onForceLogout: (callback) => {
    const handler = (event, ...args) => callback(event, ...args);
    ipcRenderer.on('force-logout', handler);
    return () => {
      ipcRenderer.removeListener('force-logout', handler);
    };
  },
  /**
   * Register a listener for import completion events from the main process.
   * The callback will receive a single argument: the payload sent by main ({ sheets, results }).
   * Returns an unsubscribe function to remove the listener.
   *
   * Usage:
   * const unsubscribe = window.electronAPI.onImportCompleted((payload) => { ... });
   * unsubscribe();
   */
  onImportCompleted: (callback) => {
    if (!callback || typeof callback !== 'function') {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('import:completed', handler);
    return () => ipcRenderer.removeListener('import:completed', handler);
  },
  getInitialCredentials: () => ipcRenderer.invoke('get-initial-credentials'),
  clearInitialCredentials: () => ipcRenderer.invoke('clear-initial-credentials'),
});
