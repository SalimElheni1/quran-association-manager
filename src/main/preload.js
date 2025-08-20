const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // General
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auth
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  getProfile: (data) => ipcRenderer.invoke('auth:getProfile', data),
  updateProfile: (data) => ipcRenderer.invoke('auth:updateProfile', data),

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

  // Settings API
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settingsData) => ipcRenderer.invoke('settings:update', settingsData),
  uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),

  // Dialog API
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Backup API
  runBackup: (settings) => ipcRenderer.invoke('backup:run', settings),
  getBackupStatus: () => ipcRenderer.invoke('backup:getStatus'),

  // User Management API (for Superadmin)
  getUsers: () => ipcRenderer.invoke('users:get'),
  addUser: (userData) => ipcRenderer.invoke('users:add', userData),
  getUserById: (id) => ipcRenderer.invoke('users:getById', id),
  updateUser: (id, userData) => ipcRenderer.invoke('users:update', { id, userData }),
  deleteUser: (id) => ipcRenderer.invoke('users:delete', id),

  // Attendance API (New)
  getAttendanceSheets: (filters) => ipcRenderer.invoke('attendance-sheets:get', filters),
  getAttendanceSheet: (seanceId, date) =>
    ipcRenderer.invoke('attendance-sheets:get-one', { seanceId, date }),
  createAttendanceSheet: (sheetData, entriesData) =>
    ipcRenderer.invoke('attendance-sheets:create', { sheetData, entriesData }),
  updateAttendanceSheet: (sheetId, sheetData, entriesData) =>
    ipcRenderer.invoke('attendance-sheets:update', { sheetId, sheetData, entriesData }),

  // Financials API
  getExpenses: () => ipcRenderer.invoke('get-expenses'),
  addExpense: (expense) => ipcRenderer.invoke('add-expense', expense),
  updateExpense: (expense) => ipcRenderer.invoke('update-expense', expense),
  deleteExpense: (id) => ipcRenderer.invoke('delete-expense', id),

  getDonations: () => ipcRenderer.invoke('get-donations'),
  addDonation: (donation) => ipcRenderer.invoke('add-donation', donation),
  updateDonation: (donation) => ipcRenderer.invoke('update-donation', donation),
  deleteDonation: (id) => ipcRenderer.invoke('delete-donation', id),

  getSalaries: () => ipcRenderer.invoke('get-salaries'),
  addSalary: (salary) => ipcRenderer.invoke('add-salary', salary),
  updateSalary: (salary) => ipcRenderer.invoke('update-salary', salary),
  deleteSalary: (id) => ipcRenderer.invoke('delete-salary', id),

  getPayments: () => ipcRenderer.invoke('get-payments'),
  addPayment: (payment) => ipcRenderer.invoke('add-payment', payment),
  updatePayment: (payment) => ipcRenderer.invoke('update-payment', payment),
  deletePayment: (id) => ipcRenderer.invoke('delete-payment', id),

  getFinancialSummary: () => ipcRenderer.invoke('get-financial-summary'),
  getMonthlySnapshot: () => ipcRenderer.invoke('get-monthly-snapshot'),
  getStatementOfActivities: () => ipcRenderer.invoke('get-statement-of-activities'),
  // generatePdfReport: () => ipcRenderer.invoke('generate-pdf-report'),
  // generateExcelReport: () => ipcRenderer.invoke('generate-excel-report'),
  // getChartData: () => ipcRenderer.invoke('get-chart-data'),
});
