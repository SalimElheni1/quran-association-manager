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
  الفصول: ['اسم الفصل', 'معرف المعلم'],
  'الرسوم الدراسية': ['الرقم التعريفي للطالب', 'المبلغ', 'تاريخ الدفع'],
  الرواتب: ['الرقم التعريفي للموظف', 'المبلغ', 'تاريخ الدفع'],
  التبرعات: ['اسم المتبرع', 'نوع التبرع', 'تاريخ التبرع'],
  المصاريف: ['الفئة', 'المبلغ', 'تاريخ الصرف'],
  الحضور: ['الرقم التعريفي للطالب', 'اسم الفصل', 'التاريخ', 'الحالة'],
  المجموعات: ['اسم المجموعة', 'الفئة'],
  المخزون: ['اسم العنصر', 'الفئة', 'الكمية'],
};

const getColumnIndex = (headerRow, headerText) => {
  let index = -1;
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value && cell.value === headerText) {
      index = colNumber;
    }
  });
  return index;
};

async function importExcelData(filePath, selectedSheets) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const results = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };

  const allSheetProcessors = {
    الطلاب: processStudentRow,
    المعلمون: processTeacherRow,
    المستخدمون: processUserRow,
    الفصول: processClassRow,
    'الرسوم الدراسية': processPaymentRow,
    الرواتب: processSalaryRow,
    التبرعات: processDonationRow,
    المصاريف: processExpenseRow,
    الحضور: processAttendanceRow,
    المجموعات: processGroupRow,
    المخزون: processInventoryRow,
  };

  const sheetsToProcess = selectedSheets || Object.keys(allSheetProcessors);

  for (const sheetName of sheetsToProcess) {
    const processor = allSheetProcessors[sheetName];
    if (!processor) continue;

    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      logWarn(`Sheet "${sheetName}" selected for import but not found in the Excel file.`);
      continue;
    }

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
      continue; // Skip processing this sheet
    }

    for (let i = 3; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.hasValues) continue;
      try {
        const result = await processor(row, headerRow);
        if (result.success) {
          results.successCount++;
          if (result.newUser) results.newUsers.push(result.newUser);
        } else {
          results.errorCount++;
          results.errors.push(`[${sheetName}] Row ${i}: ${result.message}`);
        }
      } catch (e) {
        results.errorCount++;
        results.errors.push(`[${sheetName}] Row ${i}: An unexpected error occurred - ${e.message}`);
      }
    }
  }

  return results;
}

let processStudentRow = async function (row, headerRow) {
  debugger;
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

  if (!data.name) return { success: false, message: 'اسم الطالب مطلوب.' };

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
  const existingStudent = await getQuery(
    'SELECT id FROM students WHERE name = ? OR national_id = ?',
    [data.name, data.national_id],
  );
  if (existingStudent) {
    return { success: false, message: `الطالب "${data.name}" موجود بالفعل.` };
  }

  const newMatricule = await generateMatricule('student');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO students (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
};

let processTeacherRow = async function (row, headerRow) {
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
  const existingTeacher = await getQuery('SELECT id FROM teachers WHERE national_id = ?', [
    data.national_id,
  ]);
  if (existingTeacher) {
    return { success: false, message: `المعلم برقم الهوية "${data.national_id}" موجود بالفعل.` };
  }

  const newMatricule = await generateMatricule('teacher');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO teachers (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
};

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
  const teacherMatricule = row.getCell(getColumnIndex(headerRow, 'معرف المعلم'))?.value;
  if (!teacherMatricule) return { success: false, message: 'معرف المعلم مطلوب.' };
  const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [teacherMatricule]);
  if (!teacher) {
    return {
      success: false,
      message: `لم يتم العثور على معلم بالمعرف "${teacherMatricule}".`,
    };
  }
  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'اسم الفصل')).value,
    teacher_id: teacher.id,
    class_type: row.getCell(getColumnIndex(headerRow, 'نوع الفصل'))?.value,
    schedule: row.getCell(getColumnIndex(headerRow, 'الجدول الزمني (JSON)'))?.value,
    start_date: row.getCell(getColumnIndex(headerRow, 'تاريخ البدء'))?.value,
    end_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الانتهاء'))?.value,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة'))?.value,
    capacity: row.getCell(getColumnIndex(headerRow, 'السعة'))?.value,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس'))?.value,
  };
  if (!data.name) return { success: false, message: 'اسم الفصل مطلوب.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO classes (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processPaymentRow(row, headerRow) {
  const studentMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للطالب'))?.value;
  if (!studentMatricule) return { success: false, message: 'الرقم التعريفي للطالب مطلوب.' };
  const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [studentMatricule]);
  if (!student) {
    return {
      success: false,
      message: `لم يتم العثور على طالب بالرقم التعريفي "${studentMatricule}".`,
    };
  }
  const data = {
    student_id: student.id,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    payment_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الدفع')).value,
    payment_method: row.getCell(getColumnIndex(headerRow, 'طريقة الدفع')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  if (!data.amount || !data.payment_date)
    return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO payments (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processSalaryRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للموظف'))?.value;
  if (!matricule) return { success: false, message: 'الرقم التعريفي للموظف مطلوب.' };

  let person = null;
  let personType = null;

  // Try finding in users table first
  const user = await getQuery('SELECT id, employment_type FROM users WHERE matricule = ?', [
    matricule,
  ]);
  if (user) {
    person = user;
    personType = user.employment_type;
  } else {
    // If not found in users, try finding in teachers table
    const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [matricule]);
    if (teacher) {
      person = teacher;
      personType = 'teacher';
    }
  }

  if (!person) {
    return {
      success: false,
      message: `لم يتم العثور على موظف أو معلم بالرقم التعريفي "${matricule}".`,
    };
  }

  const data = {
    user_id: person.id,
    user_type: personType,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    payment_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الدفع')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };

  if (!data.amount || !data.payment_date) {
    return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };
  }

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO salaries (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processDonationRow(row, headerRow) {
  const donationTypeAr = row.getCell(getColumnIndex(headerRow, 'نوع التبرع'))?.value;
  const donationTypeEn = { نقدي: 'Cash', عيني: 'In-kind' }[donationTypeAr] || donationTypeAr;

  const data = {
    donor_name: row.getCell(getColumnIndex(headerRow, 'اسم المتبرع')).value,
    donation_type: donationTypeEn,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
    donation_date: row.getCell(getColumnIndex(headerRow, 'تاريخ التبرع')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  if (!data.donor_name || !data.donation_type || !data.donation_date)
    return { success: false, message: 'اسم المتبرع، نوع التبرع، وتاريخ التبرع هي حقول مطلوبة.' };
  if (data.donation_type === 'Cash' && !data.amount)
    return { success: false, message: 'المبلغ مطلوب للتبرعات النقدية.' };
  if (data.donation_type === 'In-kind' && !data.description)
    return { success: false, message: 'الوصف مطلوب للتبرعات العينية.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO donations (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processExpenseRow(row, headerRow) {
  const data = {
    category: row.getCell(getColumnIndex(headerRow, 'الفئة')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    expense_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الصرف')).value,
    responsible_person: row.getCell(getColumnIndex(headerRow, 'المسؤول')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
  };
  if (!data.category || !data.amount || !data.expense_date)
    return { success: false, message: 'الفئة، المبلغ، وتاريخ الصرف هي حقول مطلوبة.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO expenses (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

let processAttendanceRow = async function (row, headerRow) {
  const studentMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للطالب'))?.value;
  const className = row.getCell(getColumnIndex(headerRow, 'اسم الفصل')).value;
  if (!studentMatricule || !className) {
    return { success: false, message: 'الرقم التعريفي للطالب واسم الفصل مطلوبان.' };
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
    date: row.getCell(getColumnIndex(headerRow, 'التاريخ')).value,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value,
  };
  if (!data.date || !data.status) return { success: false, message: 'التاريخ والحالة مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO attendance (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
};

async function processGroupRow(row, headerRow) {
  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'اسم المجموعة')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
    category: row.getCell(getColumnIndex(headerRow, 'الفئة')).value,
  };

  if (!data.name || !data.category) {
    return { success: false, message: 'اسم المجموعة والفئة مطلوبان.' };
  }

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO groups (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processInventoryRow(row, headerRow) {
  const data = {
    item_name: row.getCell(getColumnIndex(headerRow, 'اسم العنصر')).value,
    category: row.getCell(getColumnIndex(headerRow, 'الفئة')).value,
    quantity: row.getCell(getColumnIndex(headerRow, 'الكمية')).value,
    unit_value: row.getCell(getColumnIndex(headerRow, 'قيمة الوحدة')).value,
    acquisition_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الاقتناء')).value,
    acquisition_source: row.getCell(getColumnIndex(headerRow, 'مصدر الاقتناء')).value,
    condition_status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value,
    location: row.getCell(getColumnIndex(headerRow, 'الموقع')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };

  if (!data.item_name || !data.category || data.quantity === null || data.quantity === undefined) {
    return { success: false, message: 'اسم العنصر والفئة والكمية هي حقول مطلوبة.' };
  }

  const newMatricule = await generateMatricule('inventory');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(
    `INSERT INTO inventory_items (${allFields.join(', ')}) VALUES (${placeholders})`,
    values,
  );
  return { success: true };
}

const GENDER_MAP_AR_TO_EN = { ذكر: 'Male', أنثى: 'Female' };
const STATUS_MAP_AR_TO_EN = { نشط: 'active', 'غير نشط': 'inactive' };
const ATTENDANCE_MAP_AR_TO_EN = {
  حاضر: 'present',
  غائب: 'absent',
  متأخر: 'late',
  معذور: 'excused',
};

// Override the original functions to include localization
const originalProcessStudentRow = processStudentRow;
processStudentRow = async (row, headerRow) => {
  const genderAr = row.getCell(getColumnIndex(headerRow, 'الجنس'))?.value;
  const statusAr = row.getCell(getColumnIndex(headerRow, 'الحالة'))?.value;
  if (genderAr)
    row.getCell(getColumnIndex(headerRow, 'الجنس')).value =
      GENDER_MAP_AR_TO_EN[genderAr] || genderAr;
  if (statusAr)
    row.getCell(getColumnIndex(headerRow, 'الحالة')).value =
      STATUS_MAP_AR_TO_EN[statusAr] || statusAr;
  return originalProcessStudentRow(row, headerRow);
};

const originalProcessTeacherRow = processTeacherRow;
processTeacherRow = async (row, headerRow) => {
  const genderAr = row.getCell(getColumnIndex(headerRow, 'الجنس'))?.value;
  if (genderAr)
    row.getCell(getColumnIndex(headerRow, 'الجنس')).value =
      GENDER_MAP_AR_TO_EN[genderAr] || genderAr;
  return originalProcessTeacherRow(row, headerRow);
};

const originalProcessAttendanceRow = processAttendanceRow;
processAttendanceRow = async (row, headerRow) => {
  const statusAr = row.getCell(getColumnIndex(headerRow, 'الحالة'))?.value;
  if (statusAr)
    row.getCell(getColumnIndex(headerRow, 'الحالة')).value =
      ATTENDANCE_MAP_AR_TO_EN[statusAr] || statusAr;
  return originalProcessAttendanceRow(row, headerRow);
};

module.exports = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
};