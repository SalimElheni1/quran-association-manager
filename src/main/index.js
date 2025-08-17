const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const db = require('../db/db');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const { getProfileHandler, updateProfileHandler } = require('./authHandlers');

// Load environment variables
require('dotenv').config();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// --- Development-only auto-reloader ---
if (!app.isPackaged) {
  require('electron-reloader')(module);
}

// Security Best Practice: Ensure JWT_SECRET is set.
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
    minWidth: 800, // Minimum width to ensure usability
    minHeight: 600, // Minimum height to ensure usability
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Keep false for security
      contextIsolation: true, // Keep true for security
    },
  });

  // In development, load from the Vite dev server.
  // In production, load the built HTML file.
  // Use `app.isPackaged` to determine whether to load from Vite or a local file.
  // This is the recommended approach for distinguishing between dev and prod.
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools(); // Open DevTools automatically
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
};

app.whenReady().then(async () => {
  try {
    // Initialize database first
    console.log('Starting database initialization...');
    await db.initializeDatabase();

    // Then create the window
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
  // Quit when all windows are closed, except on macOS.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Handlers ---
// This is where we'll handle calls from the renderer process.

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// --- Secure, specific IPC Handlers ---

ipcMain.handle('students:get', async (_event, filters) => {
  // Base query selects only the columns needed for the list view, not SELECT *
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

  // Age filtering is done by calculating birth date ranges
  const today = new Date();
  if (filters?.minAgeFilter) {
    const minAgeBirthYear = today.getFullYear() - parseInt(filters.minAgeFilter, 10);
    // This is a simplified calculation. For more precision, we'd use full dates.
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

ipcMain.handle('students:getById', async (_event, id) => {
  // This query fetches all columns for a single student, which is what our modals need.
  return db.getQuery('SELECT * FROM students WHERE id = ?', [id]);
});

// --- Validation Schemas ---

const studentValidationSchema = Joi.object({
  // Required fields
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'الاسم يجب أن يكون نصاً',
    'string.empty': 'الاسم مطلوب',
    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
    'any.required': 'الاسم مطلوب',
  }),
  status: Joi.string().valid('active', 'inactive', 'graduated', 'on_leave').required(),

  // Optional fields with validation
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

  // Allow other fields to pass through without specific validation for now
}).unknown(true); // .unknown(true) allows fields not defined in the schema to pass through

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
  schedule: Joi.string().allow(null, ''), // It's a JSON string
  gender: Joi.string().valid('women', 'men', 'kids', 'all').default('all'),
  class_type: Joi.string().allow(null, ''),
  start_date: Joi.date().iso().allow(null, ''),
  end_date: Joi.date().iso().allow(null, ''),
}).unknown(true);

const teacherValidationSchema = Joi.object({
  // Required fields
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

  // Optional fields
  contact_info: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
}).unknown(true);

const userValidationSchema = Joi.object({
  // Required fields
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
  first_name: Joi.string().min(2).max(50).required(),
  last_name: Joi.string().min(2).max(50).required(),
  employment_type: Joi.string().valid('volunteer', 'contract').required(),
  role: Joi.string().valid('Manager', 'FinanceManager', 'Admin', 'SessionSupervisor').required(),

  // Optional fields
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

  // Conditional validation
  start_date: Joi.when('employment_type', {
    is: 'contract',
    then: Joi.date().iso().required(),
    otherwise: Joi.date().iso().allow(null, ''),
  }),
}).unknown(true);

const userUpdateValidationSchema = userValidationSchema.keys({
  // For updates, password is optional. If provided, it must be at least 8 chars.
  password: Joi.string().min(8).allow(null, ''),
  // Status is required during an update.
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
    // Validate and strip unknown properties not covered by .unknown(true)
    const validatedData = await studentValidationSchema.validateAsync(studentData, {
      abortEarly: false,
      stripUnknown: false, // Keep fields not in schema but allowed by .unknown(true)
    });

    const fieldsToInsert = studentFields.filter((field) => validatedData[field] !== undefined);

    if (fieldsToInsert.length === 0) {
      throw new Error('No valid fields to insert.');
    }

    const placeholders = fieldsToInsert.map(() => '?').join(', ');
    const params = fieldsToInsert.map((field) => validatedData[field] ?? null);

    const sql = `INSERT INTO students (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
    return db.runQuery(sql, params);
  } catch (error) {
    if (error.isJoi) {
      const messages = error.details.map((d) => d.message).join('; ');
      throw new Error(`بيانات غير صالحة: ${messages}`);
    }
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
    if (error.isJoi) {
      const messages = error.details.map((d) => d.message).join('; ');
      throw new Error(`بيانات غير صالحة: ${messages}`);
    }
    console.error('Error in students:update handler:', error);
    throw new Error('حدث خطأ غير متوقع في الخادم.');
  }
});

ipcMain.handle('students:delete', async (_event, id) => {
  // Basic validation
  if (!id || typeof id !== 'number') {
    throw new Error('A valid student ID is required for deletion.');
  }
  const sql = 'DELETE FROM students WHERE id = ?';
  return db.runQuery(sql, [id]);
});

// --- Teachers IPC Handlers ---

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

ipcMain.handle('teachers:delete', async (_event, id) => {
  if (!id || typeof id !== 'number')
    throw new Error('A valid teacher ID is required for deletion.');
  const sql = 'DELETE FROM teachers WHERE id = ?';
  return db.runQuery(sql, [id]);
});

// --- Teachers IPC Handlers ---

ipcMain.handle('teachers:get', async (_event, filters) => {
  // Base query selects only the columns needed for the list view
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

ipcMain.handle('teachers:getById', async (_event, id) => {
  // This query fetches all columns for a single teacher.
  return db.getQuery('SELECT * FROM teachers WHERE id = ?', [id]);
});

// --- Classes IPC Handlers ---

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

ipcMain.handle('classes:delete', async (_event, id) => {
  if (!id || typeof id !== 'number') throw new Error('A valid class ID is required for deletion.');
  const sql = 'DELETE FROM classes WHERE id = ?';
  return db.runQuery(sql, [id]);
});

ipcMain.handle('classes:get', async (_event, filters) => {
  // This query joins with the teachers table to get the teacher's name.
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

ipcMain.handle('classes:getById', async (_event, id) => {
  const sql = `
    SELECT c.*, t.name as teacher_name
    FROM classes c
    LEFT JOIN teachers t ON c.teacher_id = t.id
    WHERE c.id = ?
  `;
  // This query fetches all columns for a single class, which our modal will need.
  return db.getQuery(sql, [id]);
});

ipcMain.handle('classes:getEnrollmentData', async (_event, { classId, classGender }) => {
  try {
    // Get enrolled students for this class
    const enrolledSql = `
      SELECT s.id, s.name 
      FROM students s
      INNER JOIN class_students cs ON s.id = cs.student_id
      WHERE cs.class_id = ? AND s.status = 'active'
      ORDER BY s.name ASC
    `;
    const enrolledStudents = await db.allQuery(enrolledSql, [classId]);

    // Get not enrolled students (students not in this class)
    let notEnrolledSql = `
      SELECT s.id, s.name 
      FROM students s 
      WHERE s.status = 'active' 
      AND s.id NOT IN (
        SELECT student_id FROM class_students WHERE class_id = ?
      )
    `;
    const notEnrolledParams = [classId];

    // Add gender filtering based on the class's gender property
    if (classGender === 'kids') {
      notEnrolledSql += ` AND (strftime('%Y', 'now') - strftime('%Y', s.date_of_birth) < 13)`;
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

ipcMain.handle('users:getById', async (_event, id) => {
  // This query fetches all columns for a single user
  return db.getQuery('SELECT * FROM users WHERE id = ?', [id]);
});

ipcMain.handle('users:add', async (_event, userData) => {
  try {
    const validatedData = await userValidationSchema.validateAsync(userData, {
      abortEarly: false,
      stripUnknown: false,
    });

    // Hash the password before storing
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

    // Hash the password if it's being updated
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

ipcMain.handle('users:delete', async (_event, id) => {
  if (!id || typeof id !== 'number') throw new Error('A valid user ID is required for deletion.');
  const sql = 'DELETE FROM users WHERE id = ?';
  return db.runQuery(sql, [id]);
});

ipcMain.handle('classes:updateEnrollments', async (_event, { classId, studentIds }) => {
  try {
    // Start a transaction to ensure atomicity
    await db.runQuery('BEGIN TRANSACTION');

    // First, remove all existing enrollments for this class
    await db.runQuery('DELETE FROM class_students WHERE class_id = ?', [classId]);

    // Then, add the new enrollments
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
  try {
    const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        {
          expiresIn: '8h', // Extended session time
        },
      );
      return {
        success: true,
        token,
        user: { id: user.id, username: user.username, role: user.role },
      };
    } else {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }
  } catch (error) {
    console.error('Error in auth:login handler:', error);
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

// --- Attendance IPC Handlers ---

ipcMain.handle('attendance:getClassesForDay', async (_event, date) => {
  try {
    // Get active classes that have sessions on the given date
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
    // Get all active students enrolled in the specified class
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
    // Get attendance records for a specific class and date
    const sql = `
      SELECT student_id, status
      FROM attendance
      WHERE class_id = ? AND date = ?
    `;
    const records = await db.allQuery(sql, [classId, date]);

    // Convert array of records to object for easier access
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
    // Start a transaction to ensure atomicity
    await db.runQuery('BEGIN TRANSACTION');

    // First, delete existing attendance records for this class and date
    await db.runQuery('DELETE FROM attendance WHERE class_id = ? AND date = ?', [classId, date]);

    // Then, insert the new attendance records
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
