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

  // Attendance API
  getClassesForDay: (date) => ipcRenderer.invoke('attendance:getClassesForDay', date),
  getStudentsForClass: (classId) => ipcRenderer.invoke('attendance:getStudentsForClass', classId),
  getAttendanceForDate: (classId, date) =>
    ipcRenderer.invoke('attendance:getForDate', { classId, date }),
  saveAttendance: (data) => ipcRenderer.invoke('attendance:save', data),
});
