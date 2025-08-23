const fs = require('fs').promises;
const fsSync = require('fs');
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
} = require('../db/db');
const bcrypt = require('bcryptjs');
const { generateMatricule } = require('./matriculeService');

const saltStore = new Store({ name: 'db-config' });
const mainStore = new Store();

async function validateDatabaseFile(filePath) {
  try {
    const zipFileContent = await fs.readFile(filePath);
    const zip = new PizZip(zipFileContent);
    const sqlFile = zip.file('backup.sql');
    const configFile = zip.file('config.json');
    if (!sqlFile || !configFile) {
      return { isValid: false, message: 'ملف النسخ الاحتياطي غير صالح أو تالف.' };
    }
    return { isValid: true, message: 'تم التحقق من ملف النسخ الاحتياطي بنجاح.' };
  } catch (error) {
    console.error('Error during backup validation:', error);
    return { isValid: false, message: `خطأ في قراءة ملف النسخ الاحتياطي: ${error.message}` };
  }
}

async function unlinkWithRetry(filePath, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath);
      console.log(`Successfully unlinked ${filePath}`);
      return;
    } catch (error) {
      if (error.code === 'EBUSY' && i < retries - 1) {
        console.warn(
          `EBUSY error, retrying unlink on ${filePath} in ${delay}ms... (Attempt ${i + 1}/${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(`Failed to unlink ${filePath} after ${i + 1} attempts.`);
        throw error;
      }
    }
  }
}

async function replaceDatabase(importedDbPath, password) {
  const currentDbPath = getDatabasePath();
  const currentSaltPath = saltStore.path;
  try {
    if (isDbOpen()) {
      await closeDatabase();
    }
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
    await fs.writeFile(currentSaltPath, configBuffer);
    saltStore.set('db-salt', newSalt);
    console.log('Salt configuration updated from backup.');
    if (fsSync.existsSync(currentDbPath)) {
      console.log(`Deleting old database file at ${currentDbPath}...`);
      await unlinkWithRetry(currentDbPath);
    }
    console.log('Initializing new database with imported salt...');
    await initializeDatabase(password);
    console.log('New database initialized successfully.');
    console.log('Executing SQL script to import data...');
    await dbExec(getDb(), sqlScript);
    console.log('Data import completed successfully.');
    mainStore.set('force-relogin-after-restart', true);
    console.log('Database import successful. The app will now restart.');
    app.relaunch();
    app.quit();
    return {
      success: true,
      message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.',
    };
  } catch (error) {
    console.error('Failed to replace database from package:', error);
    return { success: false, message: `فشل استيراد قاعدة البيانات: ${error.message}` };
  }
}

const REQUIRED_COLUMNS = {
  الطلاب: ['الاسم واللقب'],
  المعلمون: ['الاسم واللقب', 'رقم الهوية'],
  المستخدمون: ['اسم المستخدم', 'الاسم الأول', 'اللقب', 'الدور', 'نوع التوظيف'],
  الفصول: ['اسم الفصل', 'رقم هوية المعلم'],
  'الرسوم الدراسية': ['رقم هوية الطالب', 'المبلغ', 'تاريخ الدفع (YYYY-MM-DD)'],
  الرواتب: ['رقم هوية المعلم', 'المبلغ', 'تاريخ الدفع (YYYY-MM-DD)'],
  التبرعات: ['اسم المتبرع', 'نوع التبرع (Cash/In-kind)', 'تاريخ التبرع (YYYY-MM-DD)'],
  المصاريف: ['الفئة', 'المبلغ', 'تاريخ الصرف (YYYY-MM-DD)'],
  الحضور: ['رقم هوية الطالب', 'اسم الفصل', 'التاريخ (YYYY-MM-DD)', 'الحالة (present/absent/late/excused)'],
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

async function importExcelData(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const results = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };

  const processSheet = async (sheetName, processor) => {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) return;
    const headerRow = worksheet.getRow(2);
    if (!headerRow.hasValues) return;
    const missingColumns = (REQUIRED_COLUMNS[sheetName] || []).filter(
      (colName) => getColumnIndex(headerRow, colName) === -1,
    );
    if (missingColumns.length > 0) {
      results.errors.push(`ورقة "${sheetName}" ينقصها الأعمدة المطلوبة: ${missingColumns.join(', ')}`);
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
  };

  await processSheet('الطلاب', processStudentRow);
  await processSheet('المعلمون', processTeacherRow);
  await processSheet('المستخدمون', processUserRow);
  await processSheet('الفصول', processClassRow);
  await processSheet('الرسوم الدراسية', processPaymentRow);
  await processSheet('الرواتب', processSalaryRow);
  await processSheet('التبرعات', processDonationRow);
  await processSheet('المصاريف', processExpenseRow);
  await processSheet('الحضور', processAttendanceRow);

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
  const existingStudent = await getQuery('SELECT id FROM students WHERE name = ? OR national_id = ?', [
    data.name,
    data.national_id,
  ]);
  if (existingStudent) {
    return { success: false, message: `الطالب "${data.name}" موجود بالفعل.` };
  }

  const newMatricule = await generateMatricule('student');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter((k) => allData[k] !== null && allData[k] !== undefined);
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
  const existingTeacher = await getQuery('SELECT id FROM teachers WHERE national_id = ?', [
    data.national_id,
  ]);
  if (existingTeacher) {
    return { success: false, message: `المعلم برقم الهوية "${data.national_id}" موجود بالفعل.` };
  }

  const newMatricule = await generateMatricule('teacher');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter((k) => allData[k] !== null && allData[k] !== undefined);
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

  if (!data.username || !data.first_name || !data.last_name || !data.role || !data.employment_type) {
    return { success: false, message: 'اسم المستخدم، الاسم الأول، اللقب، الدور، ونوع التوظيف هي حقول مطلوبة.' };
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

  const allFields = Object.keys(allData).filter((k) => allData[k] !== null && allData[k] !== undefined);
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);

  await runQuery(`INSERT INTO users (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true, newUser: { username: data.username, password } };
}

async function processClassRow(row, headerRow) {
  const teacherMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للمعلم'))?.value;
  if (!teacherMatricule) return { success: false, message: 'الرقم التعريفي للمعلم مطلوب.' };
  const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [teacherMatricule]);
  if (!teacher) {
    return { success: false, message: `لم يتم العثور على معلم بالرقم التعريفي "${teacherMatricule}".` };
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
    return { success: false, message: `لم يتم العثور على طالب بالرقم التعريفي "${studentMatricule}".` };
  }
  const data = {
    student_id: student.id,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    payment_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الدفع (YYYY-MM-DD)')).value,
    payment_method: row.getCell(getColumnIndex(headerRow, 'طريقة الدفع')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  if (!data.amount || !data.payment_date) return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO payments (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processSalaryRow(row, headerRow) {
  const teacherMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للمعلم'))?.value;
  if (!teacherMatricule) return { success: false, message: 'الرقم التعريفي للمعلم مطلوب.' };
  const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [teacherMatricule]);
  if (!teacher) {
    return { success: false, message: `لم يتم العثور على معلم بالرقم التعريفي "${teacherMatricule}".` };
  }
  const data = {
    teacher_id: teacher.id,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    payment_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الدفع (YYYY-MM-DD)')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  if (!data.amount || !data.payment_date) return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO salaries (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processDonationRow(row, headerRow) {
  const data = {
    donor_name: row.getCell(getColumnIndex(headerRow, 'اسم المتبرع')).value,
    donation_type: row.getCell(getColumnIndex(headerRow, 'نوع التبرع (Cash/In-kind)')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ (للتبرع النقدي)')).value,
    description: row.getCell(getColumnIndex(headerRow, 'وصف (للتبرع العيني)')).value,
    donation_date: row.getCell(getColumnIndex(headerRow, 'تاريخ التبرع (YYYY-MM-DD)')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };
  if (!data.donor_name || !data.donation_type || !data.donation_date) return { success: false, message: 'اسم المتبرع، نوع التبرع، وتاريخ التبرع هي حقول مطلوبة.' };
  if (data.donation_type === 'Cash' && !data.amount) return { success: false, message: 'المبلغ مطلوب للتبرعات النقدية.' };
  if (data.donation_type === 'In-kind' && !data.description) return { success: false, message: 'الوصف مطلوب للتبرعات العينية.' };
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
    expense_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الصرف (YYYY-MM-DD)')).value,
    responsible_person: row.getCell(getColumnIndex(headerRow, 'المسؤول')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
  };
  if (!data.category || !data.amount || !data.expense_date) return { success: false, message: 'الفئة، المبلغ، وتاريخ الصرف هي حقول مطلوبة.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO expenses (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processAttendanceRow(row, headerRow) {
  const studentMatricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي للطالب'))?.value;
  const className = row.getCell(getColumnIndex(headerRow, 'اسم الفصل')).value;
  if (!studentMatricule || !className) {
    return { success: false, message: 'الرقم التعريفي للطالب واسم الفصل مطلوبان.' };
  }
  const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [studentMatricule]);
  if (!student) {
    return { success: false, message: `لم يتم العثور على طالب بالرقم التعريفي "${studentMatricule}".` };
  }
  const classData = await getQuery('SELECT id FROM classes WHERE name = ?', [className]);
  if (!classData) return { success: false, message: `لم يتم العثور على فصل باسم "${className}".` };
  const data = {
    student_id: student.id,
    class_id: classData.id,
    date: row.getCell(getColumnIndex(headerRow, 'التاريخ (YYYY-MM-DD)')).value,
    status: row.getCell(getColumnIndex(headerRow, 'الحالة (present/absent/late/excused)')).value,
  };
  if (!data.date || !data.status) return { success: false, message: 'التاريخ والحالة مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
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
