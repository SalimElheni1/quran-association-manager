const { app, BrowserWindow, ipcMain, Menu, dialog, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const exportManager = require('./exportManager');
const { getSetting, refreshSettings } = require('./settingsManager');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const Store = require('electron-store');
const { getProfileHandler, updateProfileHandler } = require('./authHandlers');
const { getSettingsHandler, updateSettingsHandler, copyLogoAsset } = require('./settingsHandlers');
const { registerFinancialHandlers } = require('./financialHandlers');
const backupManager = require('./backupManager');
const importManager = require('./importManager');

require('dotenv').config();

if (require('electron-squirrel-startup')) {
  app.quit();
}

if (!app.isPackaged) {
  require('electron-reloader')(module);
}

if (!process.env.JWT_SECRET) {
  console.error(
    'FATAL ERROR: JWT_SECRET is not defined in the .env file. The application cannot start securely.',
  );
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(app.getAppPath(), app.isPackaged ? '../g247.png' : 'public/g247.png'),
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
  return mainWindow;
};

app.whenReady().then(async () => {
  // Register a custom protocol to safely serve images from the app's data directory.
  // This prevents exposing the entire filesystem to the renderer process.
  try {
    protocol.registerFileProtocol('safe-image', (request, callback) => {
      try {
        const url = request.url.substr('safe-image://'.length);
        const decodedUrl = decodeURI(url);
        const safePath = path.join(app.getPath('userData'), decodedUrl);

        // Ensure the path is within the intended directory to prevent path traversal attacks.
        const safeDir = path.join(app.getPath('userData'), 'assets', 'logos');
        if (path.dirname(safePath).startsWith(safeDir)) {
          callback({ path: safePath });
        } else {
          console.error('Blocked request for an unsafe path:', safePath);
          callback({ error: -6 }); // -6 is net::ERR_FILE_NOT_FOUND
        }
      } catch (error) {
        console.error('Error in safe-image protocol handler:', error);
        callback({ error: -6 });
      }
    });

    Menu.setApplicationMenu(null);
    const mainWindow = createWindow();

    // Check if a re-login is required after an import/restore operation
    const forceRelogin = store.get('force-relogin-after-restart');
    if (forceRelogin) {
      console.log('Force re-login flag is set. Sending force-logout signal to renderer.');
      // Wait for the window to be ready to receive events before sending
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('force-logout');
        store.delete('force-relogin-after-restart');
        console.log('Force re-login flag cleared.');
      });
    }

    // Register all financial IPC handlers
    registerFinancialHandlers();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Fatal error during application startup:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle user logout to close the database connection
ipcMain.on('logout', async () => {
  console.log('User logging out, closing database connection.');
  await db.closeDatabase();
});

// Gracefully close the database when the app is about to quit
app.on('will-quit', async () => {
  console.log('App is quitting, ensuring database is closed.');
  await db.closeDatabase();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ipcMain.handle('settings:get', (_event, key) => {
//   return getSetting(key);
// });

ipcMain.handle('students:get', async (_event, filters) => {
  let sql = 'SELECT id, name, date_of_birth, enrollment_date, status FROM students WHERE 1=1';
  const params = [];
  if (filters?.searchTerm) {
    sql += ' AND name LIKE ?';
    params.push(`%${filters.searchTerm}%`);
  }
  if (filters?.genderFilter && filters.genderFilter !== 'all') {
    sql += ' AND gender = ?';
    params.push(filters.genderFilter);
  }
  const today = new Date();
  if (filters?.minAgeFilter) {
    const minAgeBirthYear = today.getFullYear() - parseInt(filters.minAgeFilter, 10);
    sql += ` AND SUBSTR(date_of_birth, 1, 4) <= ?`;
    params.push(minAgeBirthYear.toString());
  }
  if (filters?.maxAgeFilter) {
    const maxAgeBirthYear = today.getFullYear() - parseInt(filters.maxAgeFilter, 10) - 1;
    sql += ` AND SUBSTR(date_of_birth, 1, 4) >= ?`;
    params.push(maxAgeBirthYear.toString());
  }
  sql += ' ORDER BY name ASC';
  return db.allQuery(sql, params);
});

ipcMain.handle('students:getById', (_event, id) => {
  return db.getQuery('SELECT * FROM students WHERE id = ?', [id]);
});

const studentValidationSchema = Joi.object({
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'الاسم يجب أن يكون نصاً',
    'string.empty': 'الاسم مطلوب',
    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
    'any.required': 'الاسم مطلوب',
  }),
  status: Joi.string().valid('active', 'inactive', 'graduated', 'on_leave').required(),
  date_of_birth: Joi.date().iso().allow(null, ''),
  gender: Joi.string().valid('Male', 'Female').allow(null, ''),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  contact_info: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
  parent_contact: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
}).unknown(true);

const classValidationSchema = Joi.object({
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'اسم الفصل يجب أن يكون نصاً',
    'string.empty': 'اسم الفصل مطلوب',
    'string.min': 'يجب أن يكون اسم الفصل 3 أحرف على الأقل',
    'any.required': 'اسم الفصل مطلوب',
  }),
  teacher_id: Joi.number().integer().positive().allow(null, ''),
  status: Joi.string().valid('pending', 'active', 'completed').required(),
  capacity: Joi.number().integer().min(1).allow(null, ''),
  schedule: Joi.string().allow(null, ''),
  gender: Joi.string().valid('women', 'men', 'kids', 'all').default('all'),
  class_type: Joi.string().allow(null, ''),
  start_date: Joi.date().iso().allow(null, ''),
  end_date: Joi.date().iso().allow(null, ''),
}).unknown(true);

const teacherValidationSchema = Joi.object({
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'الاسم يجب أن يكون نصاً',
    'string.empty': 'الاسم مطلوب',
    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
    'any.required': 'الاسم مطلوب',
  }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'البريد الإلكتروني غير صالح',
      'string.empty': 'البريد الإلكتروني مطلوب',
      'any.required': 'البريد الإلكتروني مطلوب',
    }),
  contact_info: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
}).unknown(true);

const userValidationSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
  first_name: Joi.string().min(2).max(50).required(),
  last_name: Joi.string().min(2).max(50).required(),
  employment_type: Joi.string().valid('volunteer', 'contract').required(),
  role: Joi.string().valid('Manager', 'FinanceManager', 'Admin', 'SessionSupervisor').required(),
  date_of_birth: Joi.date().iso().allow(null, ''),
  national_id: Joi.string().allow(null, ''),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  phone_number: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
  occupation: Joi.string().allow(null, ''),
  civil_status: Joi.string().valid('Single', 'Married', 'Divorced', 'Widowed').allow(null, ''),
  end_date: Joi.date().iso().allow(null, ''),
  notes: Joi.string().allow(null, ''),
  start_date: Joi.when('employment_type', {
    is: 'contract',
    then: Joi.date().iso().required(),
    otherwise: Joi.date().iso().allow(null, ''),
  }),
}).unknown(true);

const userUpdateValidationSchema = userValidationSchema.keys({
  password: Joi.string().min(8).allow(null, ''),
  status: Joi.string().valid('active', 'inactive').required(),
});

const studentFields = [
  'name',
  'date_of_birth',
  'gender',
  'address',
  'contact_info',
  'email',
  'status',
  'memorization_level',
  'notes',
  'parent_name',
  'guardian_relation',
  'parent_contact',
  'guardian_email',
  'emergency_contact_name',
  'emergency_contact_phone',
  'health_conditions',
  'national_id',
  'school_name',
  'grade_level',
  'educational_level',
  'occupation',
  'civil_status',
  'related_family_members',
  'financial_assistance_notes',
];

const userFields = [
  'username',
  'password',
  'first_name',
  'last_name',
  'date_of_birth',
  'national_id',
  'email',
  'phone_number',
  'occupation',
  'civil_status',
  'employment_type',
  'start_date',
  'end_date',
  'role',
  'status',
  'notes',
];

ipcMain.handle('students:add', async (_event, studentData) => {
  try {
    const validatedData = await studentValidationSchema.validateAsync(studentData, {
      abortEarly: false,
      stripUnknown: false,
    });
    const fieldsToInsert = studentFields.filter((field) => validatedData[field] !== undefined);
    if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');
    const placeholders = fieldsToInsert.map(() => '?').join(', ');
    const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
    const sql = `INSERT INTO students (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in students:add handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('students:update', async (_event, id, studentData) => {
  try {
    const validatedData = await studentValidationSchema.validateAsync(studentData, {
      abortEarly: false,
      stripUnknown: false,
    });
    const fieldsToUpdate = studentFields.filter((field) => validatedData[field] !== undefined);
    const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
    const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
    const sql = `UPDATE students SET ${setClauses} WHERE id = ?`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in students:update handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('students:delete', (_event, id) => {
  if (!id || typeof id !== 'number')
    throw new Error('A valid student ID is required for deletion.');
  const sql = 'DELETE FROM students WHERE id = ?';
  return db.runQuery(sql, [id]);
});

const teacherFields = [
  'name',
  'national_id',
  'contact_info',
  'email',
  'address',
  'date_of_birth',
  'gender',
  'educational_level',
  'specialization',
  'years_of_experience',
  'availability',
  'notes',
];

ipcMain.handle('teachers:add', async (_event, teacherData) => {
  try {
    const validatedData = await teacherValidationSchema.validateAsync(teacherData, {
      abortEarly: false,
      stripUnknown: false,
    });
    const fieldsToInsert = teacherFields.filter((field) => validatedData[field] !== undefined);
    if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');
    const placeholders = fieldsToInsert.map(() => '?').join(', ');
    const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
    const sql = `INSERT INTO teachers (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in teachers:add handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('teachers:update', async (_event, id, teacherData) => {
  try {
    const validatedData = await teacherValidationSchema.validateAsync(teacherData, {
      abortEarly: false,
      stripUnknown: false,
    });
    const fieldsToUpdate = teacherFields.filter((field) => validatedData[field] !== undefined);
    const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
    const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
    const sql = `UPDATE teachers SET ${setClauses} WHERE id = ?`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in teachers:update handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('teachers:delete', (_event, id) => {
  if (!id || typeof id !== 'number')
    throw new Error('A valid teacher ID is required for deletion.');
  const sql = 'DELETE FROM teachers WHERE id = ?';
  return db.runQuery(sql, [id]);
});

ipcMain.handle('teachers:get', async (_event, filters) => {
  let sql = 'SELECT id, name, contact_info, specialization, gender FROM teachers WHERE 1=1';
  const params = [];
  if (filters?.searchTerm) {
    sql += ' AND name LIKE ?';
    params.push(`%${filters.searchTerm}%`);
  }
  if (filters?.genderFilter && filters.genderFilter !== 'all') {
    sql += ' AND gender = ?';
    params.push(filters.genderFilter);
  }
  if (filters?.specializationFilter) {
    sql += ' AND specialization LIKE ?';
    params.push(`%${filters.specializationFilter}%`);
  }
  sql += ' ORDER BY name ASC';
  return db.allQuery(sql, params);
});

ipcMain.handle('teachers:getById', (_event, id) => {
  return db.getQuery('SELECT * FROM teachers WHERE id = ?', [id]);
});

const classFields = [
  'name',
  'class_type',
  'teacher_id',
  'schedule',
  'start_date',
  'end_date',
  'status',
  'capacity',
  'gender',
];

ipcMain.handle('classes:add', async (_event, classData) => {
  try {
    const validatedData = await classValidationSchema.validateAsync(classData, {
      abortEarly: false,
      stripUnknown: false,
    });
    const fieldsToInsert = classFields.filter((field) => validatedData[field] !== undefined);
    if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');
    const placeholders = fieldsToInsert.map(() => '?').join(', ');
    const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
    const sql = `INSERT INTO classes (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in classes:add handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('classes:update', async (_event, id, classData) => {
  try {
    const validatedData = await classValidationSchema.validateAsync(classData, {
      abortEarly: false,
      stripUnknown: false,
    });
    const fieldsToUpdate = classFields.filter((field) => validatedData[field] !== undefined);
    const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
    const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
    const sql = `UPDATE classes SET ${setClauses} WHERE id = ?`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in classes:update handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('classes:delete', (_event, id) => {
  if (!id || typeof id !== 'number') throw new Error('A valid class ID is required for deletion.');
  const sql = 'DELETE FROM classes WHERE id = ?';
  return db.runQuery(sql, [id]);
});

ipcMain.handle('classes:get', async (_event, filters) => {
  let sql = `
    SELECT c.id, c.name, c.class_type, c.schedule, c.status, c.gender,
           c.teacher_id, t.name as teacher_name
    FROM classes c
    LEFT JOIN teachers t ON c.teacher_id = t.id
    WHERE 1=1
  `;
  const params = [];
  if (filters?.searchTerm) {
    sql += ' AND c.name LIKE ?';
    params.push(`%${filters.searchTerm}%`);
  }
  if (filters?.status) {
    sql += ' AND c.status = ?';
    params.push(filters.status);
  }
  sql += ' ORDER BY c.name ASC';
  return db.allQuery(sql, params);
});

ipcMain.handle('classes:getById', (_event, id) => {
  const sql = `
    SELECT c.*, t.name as teacher_name
    FROM classes c
    LEFT JOIN teachers t ON c.teacher_id = t.id
    WHERE c.id = ?
  `;
  return db.getQuery(sql, [id]);
});

ipcMain.handle('classes:getEnrollmentData', async (_event, { classId, classGender }) => {
  try {
    const enrolledSql = `
      SELECT s.id, s.name 
      FROM students s
      INNER JOIN class_students cs ON s.id = cs.student_id
      WHERE cs.class_id = ? AND s.status = 'active'
      ORDER BY s.name ASC
    `;
    const enrolledStudents = await db.allQuery(enrolledSql, [classId]);
    let notEnrolledSql = `
      SELECT s.id, s.name 
      FROM students s 
      WHERE s.status = 'active' 
      AND s.id NOT IN (
        SELECT student_id FROM class_students WHERE class_id = ?
      )
    `;
    const notEnrolledParams = [classId];
    if (classGender === 'kids') {
      const adultAge = getSetting('adultAgeThreshold');
      notEnrolledSql += ` AND (strftime('%Y', 'now') - strftime('%Y', s.date_of_birth) < ?)`;
      notEnrolledParams.push(adultAge);
    } else if (classGender === 'men') {
      notEnrolledSql += ` AND s.gender = 'Male'`;
    } else if (classGender === 'women') {
      notEnrolledSql += ` AND s.gender = 'Female'`;
    }
    notEnrolledSql += ' ORDER BY s.name ASC';
    const notEnrolledStudents = await db.allQuery(notEnrolledSql, notEnrolledParams);
    return { enrolledStudents, notEnrolledStudents };
  } catch (error) {
    console.error('Error fetching enrollment data:', error);
    throw error;
  }
});

ipcMain.handle('export:generate', async (_event, { exportType, format, columns, options }) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      title: `Save ${exportType} Export`,
      defaultPath: `${exportType}-export-${Date.now()}.${format}`,
      filters: [
        format === 'pdf'
          ? { name: 'PDF Documents', extensions: ['pdf'] }
          : format === 'xlsx'
            ? { name: 'Excel Spreadsheets', extensions: ['xlsx'] }
            : { name: 'Word Documents', extensions: ['docx'] },
      ],
    });

    if (!filePath) {
      return { success: false, message: 'Export canceled by user.' };
    }

    if (exportType === 'financial-report') {
      const data = await exportManager.fetchFinancialData();
      await exportManager.generateFinancialXlsx(data, filePath);
    } else {
      const fields = columns.map((c) => c.key);
      const data = await exportManager.fetchExportData({ type: exportType, fields, options });

      if (data.length === 0) {
        return { success: false, message: 'No data available for the selected criteria.' };
      }

      const reportTitle = `${exportType.charAt(0).toUpperCase() + exportType.slice(1)} Report`;
      if (format === 'pdf') {
        await exportManager.generatePdf(reportTitle, columns, data, filePath);
      } else if (format === 'xlsx') {
        await exportManager.generateXlsx(columns, data, filePath);
      } else if (format === 'docx') {
        await exportManager.generateDocx(reportTitle, columns, data, filePath);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
    }

    return { success: true, message: `Export saved to ${filePath}` };
  } catch (error) {
    console.error(`Error during export (${exportType}, ${format}):`, error);
    return { success: false, message: `Export failed: ${error.message}` };
  }
});

ipcMain.handle('import:generate-template', async () => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Import Template',
      defaultPath: `import-template-${Date.now()}.xlsx`,
      filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }],
    });

    if (!filePath) {
      return { success: false, message: 'Template generation canceled by user.' };
    }

    await exportManager.generateExcelTemplate(filePath);

    return { success: true, message: `Template saved to ${filePath}` };
  } catch (error) {
    console.error('Error during template generation:', error);
    return { success: false, message: `Template generation failed: ${error.message}` };
  }
});

ipcMain.handle('import:execute', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Excel File to Import',
      properties: ['openFile'],
      filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: 'Import canceled by user.' };
    }

    const results = await importManager.importExcelData(filePaths[0]);

    return { success: true, ...results };
  } catch (error) {
    console.error('Error during import execution:', error);
    return { success: false, message: `Import failed: ${error.message}` };
  }
});

ipcMain.handle('users:get', async (_event, filters) => {
  let sql = 'SELECT id, username, first_name, last_name, email, role, status FROM users WHERE 1=1';
  const params = [];
  if (filters?.searchTerm) {
    sql += ' AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
    const searchTerm = `%${filters.searchTerm}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  if (filters?.roleFilter && filters.roleFilter !== 'all') {
    sql += ' AND role = ?';
    params.push(filters.roleFilter);
  }
  if (filters?.statusFilter && filters.statusFilter !== 'all') {
    sql += ' AND status = ?';
    params.push(filters.statusFilter);
  }
  sql += ' ORDER BY username ASC';
  return db.allQuery(sql, params);
});

ipcMain.handle('users:getById', (_event, id) => {
  return db.getQuery('SELECT * FROM users WHERE id = ?', [id]);
});

ipcMain.handle('users:add', async (_event, userData) => {
  try {
    const validatedData = await userValidationSchema.validateAsync(userData, {
      abortEarly: false,
      stripUnknown: false,
    });
    if (validatedData.password) {
      validatedData.password = bcrypt.hashSync(validatedData.password, 10);
    }
    const fieldsToInsert = userFields.filter((field) => validatedData[field] !== undefined);
    if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');
    const placeholders = fieldsToInsert.map(() => '?').join(', ');
    const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
    const sql = `INSERT INTO users (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in users:add handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('users:update', async (_event, { id, userData }) => {
  try {
    const validatedData = await userUpdateValidationSchema.validateAsync(userData, {
      abortEarly: false,
      stripUnknown: false,
    });
    if (validatedData.password) {
      validatedData.password = bcrypt.hashSync(validatedData.password, 10);
    }
    const fieldsToUpdate = userFields.filter((field) => validatedData[field] !== undefined);
    const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
    const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
    const sql = `UPDATE users SET ${setClauses} WHERE id = ?`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi)
      throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
    console.error('Error in users:update handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('users:delete', (_event, id) => {
  if (!id || typeof id !== 'number') throw new Error('A valid user ID is required for deletion.');
  const sql = 'DELETE FROM users WHERE id = ?';
  return db.runQuery(sql, [id]);
});

ipcMain.handle('get-dashboard-stats', async () => {
  try {
    const studentCountQuery = "SELECT COUNT(*) as count FROM students WHERE status = 'active'";
    const teacherCountQuery = 'SELECT COUNT(*) as count FROM teachers';
    const classCountQuery = "SELECT COUNT(*) as count FROM classes WHERE status = 'active'";

    // Run all queries in parallel for better performance
    const [studentResult, teacherResult, classResult] = await Promise.all([
      db.getQuery(studentCountQuery),
      db.getQuery(teacherCountQuery),
      db.getQuery(classCountQuery),
    ]);

    return {
      studentCount: studentResult.count,
      teacherCount: teacherResult.count,
      classCount: classResult.count,
    };
  } catch (error) {
    console.error('Failed to get dashboard stats:', error);
    // Forward a user-friendly error to the renderer process
    throw new Error('Failed to fetch dashboard statistics.');
  }
});

ipcMain.handle('get-todays-classes', async () => {
  try {
    const daysOfWeek = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const today = daysOfWeek[new Date().getDay()];

    const sql = `
      SELECT c.id, c.name, c.schedule, t.name as teacher_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      WHERE c.status = 'active'
    `;
    const allClasses = await db.allQuery(sql);

    const todaysClasses = allClasses.filter((c) => {
      if (!c.schedule || c.schedule === '[]') return false;
      try {
        const scheduleArray = JSON.parse(c.schedule);
        if (Array.isArray(scheduleArray)) {
          return scheduleArray.some((slot) => slot.day === today);
        }
      } catch (e) {
        console.error(`Could not parse schedule for class ID ${c.id}:`, c.schedule, e);
        return false;
      }
      return false;
    });

    return todaysClasses;
  } catch (error) {
    console.error("Failed to get today's classes:", error);
    throw new Error("Failed to fetch today's classes.");
  }
});

ipcMain.handle('classes:updateEnrollments', async (_event, { classId, studentIds }) => {
  try {
    await db.runQuery('BEGIN TRANSACTION');
    await db.runQuery('DELETE FROM class_students WHERE class_id = ?', [classId]);
    if (studentIds && studentIds.length > 0) {
      const placeholders = studentIds.map(() => '(?, ?)').join(', ');
      const params = [];
      studentIds.forEach((studentId) => {
        params.push(classId, studentId);
      });
      const sql = `INSERT INTO class_students (class_id, student_id) VALUES ${placeholders}`;
      await db.runQuery(sql, params);
    }
    await db.runQuery('COMMIT');
    console.log('Enrollments updated successfully');
    return { success: true };
  } catch (error) {
    await db.runQuery('ROLLBACK');
    console.error('Error updating enrollments:', error);
    throw error;
  }
});

// --- Authentication and Profile IPC Handlers ---

ipcMain.handle('auth:login', async (_event, { username, password }) => {
  console.log(`Login attempt for user: ${username}`);
  try {
    // 1. Initialize and decrypt the database with the provided password.
    // This is the most critical step.
    await db.initializeDatabase(password);

    // 2. Now that the DB is open, find the user.
    const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      await db.closeDatabase(); // Close DB on failure
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    // 3. Compare the password hash.
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await db.closeDatabase(); // Close DB on failure
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    // 4. On success, generate JWT and return user data.
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' },
    );
    return {
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role },
    };
  } catch (error) {
    console.error('Error in auth:login handler:', error.message);
    await db.closeDatabase(); // Ensure DB is closed on any error.
    return { success: false, message: 'حدث خطأ غير متوقع في الخادم.' };
  }
});

ipcMain.handle('auth:getProfile', async (_event, { token }) => {
  try {
    return await getProfileHandler(token);
  } catch (error) {
    console.error('Error in auth:getProfile IPC wrapper:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('auth:updateProfile', async (_event, { token, profileData }) => {
  try {
    return await updateProfileHandler(token, profileData);
  } catch (error) {
    console.error('Error in auth:updateProfile IPC wrapper:', error);
    if (error.isJoi) {
      const messages = error.details.map((d) => d.message).join('; ');
      return { success: false, message: `بيانات غير صالحة: ${messages}` };
    }
    return { success: false, message: error.message || 'حدث خطأ غير متوقع في الخادم.' };
  }
});

// --- Settings IPC Handlers ---

ipcMain.handle('settings:get', async () => {
  try {
    // Gracefully handle calls made before the database is unlocked
    if (!db.isDbOpen()) {
      return { success: true, settings: {} };
    }
    return await getSettingsHandler();
  } catch (error) {
    console.error('Error in settings:get IPC wrapper:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('settings:update', async (_event, settingsData) => {
  try {
    const result = await updateSettingsHandler(settingsData);

    // If the settings were updated successfully, restart the scheduler with the new settings
    if (result.success) {
      console.log('Settings updated, restarting backup scheduler...');
      const { settings: newSettings } = await getSettingsHandler();
      if (newSettings) {
        backupManager.startScheduler(newSettings);
      }
      await refreshSettings();
    }

    return result;
  } catch (error) {
    console.error('Error in settings:update IPC wrapper:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('settings:getLogo', async () => {
  try {
    // Gracefully handle calls made before the database is unlocked
    if (!db.isDbOpen()) {
      return { success: true, path: null };
    }
    const { settings } = await getSettingsHandler();
    const userDataPath = app.getPath('userData');

    // Check for regional/local logo first, as it takes precedence.
    if (settings.regional_local_logo_path) {
      const logoPath = path.join(userDataPath, settings.regional_local_logo_path);
      if (fs.existsSync(logoPath)) {
        return { success: true, path: `safe-image://${settings.regional_local_logo_path}` };
      }
    }

    // Then check for a user-uploaded national logo.
    if (settings.national_logo_path) {
      const logoPath = path.join(userDataPath, settings.national_logo_path);
      if (fs.existsSync(logoPath)) {
        return { success: true, path: `safe-image://${settings.national_logo_path}` };
      }
    }

    // Fallback to null if no custom logo is found. The renderer will use the default.
    return { success: true, path: null };
  } catch (error) {
    console.error('Failed to get logo:', error);
    return { success: false, message: `Error getting logo: ${error.message}` };
  }
});

// --- Dialog IPC Handlers ---

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled) {
    return { success: false };
  } else {
    return { success: true, path: filePaths[0] };
  }
});

ipcMain.handle('settings:uploadLogo', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: 'No file selected.' };
    }

    const tempPath = filePaths[0];
    const relativePath = await copyLogoAsset(tempPath, app);

    if (relativePath) {
      return { success: true, path: relativePath };
    } else {
      return { success: false, message: 'Failed to copy logo.' };
    }
  } catch (error) {
    console.error('Failed to upload logo:', error);
    return { success: false, message: `Error uploading logo: ${error.message}` };
  }
});

// --- Attendance IPC Handlers ---

// --- Backup IPC Handlers ---
const store = new Store();

ipcMain.handle('backup:run', async (_event, settings) => {
  try {
    if (!settings) {
      throw new Error('Backup settings were not provided.');
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Database Backup',
      defaultPath: `backup-${timestamp}.qdb`,
      filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Backup canceled by user.' };
    }

    return await backupManager.runBackup(settings, filePath);
  } catch (error) {
    console.error('Error in backup:run IPC wrapper:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('backup:getStatus', () => {
  try {
    const lastBackupStatus = store.get('last_backup_status');
    return { success: true, status: lastBackupStatus };
  } catch (error) {
    console.error('Error in backup:getStatus IPC wrapper:', error);
    return { success: false, message: 'Could not retrieve backup status.' };
  }
});

ipcMain.handle('db:import', async (_event, { password, userId }) => {
  // 1. Check if a password and user ID were provided.
  if (!password || !userId) {
    return { success: false, message: 'بيانات المصادقة غير كاملة.' };
  }

  try {
    // 2. Verify the provided password against the current user's hash in the DB.
    const currentUser = await db.getQuery('SELECT password FROM users WHERE id = ?', [userId]);
    if (!currentUser) {
      return { success: false, message: 'المستخدم الحالي غير موجود.' };
    }

    const isMatch = await bcrypt.compare(password, currentUser.password);
    if (!isMatch) {
      return { success: false, message: 'كلمة المرور الحالية التي أدخلتها غير صحيحة.' };
    }

    // 3. Prompt user to select a database file.
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Database to Import',
      properties: ['openFile'],
      filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }],
    });

    if (canceled || !filePaths || !filePaths[0]) {
      return { success: false, message: 'لم يتم تحديد أي ملف.' };
    }

    const importedDbPath = filePaths[0];

    // 4. Validate the backup file structure.
    const validationResult = await importManager.validateDatabaseFile(importedDbPath);
    if (!validationResult.isValid) {
      return { success: false, message: validationResult.message };
    }

    // 5. Replace the database.
    const replaceResult = await importManager.replaceDatabase(importedDbPath, password);

    // This part of the code will likely not be reached if the import is successful,
    // because the app will quit and relaunch. It's here to handle the case where
    // replaceDatabase returns a failure.
    return replaceResult;
  } catch (error) {
    console.error('Error during database import process:', error);
    return {
      success: false,
      message: `حدث خطأ فادح أثناء الاستيراد: ${error.message}`,
    };
  }
});

ipcMain.handle('attendance:getClassesForDay', async (_event, date) => {
  try {
    // Using date parameter to filter classes that are active on the specified date
    const sql = `
      SELECT DISTINCT c.id, c.name, c.class_type, c.teacher_id, t.name as teacher_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      WHERE c.status = 'active'
      AND (
        (c.start_date IS NULL OR c.start_date <= ?)
        AND (c.end_date IS NULL OR c.end_date >= ?)
      )
      ORDER BY c.name ASC
    `;
    return db.allQuery(sql, [date, date]);
  } catch (error) {
    console.error('Error fetching classes for day:', error);
    throw error;
  }
});

ipcMain.handle('attendance:getStudentsForClass', async (_event, classId) => {
  try {
    const sql = `
      SELECT s.id, s.name, s.date_of_birth
      FROM students s
      INNER JOIN class_students cs ON s.id = cs.student_id
      WHERE cs.class_id = ? AND s.status = 'active'
      ORDER BY s.name ASC
    `;
    return db.allQuery(sql, [classId]);
  } catch (error) {
    console.error('Error fetching students for class:', error);
    throw error;
  }
});

ipcMain.handle('attendance:getForDate', async (_event, { classId, date }) => {
  try {
    const sql = `
      SELECT student_id, status
      FROM attendance
      WHERE class_id = ? AND date = ?
    `;
    const records = await db.allQuery(sql, [classId, date]);
    const attendanceMap = {};
    records.forEach((record) => {
      attendanceMap[record.student_id] = record.status;
    });
    return attendanceMap;
  } catch (error) {
    console.error('Error fetching attendance for date:', error);
    throw error;
  }
});

ipcMain.handle('db:get-attendance-summary-for-class', async (event, classId) => {
  if (!classId) return [];
  // This SQL query is efficient. It groups by date, counts records for each date,
  // and orders them with the most recent date first.
  const query = `
    SELECT
      date,
      COUNT(*) as record_count
    FROM attendance
    WHERE class_id = ?
    GROUP BY date
    ORDER BY date DESC
  `;
  const rows = await db.allQuery(query, [classId]);
  return rows;
});

ipcMain.handle('attendance:save', async (_event, { classId, date, records }) => {
  try {
    await db.runQuery('BEGIN TRANSACTION');
    await db.runQuery('DELETE FROM attendance WHERE class_id = ? AND date = ?', [classId, date]);
    if (records && Object.keys(records).length > 0) {
      const placeholders = Object.keys(records)
        .map(() => '(?, ?, ?, ?)')
        .join(', ');
      const params = [];
      Object.entries(records).forEach(([studentId, status]) => {
        params.push(classId, parseInt(studentId), date, status);
      });
      const sql = `INSERT INTO attendance (class_id, student_id, date, status) VALUES ${placeholders}`;
      await db.runQuery(sql, params);
    }
    await db.runQuery('COMMIT');
    console.log('Attendance saved successfully');
    return { success: true };
  } catch (error) {
    await db.runQuery('ROLLBACK');
    console.error('Error saving attendance:', error);
    throw error;
  }
});
