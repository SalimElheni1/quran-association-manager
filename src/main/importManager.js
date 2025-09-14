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
    const processor = sheetProcessors[sheetName];
    if (!processor) continue;

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
          const result = await processor(row, headerRow);
          if (result.success) {
            sheetResults.successCount++;
            if (result.newUser) sheetResults.newUsers.push(result.newUser);
          } else {
            sheetResults.errorCount++;
            sheetResults.errors.push(`[${sheetName}] Row ${i}: ${result.message}`);
            sheetHasErrors = true;
          }
        } catch (e) {
          sheetResults.errorCount++;
          sheetResults.errors.push(
            `[${sheetName}] Row ${i}: An unexpected error occurred - ${e.message}`,
          );
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
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'الاسم واللقب')).value,
    date_of_birth: row.getCell(getColumnIndex(headerRow, 'تاريخ الميلاد')).value,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس')).value,
    address: row.getCell(getColumnIndex(headerRow, 'العنوان')).value,
    contact_info: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
    email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value,
    national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
  };

  if (!data.name && !matricule) return { success: false, message: 'اسم الطالب مطلوب.' };

  if (data.date_of_birth && !isValidDate(data.date_of_birth)) {
    return {
      success: false,
      message: 'تنسيق تاريخ الميلاد غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    // Update existing record
    const existingStudent = await getQuery('SELECT id FROM students WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingStudent) {
      return { success: false, message: `الطالب بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' }; // Nothing to update
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE students SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }
  // Insert new record
  const newMatricule = await generateMatricule('student');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO students (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processTeacherRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'الاسم واللقب')).value,
    national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
    contact_info: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
    email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
  };

  if (!data.name) return { success: false, message: 'اسم المعلم مطلوب.' };

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    // Update existing record
    const existingTeacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingTeacher) {
      return { success: false, message: `المعلم بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE teachers SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }
  // Insert new record
  const newMatricule = await generateMatricule('teacher');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO teachers (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processUserRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  const data = {
    username: row.getCell(getColumnIndex(headerRow, 'اسم المستخدم')).value,
    first_name: row.getCell(getColumnIndex(headerRow, 'الاسم الأول')).value,
    last_name: row.getCell(getColumnIndex(headerRow, 'اللقب')).value,
    role: row.getCell(getColumnIndex(headerRow, 'الدور')).value,
    employment_type: row.getCell(getColumnIndex(headerRow, 'نوع التوظيف')).value,
  };

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
    // Update existing record
    const existingUser = await getQuery('SELECT id FROM users WHERE matricule = ?', [matricule]);
    if (!existingUser) {
      return { success: false, message: `المستخدم بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE users SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }
  // Insert new record
  const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', [data.username]);
  if (existingUser) {
    return { success: false, message: `المستخدم "${data.username}" موجود بالفعل.` };
  }

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
  return { success: true, newUser: { username: data.username, password } };
}

async function processClassRow(row, headerRow) {
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
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس'))?.value,
  };

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
    const existingClass = await getQuery('SELECT id FROM classes WHERE matricule = ?', [matricule]);
    if (!existingClass) {
      return { success: false, message: `الفصل بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    if (fields.length === 0) {
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => updateData[k]), matricule];
    await runQuery(`UPDATE classes SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }

  const newMatricule = await generateMatricule('class');
  const allData = { ...updateData, matricule: newMatricule };

  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO classes (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processPaymentRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const studentMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للطالب'))?.value;

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
    return { success: true };
  }

  const newMatricule = await generateMatricule('payment');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO payments (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processSalaryRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const teacherMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للمعلم'))?.value;

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
    return { success: true };
  }

  const newMatricule = await generateMatricule('salary');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO salaries (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processDonationRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const data = {
    donor_name: row.getCell(getColumnIndex(headerRow, 'اسم المتبرع')).value,
    donation_type: row.getCell(getColumnIndex(headerRow, 'نوع التبرع (Cash/In-kind)')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ (للتبرع النقدي)')).value,
    description: row.getCell(getColumnIndex(headerRow, 'وصف (للتبرع العيني)')).value,
    donation_date: row.getCell(getColumnIndex(headerRow, 'تاريخ التبرع (YYYY-MM-DD)')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };

  if (data.donation_date && !isValidDate(data.donation_date)) {
    return {
      success: false,
      message: 'تنسيق تاريخ التبرع غير صالح. الرجاء استخدام YYYY-MM-DD.',
    };
  }

  if (data.donation_type && !['Cash', 'In-kind'].includes(data.donation_type)) {
    return {
      success: false,
      message: 'نوع التبرع غير صالح. يجب أن يكون "Cash" أو "In-kind".',
    };
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
    return { success: true };
  }

  const newMatricule = await generateMatricule('donation');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO donations (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processExpenseRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;
  const data = {
    category: row.getCell(getColumnIndex(headerRow, 'الفئة')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    expense_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الصرف (YYYY-MM-DD)')).value,
    responsible_person: row.getCell(getColumnIndex(headerRow, 'المسؤول')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
  };

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
    return { success: true };
  }

  const newMatricule = await generateMatricule('expense');
  const allData = { ...updateData, matricule: newMatricule };
  const allFields = Object.keys(allData).filter((k) => allData[k] !== null);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO expenses (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processAttendanceRow(row, headerRow) {
  const studentMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للطالب'))?.value;
  const className = row.getCell(getColumnIndex(headerRow, 'اسم الفصل')).value;
  const date = row.getCell(getColumnIndex(headerRow, 'التاريخ (YYYY-MM-DD)')).value;
  const status = row.getCell(getColumnIndex(headerRow, 'الحالة (present/absent/late/excused)'))
    .value;

  if (!studentMatricule || !className || !date || !status) {
    return { success: false, message: 'الرقم التعريفي للطالب، اسم الفصل، التاريخ، والحالة مطلوبون.' };
  }

  if (!isValidDate(date)) {
    return { success: false, message: 'تنسيق التاريخ غير صالح. الرجاء استخدام YYYY-MM-DD.' };
  }

  if (!['present', 'absent', 'late', 'excused'].includes(status)) {
    return {
      success: false,
      message: 'حالة الحضور غير صالحة. يجب أن تكون واحدة من: present, absent, late, excused.',
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
    status,
  };

  const existingAttendance = await getQuery(
    'SELECT status FROM attendance WHERE student_id = ? AND class_id = ? AND date = ?',
    [data.student_id, data.class_id, data.date],
  );

  if (existingAttendance) {
    // Update existing record
    if (existingAttendance.status === data.status) {
      return { success: true, message: 'الحالة لم تتغير.' }; // No change needed
    }
    await runQuery('UPDATE attendance SET status = ? WHERE student_id = ? AND class_id = ? AND date = ?', [
      data.status,
      data.student_id,
      data.class_id,
      data.date,
    ]);
    return { success: true };
  }
  // Insert new record
  const fields = Object.keys(data);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO attendance (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

module.exports = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
};
