const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // General
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),

  // Auth
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.send('logout'),
  getProfile: (data) => ipcRenderer.invoke('auth:getProfile', data),
  updateProfile: (data) => ipcRenderer.invoke('auth:updateProfile', data),
  updatePassword: (data) => ipcRenderer.invoke('auth:updatePassword', data),

  // Secure, specific database APIs
  getStudents: (filters) => ipcRenderer.invoke('students:get', filters),
  getStudentById: (id) => ipcRenderer.invoke('students:getById', id),
  addStudent: (studentData) => ipcRenderer.invoke('students:add', studentData),
  updateStudent: (id, studentData) => ipcRenderer.invoke('students:update', id, studentData),
  deleteStudent: (id) => ipcRenderer.invoke('students:delete', id),

  // Teachers API
  getTeachers: (filters) => ipcRenderer.invoke('teachers:get', filters),
  getTeacherById: (id) => ipcRenderer.invoke('teachers:getById', id),
  addTeacher: (teacherData) => ipcRenderer.invoke('teachers:add', teacherData),
  updateTeacher: (id, teacherData) => ipcRenderer.invoke('teachers:update', id, teacherData),
  deleteTeacher: (id) => ipcRenderer.invoke('teachers:delete', id),

  // Classes API
  getClasses: (filters) => ipcRenderer.invoke('classes:get', filters),
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
  addStudentToGroup: (studentId, groupId) => ipcRenderer.invoke('groups:addStudentToGroup', { studentId, groupId }),
  removeStudentFromGroup: (studentId, groupId) => ipcRenderer.invoke('groups:removeStudentFromGroup', { studentId, groupId }),
  getStudentGroups: (studentId) => ipcRenderer.invoke('groups:getStudentGroups', studentId),
  getAssignmentData: (groupId) => ipcRenderer.invoke('groups:getAssignmentData', groupId),
  updateGroupStudents: (data) => ipcRenderer.invoke('groups:updateGroupStudents', data),
  getEligibleGroupsForClass: (classId) => ipcRenderer.invoke('groups:getEligibleGroupsForClass', classId),

  // Settings API
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settingsData) => ipcRenderer.invoke('settings:update', settingsData),
  uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),
  getLogo: () => ipcRenderer.invoke('settings:getLogo'),

  // Dialog API
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),

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
  deleteInventoryItem: (id) => ipcRenderer.invoke('inventory:delete',id),

  getSalaries: () => ipcRenderer.invoke('get-salaries'),
  addSalary: (salary) => ipcRenderer.invoke('add-salary', salary),
  updateSalary: (salary) => ipcRenderer.invoke('update-salary', salary),
  deleteSalary: (id) => ipcRenderer.invoke('delete-salary', id),

  getPayments: () => ipcRenderer.invoke('get-payments'),
  addPayment: (payment) => ipcRenderer.invoke('add-payment', payment),
  updatePayment: (payment) => ipcRenderer.invoke('update-payment', payment),
  deletePayment: (id) => ipcRenderer.invoke('delete-payment', id),

  getFinancialSummary: (year) => ipcRenderer.invoke('get-financial-summary', year),
  getMonthlySnapshot: (period) => ipcRenderer.invoke('get-monthly-snapshot', period),
  getStatementOfActivities: (period) =>
    ipcRenderer.invoke('get-statement-of-activities', period),
  // generatePdfReport: () => ipcRenderer.invoke('generate-pdf-report'),
  // generateExcelReport: () => ipcRenderer.invoke('generate-excel-report'),
  // getChartData: () => ipcRenderer.invoke('get-chart-data'),

  // Exports API
  generateExport: (options) => ipcRenderer.invoke('export:generate', options),

  // Imports API
  generateImportTemplate: () => ipcRenderer.invoke('import:generate-template'),
  generateDevTemplate: () => ipcRenderer.invoke('export:generate-dev-template'),
  executeImport: (args) => ipcRenderer.invoke('import:execute', args),

  // Listener for events from main process
  onForceLogout: (callback) => {
    const handler = (event, ...args) => callback(event, ...args);
    ipcRenderer.on('force-logout', handler);
    return () => {
      ipcRenderer.removeListener('force-logout', handler);
    };
  },
  onShowInitialCredentials: (callback) => {
    const handler = (event, ...args) => callback(event, ...args);
    ipcRenderer.on('show-initial-credentials', handler);
    return () => {
      ipcRenderer.removeListener('show-initial-credentials', handler);
    };
  },
});
