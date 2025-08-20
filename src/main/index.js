const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const db = require('../db/db');
const exportManager = require('./exportManager');
const { getSetting } = require('./settingsManager');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const jwt = require('jsonwebtoken');

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
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
};

app.whenReady().then(async () => {
  try {
    console.log('Starting database initialization...');
    await db.initializeDatabase();
    Menu.setApplicationMenu(null);
    createWindow();
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

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('settings:get', (_event, key) => {
  return getSetting(key);
});

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
      notEnrolledSql += ` AND (strftime('%Y', 'now') - strftime('%Y', s.date_of_birth) < ${adultAge})`;
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

    return { success: true, message: `Export saved to ${filePath}` };
  } catch (error) {
    console.error(`Error during export (${exportType}, ${format}):`, error);
    return { success: false, message: `Export failed: ${error.message}` };
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

ipcMain.handle('auth:login', async (_event, { username, password }) => {
  try {
    const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '1h',
      });
      return {
        success: true,
        token,
        user: { id: user.id, username: user.username, role: user.role },
      };
    } else {
      return { success: false, message: 'Invalid credentials' };
    }
  } catch (error) {
    console.error('Error in auth:login handler:', error);
    return { success: false, message: 'An unexpected error occurred' };
  }
});

ipcMain.handle('attendance:getClassesForDay', async (_event, _date) => {
  try {
    const sql = `
      SELECT DISTINCT c.id, c.name, c.class_type, c.teacher_id, t.name as teacher_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      WHERE c.status = 'active'
      ORDER BY c.name ASC
    `;
    return db.allQuery(sql, []);
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
