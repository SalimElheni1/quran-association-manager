const fs = require('fs').promises;
const fsSync = require('fs');
const PizZip = require('pizzip');
const { app } = require('electron');
const Store = require('electron-store');
const ExcelJS = require('exceljs');
const { log, error: logError, warn: logWarn } = require('./logger');
const {
  getDatabasePath,
  isDbOpen,
  closeDatabase,
  initializeDatabase,
  getDb,
  dbExec,
  runQuery,
  getQuery,
} = require('../db/db');
const bcrypt = require('bcryptjs');
const { generateMatricule } = require('./matriculeService');
const { setDbSalt } = require('./keyManager');

const mainStore = new Store();

async function validateDatabaseFile(filePath) {
  try {
    const zipFileContent = await fs.readFile(filePath);
    const zip = new PizZip(zipFileContent);
    const sqlFile = zip.file('backup.sql');
    const configFile = zip.file('salt.json'); // Legacy: 'config.json'
    if (!sqlFile || !configFile) {
      return { isValid: false, message: 'ملف النسخ الاحتياطي غير صالح أو تالف.' };
    }
    return { isValid: true, message: 'تم التحقق من ملف النسخ الاحتياطي بنجاح.' };
  } catch (error) {
    logError('Error during backup validation:', error);
    return { isValid: false, message: `خطأ في قراءة ملف النسخ الاحتياطي: ${error.message}` };
  }
}

async function unlinkWithRetry(filePath, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath);
      log(`Successfully unlinked ${filePath}`);
      return;
    } catch (error) {
      if (error.code === 'EBUSY' && i < retries - 1) {
        logWarn(
          `EBUSY error, retrying unlink on ${filePath} in ${delay}ms... (Attempt ${i + 1}/${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logError(`Failed to unlink ${filePath} after ${i + 1} attempts.`);
        throw error;
      }
    }
  }
}

async function replaceDatabase(importedDbPath, password) {
  const currentDbPath = getDatabasePath();
  try {
    if (isDbOpen()) {
      await closeDatabase();
    }
    const zipFileContent = await fs.readFile(importedDbPath);
    const zip = new PizZip(zipFileContent);
    const sqlFile = zip.file('backup.sql');
    let configFile = zip.file('salt.json');
    // For backward compatibility, check for the old config file name
    if (!configFile) {
      configFile = zip.file('config.json');
    }

    if (!sqlFile || !configFile) {
      throw new Error('Could not find required files (backup.sql, salt.json) in backup package.');
    }
    const sqlScript = sqlFile.asText();
    const configBuffer = configFile.asNodeBuffer();
    const configJson = JSON.parse(configBuffer.toString());
    const newSalt = configJson['db-salt'];
    if (!newSalt) {
      throw new Error('Backup configuration is missing the required salt.');
    }
    setDbSalt(newSalt);
    log('Salt configuration updated from backup.');

    if (fsSync.existsSync(currentDbPath)) {
      log(`Deleting old database file at ${currentDbPath}...`);
      await unlinkWithRetry(currentDbPath);
    }
    log('Initializing new database with imported salt...');
    await initializeDatabase(password);
    log('New database initialized successfully.');
    log('Executing SQL script to import data...');
    await dbExec(getDb(), sqlScript);
    log('Data import completed successfully.');
    mainStore.set('force-relogin-after-restart', true);
    log('Database import successful. The app will now restart.');
    app.relaunch();
    app.quit();
    return {
      success: true,
      message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.',
    };
  } catch (error) {
    logError('Failed to replace database from package:', error);
    return { success: false, message: `فشل استيراد قاعدة البيانات: ${error.message}` };
  }
}

const REQUIRED_COLUMNS = {
  الطلاب: ['الاسم واللقب'],
  المعلمون: ['الاسم واللقب'],
  المستخدمون: ['اسم المستخدم', 'الاسم الأول', 'اللقب', 'الدور', 'نوع التوظيف'],
  الفصول: ['اسم الفصل'], // Teacher matricule is optional now
  'الرسوم الدراسية': ['الرقم التعريفي للطالب', 'المبلغ', 'تاريخ الدفع (YYYY-MM-DD)'],
  الرواتب: ['الرقم التعريفي للمعلم', 'المبلغ', 'تاريخ الدفع (YYYY-MM-DD)'],
  التبرعات: ['اسم المتبرع', 'نوع التبرع (Cash/In-kind)', 'تاريخ التبرع (YYYY-MM-DD)'],
  المصاريف: ['الفئة', 'المبلغ', 'تاريخ الصرف (YYYY-MM-DD)'],
  المجموعات: ['اسم المجموعة', 'الفئة'],
  المخزون: ['الرقم التعريفي', 'اسم العنصر', 'الفئة', 'الكمية'],
  الحضور: [
    'الرقم التعريفي للطالب',
    'اسم الفصل',
    'التاريخ (YYYY-MM-DD)',
    'الحالة (present/absent/late/excused)',
  ],
};

const getColumnIndex = (headerRow, headerText) => {
  let index = -1;
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value === headerText) {
      index = colNumber;
    }
  });
  return index;
};

const isValidDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  const timestamp = date.getTime();
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;
  return date.toISOString().startsWith(dateString);
};

const GENDER_MAP_AR_TO_EN = {
  'نساء': 'women',
  'رجال': 'men',
  'أطفال': 'kids',
  'الكل': 'all',
  'ذكر': 'Male',
  'أنثى': 'Female',
};

const DONATION_TYPE_MAP_AR_TO_EN = {
  'نقدي': 'Cash',
  'عيني': 'In-kind',
};

const ATTENDANCE_STATUS_MAP_AR_TO_EN = {
  'حاضر': 'present',
  'غائب': 'absent',
  'متأخر': 'late',
  'معذور': 'excused',
};

const GROUP_CATEGORY_MAP_AR_TO_EN = {
  'أطفال': 'Kids',
  'نساء': 'Women',
  'رجال': 'Men',
};

async function importExcelData(filePath, options = {}) {
  const { sheets: sheetsToImport = [] } = options;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const results = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };

  const sheetProcessors = {
    الطلاب: processStudentRow,
    المعلمون: processTeacherRow,
    المستخدمون: processUserRow,
    الفصول: processClassRow,
    المجموعات: processGroupRow,
    المخزون: processInventoryItemRow,
    'الرسوم الدراسية': processPaymentRow,
    الرواتب: processSalaryRow,
    التبرعات: processDonationRow,
    المصاريف: processExpenseRow,
    الحضور: processAttendanceRow,
  };

  const sheetsInFile = workbook.worksheets.map((ws) => ws.name);
  const sheetsToProcess =
    sheetsToImport.length > 0
      ? sheetsToImport.filter((s) => sheetsInFile.includes(s))
      : sheetsInFile;

  if (sheetsToProcess.length === 0) {
    results.errors.push('لم يتم العثور على أي من الأوراق المحددة في ملف Excel.');
    results.errorCount = 1;
    return results;
  }

  for (const sheetName of sheetsToProcess) {
    log(`Processing sheet: ${sheetName}`);
    const processor = sheetProcessors[sheetName];
    if (!processor) {
      logWarn(`No processor found for sheet: ${sheetName}. Skipping.`);
      continue;
    }

    const worksheet = workbook.getWorksheet(sheetName);
    const headerRow = worksheet.getRow(2);
    if (!headerRow.hasValues) continue;

    const missingColumns = (REQUIRED_COLUMNS[sheetName] || []).filter(
      (colName) => getColumnIndex(headerRow, colName) === -1,
    );
    if (missingColumns.length > 0) {
      results.errors.push(
        `ورقة "${sheetName}" ينقصها الأعمدة المطلوبة: ${missingColumns.join(', ')}`,
      );
      results.errorCount += worksheet.rowCount - 2; // Approximate error count
      continue; // Skip this sheet
    }

    const db = getDb();
    const sheetResults = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };
    let sheetHasErrors = false;

    try {
      await dbExec(db, 'BEGIN TRANSACTION');

      for (let i = 3; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        if (!row.hasValues) continue;
        try {
          log(`Processing row ${i} in sheet ${sheetName}`);
          const result = await processor(row, headerRow);
          if (result.success) {
            sheetResults.successCount++;
            if (result.newUser) sheetResults.newUsers.push(result.newUser);
          } else {
            sheetResults.errorCount++;
            sheetResults.errors.push(`[${sheetName}] Row ${i}: ${result.message}`);
            logError(`Error processing row ${i} in sheet ${sheetName}: ${result.message}`);
            sheetHasErrors = true;
          }
        } catch (e) {
          sheetResults.errorCount++;
          sheetResults.errors.push(
            `[${sheetName}] Row ${i}: An unexpected error occurred - ${e.message}`,
          );
          logError(`Fatal error processing row ${i} in sheet ${sheetName}:`, e);
          sheetHasErrors = true;
        }
      }

      if (sheetHasErrors) {
        await dbExec(db, 'ROLLBACK');
        results.errorCount += sheetResults.errorCount + sheetResults.successCount;
        results.errors.push(
          ...sheetResults.errors,
          `[${sheetName}] All changes for this sheet were rolled back due to errors.`,
        );
        logWarn(`Transaction for sheet "${sheetName}" was rolled back due to errors.`);
      } else {
        await dbExec(db, 'COMMIT');
        results.successCount += sheetResults.successCount;
        results.errorCount += sheetResults.errorCount;
        results.errors.push(...sheetResults.errors);
        results.newUsers.push(...sheetResults.newUsers);
      }
    } catch (e) {
      logError(`Transaction failed for sheet "${sheetName}":`, e);
      // Attempt to rollback, though it might fail if the connection is lost
      try {
        await dbExec(db, 'ROLLBACK');
      } catch (rbError) {
        logError(`Failed to rollback transaction for sheet "${sheetName}":`, rbError);
      }
      results.errors.push(`[${sheetName}] A fatal transaction error occurred: ${e.message}`);
      results.errorCount += worksheet.rowCount - 2; // Approximate
    }
  }

  return results;
}

async function processStudentRow(row, headerRow) {
  log('--- Processing Student Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'الاسم واللقب')).value,
    date_of_birth: row.getCell(getColumnIndex(headerRow, 'تاريخ الميلاد')).value,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس (ذكر/أنثى)')).value,
    address: row.getCell(getColumnIndex(headerRow, 'العنوان')).value,
    contact_info: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
    email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value,
    national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
    parent_name: row.getCell(getColumnIndex(headerRow, 'اسم ولي الأمر'))?.value,
    parent_contact: row.getCell(getColumnIndex(headerRow, 'هاتف ولي الأمر'))?.value,
  };
  log('Raw student data from row:', data);

  if (!data.name && !matricule) return { success: false, message: 'اسم الطالب مطلوب.' };

  if (data.date_of_birth && !isValidDate(data.date_of_birth)) {
    return {
      success: false,
      message: 'تنسيق تاريخ الميلاد غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    log(`Attempting to update student with matricule: ${matricule}`);
    const existingStudent = await getQuery('SELECT id FROM students WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingStudent) {
      logError(`Student with matricule ${matricule} not found for update.`);
      return { success: false, message: `الطالب بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      log(`No fields to update for student ${matricule}.`);
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE students SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated student ${matricule}`);
    return { success: true };
  }

  log(`No matricule provided. Checking for duplicates for student: ${data.name}`);
  if (data.national_id) {
    log(`Checking for duplicate student by national_id: ${data.national_id}`);
    const existingStudent = await getQuery('SELECT id FROM students WHERE national_id = ?', [
      data.national_id,
    ]);
    if (existingStudent) {
      logWarn(`Duplicate student found by national_id: ${data.national_id}`);
      return {
        success: false,
        message: `طالب بنفس رقم الهوية موجود بالفعل. لتحديثه، يرجى استخدام رقمه التعريفي.`,
      };
    }
  }

  if (data.name && data.parent_contact) {
    log(`Checking for duplicate student by name+parent_contact: ${data.name}, ${data.parent_contact}`);
    const existingStudent = await getQuery(
      'SELECT id FROM students WHERE name = ? AND parent_contact = ?',
      [data.name, data.parent_contact],
    );
    if (existingStudent) {
      logWarn(`Duplicate student found by name+parent_contact: ${data.name}`);
      return {
        success: false,
        message: `طالب بنفس الاسم وهاتف ولي الأمر موجود بالفعل. لتحديثه، يرجى استخدام رقمه التعريفي.`,
      };
    }
  }

  if (data.name && data.date_of_birth && data.parent_name) {
    log(`Checking for duplicate student by name+dob+parent_name: ${data.name}, ${data.date_of_birth}, ${data.parent_name}`);
    const existingStudent = await getQuery(
      'SELECT id FROM students WHERE name = ? AND date_of_birth = ? AND parent_name = ?',
      [data.name, data.date_of_birth, data.parent_name],
    );
    if (existingStudent) {
      logWarn(`Duplicate student found by name+dob+parent_name: ${data.name}`);
      return {
        success: false,
        message: `طالب بنفس الاسم وتاريخ الميلاد واسم ولي الأمر موجود بالفعل. لتحديثه، يرجى استخدام رقمه التعريفي.`,
      };
    }
  }

  log(`No duplicates found. Creating new student: ${data.name}`);
  const newMatricule = await generateMatricule('student');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO students (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new student with matricule ${newMatricule}`);
  return { success: true };
}

async function processTeacherRow(row, headerRow) {
  log('--- Processing Teacher Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'الاسم واللقب')).value,
    national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
    contact_info: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
    email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
  };
  log('Raw teacher data from row:', data);

  if (!data.name) return { success: false, message: 'اسم المعلم مطلوب.' };

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    log(`Attempting to update teacher with matricule: ${matricule}`);
    const existingTeacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingTeacher) {
      logError(`Teacher with matricule ${matricule} not found for update.`);
      return { success: false, message: `المعلم بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      log(`No fields to update for teacher ${matricule}.`);
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE teachers SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated teacher ${matricule}`);
    return { success: true };
  }
  log(`No matricule provided. Creating new teacher: ${data.name}`);
  const newMatricule = await generateMatricule('teacher');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO teachers (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new teacher with matricule ${newMatricule}`);
  return { success: true };
}

async function processUserRow(row, headerRow) {
  log('--- Processing User Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  const data = {
    username: row.getCell(getColumnIndex(headerRow, 'اسم المستخدم')).value,
    first_name: row.getCell(getColumnIndex(headerRow, 'الاسم الأول')).value,
    last_name: row.getCell(getColumnIndex(headerRow, 'اللقب')).value,
    role: row.getCell(getColumnIndex(headerRow, 'الدور')).value,
    employment_type: row.getCell(getColumnIndex(headerRow, 'نوع التوظيف')).value,
  };
  log('Raw user data from row:', { ...data, password: '***' });

  if (
    !data.username ||
    !data.first_name ||
    !data.last_name ||
    !data.role ||
    !data.employment_type
  ) {
    return {
      success: false,
      message: 'اسم المستخدم، الاسم الأول، اللقب، الدور، ونوع التوظيف هي حقول مطلوبة.',
    };
  }

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    log(`Attempting to update user with matricule: ${matricule}`);
    const existingUser = await getQuery('SELECT id FROM users WHERE matricule = ?', [matricule]);
    if (!existingUser) {
      logError(`User with matricule ${matricule} not found for update.`);
      return { success: false, message: `المستخدم بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      log(`No fields to update for user ${matricule}.`);
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE users SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated user ${matricule}`);
    return { success: true };
  }
  log(`No matricule provided. Checking for duplicate username: ${data.username}`);
  const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', [data.username]);
  if (existingUser) {
    logWarn(`Duplicate user found by username: ${data.username}`);
    return { success: false, message: `المستخدم "${data.username}" موجود بالفعل.` };
  }

  log(`No duplicate found. Creating new user: ${data.username}`);
  const password = Math.random().toString(36).slice(-8);
  const newMatricule = await generateMatricule('user');
  const allData = {
    ...data,
    matricule: newMatricule,
    password: bcrypt.hashSync(password, 10),
  };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO users (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new user with matricule ${newMatricule}`);
  return { success: true, newUser: { username: data.username, password } };
}

async function processClassRow(row, headerRow) {
  log('--- Processing Class Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const teacherMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للمعلم'))?.value;

  let teacherId = null;
  if (teacherMatricule) {
    const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [
      teacherMatricule,
    ]);
    if (!teacher) {
      return {
        success: false,
        message: `لم يتم العثور على معلم بالرقم التعريفي "${teacherMatricule}".`,
      };
    }
    teacherId = teacher.id;
  }

  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'اسم الفصل')).value,
    class_type: row.getCell(getColumnIndex(headerRow, 'نوع الفصل'))?.value,
    schedule: row.getCell(getColumnIndex(headerRow, 'الجدول الزمني (JSON)'))?.value,
    start_date: row.getCell(getColumnIndex(headerRow, 'تاريخ البدء'))?.value,
    end_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الانتهاء'))?.value,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة'))?.value,
    capacity: row.getCell(getColumnIndex(headerRow, 'السعة'))?.value,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس (ذكر/أنثى)')).value,
  };

  if (data.gender) {
    const mappedGender = GENDER_MAP_AR_TO_EN[data.gender];
    if (!mappedGender) {
      return { success: false, message: `قيمة الجنس "${data.gender}" غير صالحة.` };
    }
    data.gender = mappedGender;
  }

  if (data.start_date && !isValidDate(data.start_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ البدء غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  if (data.end_date && !isValidDate(data.end_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ الانتهاء غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  if (teacherId) {
    data.teacher_id = teacherId;
  }

  if (!data.name && !matricule) return { success: false, message: 'اسم الفصل مطلوب.' };

  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  const updateData = {};
  fields.forEach((k) => {
    // Allow null to clear fields
    updateData[k] = data[k] === undefined ? null : data[k];
  });

  if (matricule) {
    log(`Attempting to update class with matricule: ${matricule}`);
    const existingClass = await getQuery('SELECT id FROM classes WHERE matricule = ?', [matricule]);
    if (!existingClass) {
      logError(`Class with matricule ${matricule} not found for update.`);
      return { success: false, message: `الفصل بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      log(`No fields to update for class ${matricule}.`);
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE classes SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated class ${matricule}`);
    return { success: true };
  }

  log(`No matricule provided. Creating new class with name: ${data.name}`);
  const newMatricule = await generateMatricule('class');
  const allData = { ...updateData, matricule: newMatricule };

  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO classes (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new class with matricule ${newMatricule}`);
  return { success: true };
}

async function processPaymentRow(row, headerRow) {
  log('--- Processing Payment Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const studentMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للطالب'))?.value;
  log(`Raw payment data: matricule=${matricule}, student_matricule=${studentMatricule}`);

  if (!studentMatricule && !matricule)
    return { success: false, message: 'الرقم التعريفي للطالب مطلوب.' };

  let studentId = null;
  if (studentMatricule) {
    const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [
      studentMatricule,
    ]);
    if (!student) {
      return {
        success: false,
        message: `لم يتم العثور على طالب بالرقم التعريفي "${studentMatricule}".`,
      };
    }
    studentId = student.id;
  }

  const data = {
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    payment_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الدفع (YYYY-MM-DD)')).value,
    payment_method: row.getCell(getColumnIndex(headerRow, 'طريقة الدفع')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  log('Parsed payment data:', data);

  if (data.payment_date && !isValidDate(data.payment_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ الدفع غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  if (studentId) {
    data.student_id = studentId;
  }

  if ((!data.amount || !data.payment_date) && !matricule)
    return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };

  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  const updateData = {};
  fields.forEach((k) => {
    updateData[k] = data[k] === undefined ? null : data[k];
  });

  if (matricule) {
    log(`Attempting to update payment with matricule: ${matricule}`);
    const existingPayment = await getQuery('SELECT id FROM payments WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingPayment) {
      return { success: false, message: `الدفعة بالرقم التعريفي "${matricule}" غير موجودة.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE payments SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated payment ${matricule}`);
    return { success: true };
  }

  log('Creating new payment.');
  const newMatricule = await generateMatricule('payment');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO payments (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new payment with matricule ${newMatricule}`);
  return { success: true };
}

async function processSalaryRow(row, headerRow) {
  log('--- Processing Salary Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const teacherMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للمعلم'))?.value;
  log(`Raw salary data: matricule=${matricule}, teacher_matricule=${teacherMatricule}`);

  if (!teacherMatricule && !matricule)
    return { success: false, message: 'الرقم التعريفي للمعلم مطلوب.' };

  let teacherId = null;
  if (teacherMatricule) {
    const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [
      teacherMatricule,
    ]);
    if (!teacher) {
      return {
        success: false,
        message: `لم يتم العثور على معلم بالرقم التعريفي "${teacherMatricule}".`,
      };
    }
    teacherId = teacher.id;
  }

  const data = {
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    payment_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الدفع (YYYY-MM-DD)')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  log('Parsed salary data:', data);

  if (data.payment_date && !isValidDate(data.payment_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ الدفع غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  if (teacherId) {
    data.teacher_id = teacherId;
  }

  if ((!data.amount || !data.payment_date) && !matricule)
    return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };

  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  const updateData = {};
  fields.forEach((k) => {
    updateData[k] = data[k] === undefined ? null : data[k];
  });

  if (matricule) {
    log(`Attempting to update salary with matricule: ${matricule}`);
    const existingSalary = await getQuery('SELECT id FROM salaries WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingSalary) {
      return { success: false, message: `الراتب بالرقم التعريفي "${matricule}" غير موجود.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE salaries SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated salary ${matricule}`);
    return { success: true };
  }

  log('Creating new salary.');
  const newMatricule = await generateMatricule('salary');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO salaries (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new salary with matricule ${newMatricule}`);
  return { success: true };
}

async function processDonationRow(row, headerRow) {
  log('--- Processing Donation Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const data = {
    donor_name: row.getCell(getColumnIndex(headerRow, 'اسم المتبرع')).value,
    donation_type: row.getCell(getColumnIndex(headerRow, 'نوع التبرع (Cash/In-kind)')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ (للتبرع النقدي)')).value,
    description: row.getCell(getColumnIndex(headerRow, 'وصف (للتبرع العيني)')).value,
    donation_date: row.getCell(getColumnIndex(headerRow, 'تاريخ التبرع (YYYY-MM-DD)')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  log('Raw donation data:', data);

  if (data.donation_date && !isValidDate(data.donation_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ التبرع غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  if (data.donation_type) {
    const mappedType = DONATION_TYPE_MAP_AR_TO_EN[data.donation_type];
    if (!mappedType) {
      return {
        success: false,
        message: `نوع التبرع "${data.donation_type}" غير صالح. يجب أن يكون "نقدي" أو "عيني".`,
      };
    }
    data.donation_type = mappedType;
  }

  const requiredFields = ['donor_name', 'donation_type', 'donation_date'];
  if (requiredFields.some((f) => !data[f]) && !matricule)
    return { success: false, message: 'اسم المتبرع، نوع التبرع، وتاريخ التبرع هي حقول مطلوبة.' };

  if (data.donation_type === 'Cash' && !data.amount && !matricule)
    return { success: false, message: 'المبلغ مطلوب للتبرعات النقدية.' };

  if (data.donation_type === 'In-kind' && !data.description && !matricule)
    return { success: false, message: 'الوصف مطلوب للتبرعات العينية.' };

  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  const updateData = {};
  fields.forEach((k) => {
    updateData[k] = data[k] === undefined ? null : data[k];
  });

  if (matricule) {
    log(`Attempting to update donation with matricule: ${matricule}`);
    const existingDonation = await getQuery('SELECT id FROM donations WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingDonation) {
      return { success: false, message: `التبرع بالرقم التعريفي "${matricule}" غير موجود.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE donations SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated donation ${matricule}`);
    return { success: true };
  }

  log('Creating new donation.');
  const newMatricule = await generateMatricule('donation');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO donations (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new donation with matricule ${newMatricule}`);
  return { success: true };
}

async function processExpenseRow(row, headerRow) {
  log('--- Processing Expense Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const data = {
    category: row.getCell(getColumnIndex(headerRow, 'الفئة')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    expense_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الصرف (YYYY-MM-DD)')).value,
    responsible_person: row.getCell(getColumnIndex(headerRow, 'المسؤول')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
  };
  log('Raw expense data:', data);

  if (data.expense_date && !isValidDate(data.expense_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ الصرف غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  if ((!data.category || !data.amount || !data.expense_date) && !matricule)
    return { success: false, message: 'الفئة، المبلغ، وتاريخ الصرف هي حقول مطلوبة.' };

  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  const updateData = {};
  fields.forEach((k) => {
    updateData[k] = data[k] === undefined ? null : data[k];
  });

  if (matricule) {
    log(`Attempting to update expense with matricule: ${matricule}`);
    const existingExpense = await getQuery('SELECT id FROM expenses WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingExpense) {
      return { success: false, message: `المصروف بالرقم التعريفي "${matricule}" غير موجود.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE expenses SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated expense ${matricule}`);
    return { success: true };
  }

  log('Creating new expense.');
  const newMatricule = await generateMatricule('expense');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO expenses (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new expense with matricule ${newMatricule}`);
  return { success: true };
}

async function processAttendanceRow(row, headerRow) {
  log('--- Processing Attendance Row ---');
  const studentMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للطالب'))?.value;
  const className = row.getCell(getColumnIndex(headerRow, 'اسم الفصل')).value;
  const date = row.getCell(getColumnIndex(headerRow, 'التاريخ (YYYY-MM-DD)')).value;
  const status = row.getCell(getColumnIndex(headerRow, 'الحالة (حاضر/غائب/متأخر/معذور)'))?.value;
  log(`Raw attendance data: student=${studentMatricule}, class=${className}, date=${date}, status=${status}`);

  if (!studentMatricule || !className || !date || !status) {
    return { success: false, message: 'الرقم التعريفي للطالب، اسم الفصل، التاريخ، والحالة مطلوبون.' };
  }

  if (!isValidDate(date)) {
    return { success: false, message: 'تنسيق التاريخ غير صالح. الرجاء استخدام YYYY-MM-DD.' };
  }

  const mappedStatus = ATTENDANCE_STATUS_MAP_AR_TO_EN[status];
  if (!mappedStatus) {
    return {
      success: false,
      message: `حالة الحضور "${status}" غير صالحة.`,
    };
  }

  const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [studentMatricule]);
  if (!student) {
    return {
      success: false,
      message: `لم يتم العثور على طالب بالرقم التعريفي "${studentMatricule}".`,
    };
  }
  const classData = await getQuery('SELECT id FROM classes WHERE name = ?', [className]);
  if (!classData) return { success: false, message: `لم يتم العثور على فصل باسم "${className}".` };

  const data = {
    student_id: student.id,
    class_id: classData.id,
    date,
    status: mappedStatus,
  };

  const existingAttendance = await getQuery(
    'SELECT status FROM attendance WHERE student_id = ? AND class_id = ? AND date = ?',
    [data.student_id, data.class_id, data.date],
  );

  if (existingAttendance) {
    log(`Updating attendance for student ${data.student_id} in class ${data.class_id} on ${data.date}`);
    if (existingAttendance.status === data.status) {
      log('Attendance status unchanged.');
      return { success: true, message: 'الحالة لم تتغير.' }; // No change needed
    }
    await runQuery('UPDATE attendance SET status = ? WHERE student_id = ? AND class_id = ? AND date = ?', [
      data.status,
      data.student_id,
      data.class_id,
      data.date,
    ]);
    log('Successfully updated attendance.');
    return { success: true };
  }
  log(`Creating new attendance record for student ${data.student_id} in class ${data.class_id} on ${data.date}`);
  const fields = Object.keys(data);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO attendance (${fields.join(', ')}) VALUES (${placeholders})`, values);
  log('Successfully created new attendance record.');
  return { success: true };
}

async function processGroupRow(row, headerRow) {
  log('--- Processing Group Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'اسم المجموعة')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف'))?.value,
    category: row.getCell(getColumnIndex(headerRow, 'الفئة (أطفال/نساء/رجال)')).value,
  };
  log('Raw group data:', data);

  if (!data.name || !data.category) {
    return { success: false, message: 'اسم المجموعة والفئة حقول مطلوبة.' };
  }

  const mappedCategory = GROUP_CATEGORY_MAP_AR_TO_EN[data.category];
  if (!mappedCategory) {
    return { success: false, message: `الفئة "${data.category}" غير صالحة.` };
  }
  data.category = mappedCategory;

  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  const updateData = {};
  fields.forEach((k) => {
    updateData[k] = data[k] === undefined ? null : data[k];
  });

  if (matricule) {
    log(`Attempting to update group with matricule: ${matricule}`);
    const existingGroup = await getQuery('SELECT id FROM groups WHERE matricule = ?', [matricule]);
    if (!existingGroup) {
      return { success: false, message: `المجموعة بالرقم التعريفي "${matricule}" غير موجودة.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE groups SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated group ${matricule}`);
    return { success: true };
  }

  log(`Checking for duplicate group by name: ${data.name}`);
  const existingGroup = await getQuery('SELECT id FROM groups WHERE name = ?', [data.name]);
  if (existingGroup) {
    logWarn(`Duplicate group found by name: ${data.name}`);
    return {
      success: false,
      message: `المجموعة بالاسم "${data.name}" موجودة بالفعل. لتحديثها، يرجى استخدام رقمها التعريفي.`,
    };
  }

  log(`No duplicate found. Creating new group: ${data.name}`);
  const newMatricule = await generateMatricule('group');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO groups (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  log(`Successfully created new group with matricule ${newMatricule}`);
  return { success: true };
}

async function processInventoryItemRow(row, headerRow) {
  log('--- Processing Inventory Item Row ---');
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  if (!matricule) {
    return { success: false, message: 'الرقم التعريفي حقل مطلوب لعناصر المخزون.' };
  }

  const data = {
    item_name: row.getCell(getColumnIndex(headerRow, 'اسم العنصر')).value,
    category: row.getCell(getColumnIndex(headerRow, 'الفئة')).value,
    quantity: row.getCell(getColumnIndex(headerRow, 'الكمية')).value,
    unit_value: row.getCell(getColumnIndex(headerRow, 'قيمة الوحدة'))?.value,
    total_value: row.getCell(getColumnIndex(headerRow, 'القيمة الإجمالية'))?.value,
    acquisition_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الاقتناء'))?.value,
    acquisition_source: row.getCell(getColumnIndex(headerRow, 'مصدر الاقتناء'))?.value,
    condition_status: row.getCell(getColumnIndex(headerRow, 'الحالة'))?.value,
    location: row.getCell(getColumnIndex(headerRow, 'الموقع'))?.value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات'))?.value,
  };
  log('Raw inventory data:', data);

  if (!data.item_name || !data.category || data.quantity === undefined) {
    return { success: false, message: 'اسم العنصر، الفئة، والكمية هي حقول مطلوبة.' };
  }

  if (data.acquisition_date && !isValidDate(data.acquisition_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ الاقتناء غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  const updateData = {};
  fields.forEach((k) => {
    updateData[k] = data[k] === undefined ? null : data[k];
  });

  const existingItem = await getQuery('SELECT id FROM inventory_items WHERE matricule = ?', [
    matricule,
  ]);

  if (existingItem) {
    log(`Attempting to update inventory item with matricule: ${matricule}`);
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE inventory_items SET ${setClauses} WHERE matricule = ?`, values);
    log(`Successfully updated inventory item ${matricule}`);
    return { success: true };
  }
  log(`Creating new inventory item with matricule: ${matricule}`);
  const allData = { ...updateData, matricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(
    `INSERT INTO inventory_items (${allFields.join(', ')}) VALUES (${placeholders})`,
    values,
  );
  log(`Successfully created new inventory item with matricule ${matricule}`);
  return { success: true };
}

module.exports = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
};
