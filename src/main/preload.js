const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // General
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auth
  auth: {
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    getProfile: (data) => ipcRenderer.invoke('auth:getProfile', data),
    updateProfile: (data) => ipcRenderer.invoke('auth:updateProfile', data),
  },

  // Students
  students: {
    get: (filters) => ipcRenderer.invoke('students:get', filters),
    getById: (id) => ipcRenderer.invoke('students:getById', id),
    add: (studentData) => ipcRenderer.invoke('students:add', studentData),
    update: (id, studentData) => ipcRenderer.invoke('students:update', id, studentData),
    delete: (id) => ipcRenderer.invoke('students:delete', id),
  },

  // Teachers
  teachers: {
    get: (filters) => ipcRenderer.invoke('teachers:get', filters),
    getById: (id) => ipcRenderer.invoke('teachers:getById', id),
    add: (teacherData) => ipcRenderer.invoke('teachers:add', teacherData),
    update: (id, teacherData) => ipcRenderer.invoke('teachers:update', id, teacherData),
    delete: (id) => ipcRenderer.invoke('teachers:delete', id),
  },

  // Classes (Seances)
  classes: {
    get: (filters) => ipcRenderer.invoke('classes:get', filters),
    getById: (id) => ipcRenderer.invoke('classes:getById', id),
    add: (classData) => ipcRenderer.invoke('classes:add', classData),
    update: (id, classData) => ipcRenderer.invoke('classes:update', id, classData),
    delete: (id) => ipcRenderer.invoke('classes:delete', id),
    getEnrollmentData: (data) => ipcRenderer.invoke('classes:getEnrollmentData', data),
    updateEnrollments: (classId, studentIds) =>
      ipcRenderer.invoke('classes:updateEnrollments', { classId, studentIds }),
  },

  // Attendance
  attendance: {
    getSheet: (args) => ipcRenderer.invoke('attendance:getSheet', args),
    createSheet: (args) => ipcRenderer.invoke('attendance:createSheet', args),
    updateSheet: (args) => ipcRenderer.invoke('attendance:updateSheet', args),
    listSheets: (args) => ipcRenderer.invoke('attendance:listSheets', args),
    // This is a temporary bridge for the old UI until it's fully replaced.
    getStudentsForClass: (classId) => ipcRenderer.invoke('attendance:getStudentsForClass', classId),
  },

  // Users (for Superadmin)
  users: {
    get: (filters) => ipcRenderer.invoke('users:get', filters),
    getById: (id) => ipcRenderer.invoke('users:getById', id),
    add: (userData) => ipcRenderer.invoke('users:add', userData),
    update: (id, userData) => ipcRenderer.invoke('users:update', { id, userData }),
    delete: (id) => ipcRenderer.invoke('users:delete', id),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settingsData) => ipcRenderer.invoke('settings:update', settingsData),
    uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),
  },

  // Dialogs
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },

  // Backups
  backup: {
    run: (settings) => ipcRenderer.invoke('backup:run', settings),
    getStatus: () => ipcRenderer.invoke('backup:getStatus'),
  },

  // Financials
  financials: {
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
  },
});
