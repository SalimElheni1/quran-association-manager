const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // General
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auth
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),

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

  // DEPRECATED: To be removed once all pages are refactored.
  db: {
    run: (sql, params) => ipcRenderer.invoke('db:run', { sql, params }),
    get: (sql, params) => ipcRenderer.invoke('db:get', { sql, params }),
    all: (sql, params) => ipcRenderer.invoke('db:all', { sql, params }),
  },
});
