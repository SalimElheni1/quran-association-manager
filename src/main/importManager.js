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

const COLUMN_MAPPINGS = {
  students: {
    displayName: 'الطلاب',
    sheetNamePatterns: ['الطلاب', 'students', 'student data', 'طلاب'],
    columns: {
      name: { aliases: ['الاسم واللقب', 'Full Name', 'Name'], required: true },
      matricule: { aliases: ['الرقم التعريفي', 'Matricule', 'ID'], required: false },
      date_of_birth: { aliases: ['تاريخ الميلاد', 'Date of Birth'], required: false },
      gender: { aliases: ['الجنس', 'Gender'], required: false },
      address: { aliases: ['العنوان', 'Address'], required: false },
      contact_info: { aliases: ['رقم الهاتف', 'Contact Info', 'Phone'], required: false },
      email: { aliases: ['البريد الإلكتروني', 'Email'], required: false },
      status: { aliases: ['الحالة', 'Status'], required: false },
      national_id: { aliases: ['رقم الهوية', 'National ID'], required: false },
    },
  },
  teachers: {
    displayName: 'المعلمون',
    sheetNamePatterns: ['المعلمون', 'teachers', 'teacher data'],
    columns: {
      name: { aliases: ['الاسم واللقب', 'Full Name', 'Name'], required: true },
      matricule: { aliases: ['الرقم التعريفي', 'Matricule', 'ID'], required: false },
      national_id: { aliases: ['رقم الهوية', 'National ID'], required: false },
      contact_info: { aliases: ['رقم الهاتف', 'Contact Info', 'Phone'], required: false },
      email: { aliases: ['البريد الإلكتروني', 'Email'], required: false },
    },
  },
  users: {
    displayName: 'المستخدمون',
    sheetNamePatterns: ['المستخدمون', 'users', 'user data'],
    columns: {
      username: { aliases: ['اسم المستخدم', 'Username'], required: true },
      matricule: { aliases: ['الرقم التعريفي', 'Matricule', 'ID'], required: false },
      first_name: { aliases: ['الاسم الأول', 'First Name'], required: true },
      last_name: { aliases: ['اللقب', 'Last Name'], required: true },
      role: { aliases: ['الدور', 'Role'], required: true },
      employment_type: { aliases: ['نوع التوظيف', 'Employment Type'], required: true },
    },
  },
  classes: {
    displayName: 'الفصول',
    sheetNamePatterns: ['الفصول', 'classes', 'class data'],
    columns: {
      name: { aliases: ['اسم الفصل', 'Class Name'], required: true },
      teacher_matricule: { aliases: ['الرقم التعريفي للمعلم', "Teacher's ID"], required: true },
      class_type: { aliases: ['نوع الفصل', 'Class Type'], required: false },
      schedule: { aliases: ['الجدول الزمني (JSON)', 'Schedule (JSON)'], required: false },
      start_date: { aliases: ['تاريخ البدء', 'Start Date'], required: false },
      end_date: { aliases: ['تاريخ الانتهاء', 'End Date'], required: false },
      status: { aliases: ['الحالة', 'Status'], required: false },
      capacity: { aliases: ['السعة', 'Capacity'], required: false },
      gender: { aliases: ['الجنس', 'Gender'], required: false },
    },
  },
  payments: {
    displayName: 'الرسوم الدراسية',
    sheetNamePatterns: ['الرسوم الدراسية', 'payments', 'fees'],
    columns: {
      student_matricule: { aliases: ['الرقم التعريفي للطالب', "Student's ID"], required: true },
      amount: { aliases: ['المبلغ', 'Amount'], required: true },
      payment_date: { aliases: ['تاريخ الدفع (YYYY-MM-DD)', 'Payment Date'], required: true },
      payment_method: { aliases: ['طريقة الدفع', 'Payment Method'], required: false },
      notes: { aliases: ['ملاحظات', 'Notes'], required: false },
    },
  },
  salaries: {
    displayName: 'الرواتب',
    sheetNamePatterns: ['الرواتب', 'salaries'],
    columns: {
      teacher_matricule: { aliases: ['الرقم التعريفي للمعلم', "Teacher's ID"], required: true },
      amount: { aliases: ['المبلغ', 'Amount'], required: true },
      payment_date: { aliases: ['تاريخ الدفع (YYYY-MM-DD)', 'Payment Date'], required: true },
      notes: { aliases: ['ملاحظات', 'Notes'], required: false },
    },
  },
  donations: {
    displayName: 'التبرعات',
    sheetNamePatterns: ['التبرعات', 'donations'],
    columns: {
      donor_name: { aliases: ['اسم المتبرع', 'Donor Name'], required: true },
      donation_type: { aliases: ['نوع التبرع (Cash/In-kind)', 'Donation Type'], required: true },
      amount: { aliases: ['المبلغ (للتبرع النقدي)', 'Amount (Cash)'], required: false },
      description: { aliases: ['وصف (للتبرع العيني)', 'Description (In-kind)'], required: false },
      donation_date: { aliases: ['تاريخ التبرع (YYYY-MM-DD)', 'Donation Date'], required: true },
      notes: { aliases: ['ملاحظات', 'Notes'], required: false },
    },
  },
  expenses: {
    displayName: 'المصاريف',
    sheetNamePatterns: ['المصاريف', 'expenses'],
    columns: {
      category: { aliases: ['الفئة', 'Category'], required: true },
      amount: { aliases: ['المبلغ', 'Amount'], required: true },
      expense_date: { aliases: ['تاريخ الصرف (YYYY-MM-DD)', 'Expense Date'], required: true },
      responsible_person: { aliases: ['المسؤول', 'Responsible Person'], required: false },
      description: { aliases: ['الوصف', 'Description'], required: false },
    },
  },
  attendance: {
    displayName: 'الحضور',
    sheetNamePatterns: ['الحضور', 'الحاضر', 'attendance', 'attendees'],
    columns: {
      student_matricule: { aliases: ['الرقم التعريفي للطالب', "Student's ID"], required: true },
      class_name: { aliases: ['اسم الفصل', 'Class Name'], required: true },
      date: { aliases: ['التاريخ (YYYY-MM-DD)', 'Date'], required: true },
      status: {
        aliases: ['الحالة (present/absent/late/excused)', 'Status'],
        required: true,
      },
    },
  },
};

function detectImportType(sheetName) {
  const normalizedSheetName = sheetName.trim().toLowerCase();
  for (const [typeKey, config] of Object.entries(COLUMN_MAPPINGS)) {
    for (const pattern of config.sheetNamePatterns) {
      if (normalizedSheetName.includes(pattern.toLowerCase())) {
        return typeKey;
      }
    }
  }
  return null;
}

async function analyzeImportFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const analysis = { sheets: {} };
  const allPossibleSheetNames = Object.values(COLUMN_MAPPINGS)
    .map((c) => c.sheetNamePatterns.join(', '))
    .join(' | ');

  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name;
    const detectedType = detectImportType(sheetName);

    if (!detectedType) {
      logWarn(`No import type detected for sheet: ${sheetName}`);
      analysis.sheets[sheetName] = {
        status: 'unrecognized',
        errorMessage: `لم يتم التعرّف على نوع الورقة '${sheetName}'. يرجى التأكد من أن اسم الورقة يطابق أحد الأنواع المدعومة: ${allPossibleSheetNames}`,
      };
      return;
    }

    const mappingConfig = COLUMN_MAPPINGS[detectedType].columns;
    const headerRow = worksheet.getRow(1); // Headers are now in the first row
    if (headerRow.actualCellCount < 2) {
      analysis.sheets[sheetName] = {
        status: 'unrecognized',
        errorMessage: `تحتوي ورقة '${sheetName}' على أقل من عمودين. يرجى التأكد من أن الملف يحتوي على البيانات الصحيحة.`,
      };
      return;
    }
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers.push({ value: cell.value, index: colNumber });
    });

    const suggestedMapping = {};
    const warnings = [];
    // Find mapping for each DB field
    for (const [dbField, config] of Object.entries(mappingConfig)) {
      let found = false;
      for (const alias of config.aliases) {
        const header = headers.find(
          (h) => h && h.value && h.value.toString().trim() === alias,
        );
        if (header) {
          suggestedMapping[dbField] = header.index;
          found = true;
          break; // Found an alias, move to the next dbField
        }
      }
      if (!found && config.required) {
        warnings.push(
          `لم يتم العثور على العمود المطلوب لـ "${
            config.aliases[0]
          }". الرجاء مطابقته يدويًا.`,
        );
      }
    }

    analysis.sheets[sheetName] = {
      status: 'recognized',
      detectedType,
      headers: headers.filter((h) => h.value), // only non-empty headers
      suggestedMapping,
      warnings,
      rowCount: worksheet.rowCount - 1, // Exclude header row
    };
  });

  return analysis;
}

async function processImport(filePath, confirmedMappings) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const results = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };

  const processors = {
    students: processStudentRow,
    teachers: processTeacherRow,
    users: processUserRow,
    classes: processClassRow,
    payments: processPaymentRow,
    salaries: processSalaryRow,
    donations: processDonationRow,
    expenses: processExpenseRow,
    attendance: processAttendanceRow,
  };

  for (const sheetName in confirmedMappings) {
    if (!Object.prototype.hasOwnProperty.call(confirmedMappings, sheetName)) continue;

    const worksheet = workbook.getWorksheet(sheetName);
    const mappingInfo = confirmedMappings[sheetName]; // This now contains { type, mapping }
    if (!mappingInfo || !mappingInfo.type || !mappingInfo.mapping) {
      logWarn(`Skipping sheet: ${sheetName} due to invalid mapping info.`);
      continue;
    }

    const { type: importType, mapping } = mappingInfo;
    const processor = processors[importType];

    if (!worksheet || !processor) {
      logWarn(`Skipping sheet: ${sheetName} due to missing worksheet or processor.`);
      continue;
    }

    for (let i = 2; i <= worksheet.rowCount; i++) { // Data starts from row 2
      const row = worksheet.getRow(i);
      if (!row.hasValues) continue;
      try {
        const result = await processor(row, mapping);
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

    // This loop is now handled by the one above it.
  }

  return results;
}

async function processStudentRow(row, mapping) {
  const matricule = row.getCell(mapping.matricule)?.value;

  const data = {
    name: row.getCell(mapping.name)?.value,
    date_of_birth: row.getCell(mapping.date_of_birth)?.value,
    gender: row.getCell(mapping.gender)?.value,
    address: row.getCell(mapping.address)?.value,
    contact_info: row.getCell(mapping.contact_info)?.value,
    email: row.getCell(mapping.email)?.value?.text || row.getCell(mapping.email)?.value,
    status: row.getCell(mapping.status)?.value,
    national_id: row.getCell(mapping.national_id)?.value,
  };

  if (!data.name) return { success: false, message: 'اسم الطالب مطلوب.' };

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    const existingStudent = await getQuery('SELECT id FROM students WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingStudent) {
      return { success: false, message: `الطالب بالرقم التعريفي "${matricule}" غير موجود.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE students SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }

  const existingStudent = await getQuery(
    'SELECT id FROM students WHERE name = ? OR national_id = ?',
    [data.name, data.national_id],
  );
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

async function processTeacherRow(row, mapping) {
  const matricule = row.getCell(mapping.matricule)?.value;
  const data = {
    name: row.getCell(mapping.name)?.value,
    national_id: row.getCell(mapping.national_id)?.value,
    contact_info: row.getCell(mapping.contact_info)?.value,
    email: row.getCell(mapping.email)?.value?.text || row.getCell(mapping.email)?.value,
  };

  if (!data.name) return { success: false, message: 'اسم المعلم مطلوب.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    const existingTeacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [
      matricule,
    ]);
    if (!existingTeacher) {
      return { success: false, message: `المعلم بالرقم التعريفي "${matricule}" غير موجود.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE teachers SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }

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
}

async function processUserRow(row, mapping) {
  const matricule = row.getCell(mapping.matricule)?.value;
  const data = {
    username: row.getCell(mapping.username)?.value,
    first_name: row.getCell(mapping.first_name)?.value,
    last_name: row.getCell(mapping.last_name)?.value,
    role: row.getCell(mapping.role)?.value,
    employment_type: row.getCell(mapping.employment_type)?.value,
  };

  if (!data.username || !data.first_name || !data.last_name || !data.role || !data.employment_type) {
    return { success: false, message: 'اسم المستخدم، الاسم الأول، اللقب، الدور، ونوع التوظيف هي حقول مطلوبة.' };
  }
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    const existingUser = await getQuery('SELECT id FROM users WHERE matricule = ?', [matricule]);
    if (!existingUser) {
      return { success: false, message: `المستخدم بالرقم التعريفي "${matricule}" غير موجود.` };
    }
    if (fields.length === 0) return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE users SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }

  const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', [data.username]);
  if (existingUser) {
    return { success: false, message: `المستخدم "${data.username}" موجود بالفعل.` };
  }

  const password = Math.random().toString(36).slice(-8);
  const newMatricule = await generateMatricule('user');
  const allData = { ...data, matricule: newMatricule, password: bcrypt.hashSync(password, 10) };
  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO users (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true, newUser: { username: data.username, password } };
}

async function processClassRow(row, mapping) {
  const teacherMatricule = row.getCell(mapping.teacher_matricule)?.value;
  if (!teacherMatricule) return { success: false, message: 'الرقم التعريفي للمعلم مطلوب.' };
  const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [teacherMatricule]);
  if (!teacher) {
    return { success: false, message: `لم يتم العثور على معلم بالرقم التعريفي "${teacherMatricule}".` };
  }
  const data = {
    name: row.getCell(mapping.name)?.value,
    teacher_id: teacher.id,
    class_type: row.getCell(mapping.class_type)?.value,
    schedule: row.getCell(mapping.schedule)?.value,
    start_date: row.getCell(mapping.start_date)?.value,
    end_date: row.getCell(mapping.end_date)?.value,
    status: row.getCell(mapping.status)?.value,
    capacity: row.getCell(mapping.capacity)?.value,
    gender: row.getCell(mapping.gender)?.value,
  };
  if (!data.name) return { success: false, message: 'اسم الفصل مطلوب.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO classes (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processPaymentRow(row, mapping) {
  const studentMatricule = row.getCell(mapping.student_matricule)?.value;
  if (!studentMatricule) return { success: false, message: 'الرقم التعريفي للطالب مطلوب.' };
  const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [studentMatricule]);
  if (!student) {
    return { success: false, message: `لم يتم العثور على طالب بالرقم التعريفي "${studentMatricule}".` };
  }
  const data = {
    student_id: student.id,
    amount: row.getCell(mapping.amount)?.value,
    payment_date: row.getCell(mapping.payment_date)?.value,
    payment_method: row.getCell(mapping.payment_method)?.value,
    notes: row.getCell(mapping.notes)?.value,
  };
  if (!data.amount || !data.payment_date)
    return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO payments (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processSalaryRow(row, mapping) {
  const teacherMatricule = row.getCell(mapping.teacher_matricule)?.value;
  if (!teacherMatricule) return { success: false, message: 'الرقم التعريفي للمعلم مطلوب.' };
  const teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [teacherMatricule]);
  if (!teacher) {
    return { success: false, message: `لم يتم العثور على معلم بالرقم التعريفي "${teacherMatricule}".` };
  }
  const data = {
    teacher_id: teacher.id,
    amount: row.getCell(mapping.amount)?.value,
    payment_date: row.getCell(mapping.payment_date)?.value,
    notes: row.getCell(mapping.notes)?.value,
  };
  if (!data.amount || !data.payment_date)
    return { success: false, message: 'المبلغ وتاريخ الدفع مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO salaries (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processDonationRow(row, mapping) {
  const data = {
    donor_name: row.getCell(mapping.donor_name)?.value,
    donation_type: row.getCell(mapping.donation_type)?.value,
    amount: row.getCell(mapping.amount)?.value,
    description: row.getCell(mapping.description)?.value,
    donation_date: row.getCell(mapping.donation_date)?.value,
    notes: row.getCell(mapping.notes)?.value,
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

async function processExpenseRow(row, mapping) {
  const data = {
    category: row.getCell(mapping.category)?.value,
    amount: row.getCell(mapping.amount)?.value,
    expense_date: row.getCell(mapping.expense_date)?.value,
    responsible_person: row.getCell(mapping.responsible_person)?.value,
    description: row.getCell(mapping.description)?.value,
  };
  if (!data.category || !data.amount || !data.expense_date)
    return { success: false, message: 'الفئة، المبلغ، وتاريخ الصرف هي حقول مطلوبة.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO expenses (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processAttendanceRow(row, mapping) {
  const studentMatricule = row.getCell(mapping.student_matricule)?.value;
  const className = row.getCell(mapping.class_name)?.value;
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
    date: row.getCell(mapping.date)?.value,
    status: row.getCell(mapping.status)?.value,
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
  analyzeImportFile,
  processImport,
  COLUMN_MAPPINGS,
};
