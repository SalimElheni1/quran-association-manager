const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { app } = require('electron');
const Store = require('electron-store');
const ExcelJS = require('exceljs');
const {
  getDatabasePath,
  isDbOpen,
  closeDatabase,
  initializeDatabase,
  getDb,
  dbExec,
  runQuery,
  getQuery,
  allQuery,
} = require('../db/db');
const bcrypt = require('bcryptjs');

const saltStore = new Store({ name: 'db-config' });
const mainStore = new Store();

/**
 * Validates a packaged backup file by checking for the required contents.
 * @param {string} filePath - The path to the `.qdb` backup file to validate.
 * @returns {Promise<{isValid: boolean, message: string}>}
 */
async function validateDatabaseFile(filePath) {
  try {
    const zipFileContent = await fs.readFile(filePath);
    const zip = new PizZip(zipFileContent);

    const sqlFile = zip.file('backup.sql');
    const configFile = zip.file('config.json');

    if (!sqlFile || !configFile) {
      return { isValid: false, message: 'ملف النسخ الاحتياطي غير صالح أو تالف.' };
    }

    // Further validation could check if config.json is valid JSON, etc.
    // For now, presence of files is enough.
    return { isValid: true, message: 'تم التحقق من ملف النسخ الاحتياطي بنجاح.' };
  } catch (error) {
    console.error('Error during backup validation:', error);
    return { isValid: false, message: `خطأ في قراءة ملف النسخ الاحتياطي: ${error.message}` };
  }
}

/**
 * Retries unlinking a file if it's busy, common on Windows.
 * @param {string} filePath - The path to the file to delete.
 * @param {number} retries - The maximum number of retries.
 * @param {number} delay - The delay between retries in milliseconds.
 */
async function unlinkWithRetry(filePath, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath);
      console.log(`Successfully unlinked ${filePath}`);
      return; // Success
    } catch (error) {
      if (error.code === 'EBUSY' && i < retries - 1) {
        console.warn(`EBUSY error, retrying unlink on ${filePath} in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Re-throw the last error or any other error
        console.error(`Failed to unlink ${filePath} after ${i + 1} attempts.`);
        throw error;
      }
    }
  }
}


/**
 * Replaces the current database by importing data from a SQL dump file.
 * @param {string} importedDbPath - Path to the `.qdb` backup file.
 * @param {string} password - The user's password for the database.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function replaceDatabase(importedDbPath, password) {
  const currentDbPath = getDatabasePath();
  const currentSaltPath = saltStore.path;

  try {
    // 1. Ensure the current DB connection is closed.
    if (isDbOpen()) {
      await closeDatabase();
    }

    // 2. Read the contents of the backup package
    const zipFileContent = await fs.readFile(importedDbPath);
    const zip = new PizZip(zipFileContent);
    const sqlFile = zip.file('backup.sql');
    const configFile = zip.file('config.json');

    if (!sqlFile || !configFile) {
      throw new Error('Could not find required files (backup.sql, config.json) in backup package.');
    }

    const sqlScript = sqlFile.asText();
    const configBuffer = configFile.asNodeBuffer();
    const configJson = JSON.parse(configBuffer.toString());
    const newSalt = configJson['db-salt'];

    if (!newSalt) {
      throw new Error('Backup configuration is missing the required salt.');
    }

    // 3. Overwrite the salt config file and update the in-memory store
    await fs.writeFile(currentSaltPath, configBuffer);
    saltStore.set('db-salt', newSalt);
    console.log('Salt configuration updated from backup.');

    // 4. Delete the old database file, if it exists
    if (fsSync.existsSync(currentDbPath)) {
      console.log(`Deleting old database file at ${currentDbPath}...`);
      await unlinkWithRetry(currentDbPath);
    }

    // 5. Initialize a new, empty, encrypted database with the new salt
    console.log('Initializing new database with imported salt...');
    await initializeDatabase(password);
    console.log('New database initialized successfully.');

    // 6. Execute the SQL script to populate the new database
    console.log('Executing SQL script to import data...');
    await dbExec(getDb(), sqlScript);
    console.log('Data import completed successfully.');

    // 7. Set flag to force re-login after restart and then relaunch
    mainStore.set('force-relogin-after-restart', true);
    console.log('Database import successful. The app will now restart.');
    app.relaunch();
    app.quit();

    return { success: true, message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.' };
  } catch (error) {
    console.error('Failed to replace database from package:', error);
    // Attempt to restore previous state if something went wrong
    // This is complex; for now, we just log the error. A more robust
    // solution might try to restore the pre-import backup.
    return { success: false, message: `فشل استيراد قاعدة البيانات: ${error.message}` };
  }
}

const REQUIRED_COLUMNS = {
  الطلاب: ['الاسم واللقب'],
  المعلمون: ['الاسم واللقب', 'رقم الهوية'],
  المستخدمون: ['اسم المستخدم', 'الاسم الأول', 'اللقب', 'الدور', 'نوع التوظيف'],
  الفصول: ['اسم الفصل', 'رقم هوية المعلم'],
};

// Helper to get column index by header text
const getColumnIndex = (headerRow, headerText) => {
  let index = -1;
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value === headerText) {
      index = colNumber;
    }
  });
  return index;
};


async function importExcelData(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const results = {
    successCount: 0,
    errorCount: 0,
    errors: [],
    newUsers: [],
  };

  const processSheet = async (sheetName, processor) => {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      // results.errors.push(`Sheet "${sheetName}" not found.`);
      // results.errorCount++;
      return; // Silently skip if sheet doesn't exist
    }

    const headerRow = worksheet.getRow(2); // Headers are on the second row
    if (!headerRow.hasValues) return; // Skip empty sheet

    // Validate required columns
    const missingColumns = REQUIRED_COLUMNS[sheetName].filter(
      (colName) => getColumnIndex(headerRow, colName) === -1,
    );

    if (missingColumns.length > 0) {
      results.errors.push(
        `ورقة "${sheetName}" ينقصها الأعمدة المطلوبة: ${missingColumns.join(', ')}`,
      );
      results.errorCount += worksheet.rowCount - 2;
      return;
    }

    for (let i = 3; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.hasValues) continue;

      try {
        const result = await processor(row, headerRow);
        if (result.success) {
          results.successCount++;
          if (result.newUser) {
            results.newUsers.push(result.newUser);
          }
        } else {
          results.errorCount++;
          results.errors.push(`[${sheetName}] Row ${i}: ${result.message}`);
        }
      } catch (e) {
        results.errorCount++;
        results.errors.push(`[${sheetName}] Row ${i}: An unexpected error occurred - ${e.message}`);
      }
    }
  };

  await processSheet('الطلاب', processStudentRow);
  await processSheet('المعلمون', processTeacherRow);
  await processSheet('المستخدمون', processUserRow);
  await processSheet('الفصول', processClassRow);


  return results;
}

async function processStudentRow(row, headerRow) {
  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'الاسم واللقب')).value,
    date_of_birth: row.getCell(getColumnIndex(headerRow, 'تاريخ الميلاد')).value,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس')).value,
    address: row.getCell(getColumnIndex(headerRow, 'العنوان')).value,
    contact_info: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
    email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value,
    memorization_level: row.getCell(getColumnIndex(headerRow, 'مستوى الحفظ')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
    parent_name: row.getCell(getColumnIndex(headerRow, 'اسم ولي الأمر')).value,
    guardian_relation: row.getCell(getColumnIndex(headerRow, 'صلة القرابة')).value,
    parent_contact: row.getCell(getColumnIndex(headerRow, 'هاتف ولي الأمر')).value,
    guardian_email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني للولي')).value?.text,
    emergency_contact_name: row.getCell(getColumnIndex(headerRow, 'جهة الاتصال في حالات الطوارئ')).value,
    emergency_contact_phone: row.getCell(getColumnIndex(headerRow, 'هاتف الطوارئ')).value,
    health_conditions: row.getCell(getColumnIndex(headerRow, 'الحالة الصحية')).value,
    national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
    school_name: row.getCell(getColumnIndex(headerRow, 'اسم المدرسة')).value,
    grade_level: row.getCell(getColumnIndex(headerRow, 'المستوى الدراسي')).value,
    educational_level: row.getCell(getColumnIndex(headerRow, 'المستوى التعليمي')).value,
    occupation: row.getCell(getColumnIndex(headerRow, 'المهنة')).value,
    civil_status: row.getCell(getColumnIndex(headerRow, 'الحالة الاجتماعية')).value,
    related_family_members: row.getCell(getColumnIndex(headerRow, 'أفراد العائلة المسجلون')).value,
    financial_assistance_notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات المساعدة المالية')).value,
  };

  if (!data.name) {
    return { success: false, message: "اسم الطالب مطلوب." };
  }

  const existingStudent = await getQuery('SELECT id FROM students WHERE name = ? OR national_id = ?', [data.name, data.national_id]);
  if (existingStudent) {
    return { success: false, message: `الطالب "${data.name}" موجود بالفعل.` };
  }

  const fields = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(k => data[k]);

  const sql = `INSERT INTO students (${fields.join(', ')}) VALUES (${placeholders})`;
  await runQuery(sql, values);

  return { success: true };
}

async function processTeacherRow(row, headerRow) {
  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'الاسم واللقب')).value,
    national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
    contact_info: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
    email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
    address: row.getCell(getColumnIndex(headerRow, 'العنوان')).value,
    date_of_birth: row.getCell(getColumnIndex(headerRow, 'تاريخ الميلاد')).value,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس')).value,
    educational_level: row.getCell(getColumnIndex(headerRow, 'المستوى التعليمي')).value,
    specialization: row.getCell(getColumnIndex(headerRow, 'التخصص')).value,
    years_of_experience: row.getCell(getColumnIndex(headerRow, 'سنوات الخبرة')).value,
    availability: row.getCell(getColumnIndex(headerRow, 'أوقات التوفر')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };

  if (!data.name || !data.national_id) {
    return { success: false, message: "اسم المعلم ورقم الهوية مطلوبان." };
  }

  const existingTeacher = await getQuery('SELECT id FROM teachers WHERE national_id = ?', [data.national_id]);
  if (existingTeacher) {
    return { success: false, message: `المعلم برقم الهوية "${data.national_id}" موجود بالفعل.` };
  }

  const fields = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(k => data[k]);

  const sql = `INSERT INTO teachers (${fields.join(', ')}) VALUES (${placeholders})`;
  await runQuery(sql, values);

  return { success: true };
}

async function processUserRow(row, headerRow) {
    const password = Math.random().toString(36).slice(-8);
    const hashedPassword = bcrypt.hashSync(password, 10);

    const data = {
        username: row.getCell(getColumnIndex(headerRow, 'اسم المستخدم')).value,
        first_name: row.getCell(getColumnIndex(headerRow, 'الاسم الأول')).value,
        last_name: row.getCell(getColumnIndex(headerRow, 'اللقب')).value,
        password: hashedPassword,
        date_of_birth: row.getCell(getColumnIndex(headerRow, 'تاريخ الميلاد')).value,
        national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
        email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
        phone_number: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
        occupation: row.getCell(getColumnIndex(headerRow, 'المهنة')).value,
        civil_status: row.getCell(getColumnIndex(headerRow, 'الحالة الاجتماعية')).value,
        employment_type: row.getCell(getColumnIndex(headerRow, 'نوع التوظيف')).value,
        start_date: row.getCell(getColumnIndex(headerRow, 'تاريخ البدء')).value,
        end_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الانتهاء')).value,
        role: row.getCell(getColumnIndex(headerRow, 'الدور')).value,
        status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value || 'active',
        notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
    };

    if (!data.username || !data.first_name || !data.last_name || !data.role || !data.employment_type) {
        return { success: false, message: "اسم المستخدم، الاسم الأول، اللقب، الدور، ونوع التوظيف هي حقول مطلوبة." };
    }

    const existingUser = await getQuery('SELECT id FROM users WHERE username = ? OR email = ? OR national_id = ?', [data.username, data.email, data.national_id]);
    if (existingUser) {
        return { success: false, message: `المستخدم "${data.username}" موجود بالفعل.` };
    }

    const fields = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(k => data[k]);

    const sql = `INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders})`;
    await runQuery(sql, values);

    return { success: true, newUser: { username: data.username, password: password } };
}


async function processClassRow(row, headerRow) {
  const teacherNationalId = row.getCell(getColumnIndex(headerRow, 'رقم هوية المعلم')).value;
  if (!teacherNationalId) {
    return { success: false, message: "رقم هوية المعلم مطلوب." };
  }

  const teacher = await getQuery('SELECT id FROM teachers WHERE national_id = ?', [teacherNationalId]);
  if (!teacher) {
    return { success: false, message: `لم يتم العثور على معلم برقم الهوية "${teacherNationalId}".` };
  }

  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'اسم الفصل')).value,
    class_type: row.getCell(getColumnIndex(headerRow, 'نوع الفصل')).value,
    teacher_id: teacher.id,
    schedule: row.getCell(getColumnIndex(headerRow, 'الجدول الزمني (JSON)')).value,
    start_date: row.getCell(getColumnIndex(headerRow, 'تاريخ البدء')).value,
    end_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الانتهاء')).value,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value || 'pending',
    capacity: row.getCell(getColumnIndex(headerRow, 'السعة')).value,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس')).value,
  };

  if (!data.name) {
    return { success: false, message: "اسم الفصل مطلوب." };
  }

  const fields = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(k => data[k]);

  const sql = `INSERT INTO classes (${fields.join(', ')}) VALUES (${placeholders})`;
  await runQuery(sql, values);

  return { success: true };
}

module.exports = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
};
