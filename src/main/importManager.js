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
  allQuery,
} = require('../db/db');
const bcrypt = require('bcryptjs');
const { generateMatricule } = require('./services/matriculeService');
const { setDbSalt } = require('./keyManager');
const { getAvailableSheets, getSheetInfo } = require('./importConstants');

const mainStore = new Store();

async function executeSqlScriptSafely(sqlScript) {
  // Get current database tables
  const tables = await allQuery(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const existingTables = new Set(tables.map((t) => t.name));

  // Split SQL script into individual statements
  const statements = sqlScript
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  const validStatements = [];
  const skippedTables = new Set();

  for (const statement of statements) {
    // Extract table name from REPLACE INTO or INSERT statements
    const match = statement.match(
      /(?:REPLACE|INSERT)\s+(?:OR\s+REPLACE\s+)?INTO\s+["']?([^\s"']+)["']?/i,
    );
    if (match) {
      const tableName = match[1];
      if (existingTables.has(tableName)) {
        validStatements.push(statement);
      } else {
        skippedTables.add(tableName);
      }
    } else {
      // Non-INSERT/REPLACE statements (like CREATE, etc.) - execute as-is
      validStatements.push(statement);
    }
  }

  if (skippedTables.size > 0) {
    logWarn(`Skipped data for non-existent tables: ${Array.from(skippedTables).join(', ')}`);
  }

  // Execute valid statements
  const finalScript = validStatements.join(';\n');
  if (finalScript.trim()) {
    await dbExec(getDb(), finalScript);
  }
}

async function validateDatabaseFile(filePath) {
  try {
    const zipFileContent = await fs.readFile(filePath);
    const zip = new PizZip(zipFileContent);
    const sqlFile = zip.file('backup.sql');
    let configFile = zip.file('salt.json'); // Legacy: 'config.json'
    if (!configFile) {
      configFile = zip.file('config.json');
    }
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
    log('Processing SQL script to import data...');
    await executeSqlScriptSafely(sqlScript);
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
  'العمليات المالية': ['النوع', 'الفئة', 'المبلغ', 'التاريخ', 'طريقة الدفع'],
  الحضور: ['الرقم التعريفي للطالب', 'اسم الفصل', 'التاريخ', 'الحالة'],
  المجموعات: ['اسم المجموعة', 'الفئة'],
  المخزون: ['اسم العنصر', 'الفئة', 'الكمية', 'قيمة الوحدة'],
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
    'العمليات المالية': processTransactionRow,
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
      if (selectedSheets && selectedSheets.includes(sheetName)) {
        logWarn(`Sheet "${sheetName}" selected for import but not found in the Excel file.`);
      }
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

async function processStudentRow(row, headerRow) {
  const genderAr = row.getCell(getColumnIndex(headerRow, 'الجنس'))?.value;
  if (genderAr) {
    row.getCell(getColumnIndex(headerRow, 'الجنس')).value =
      GENDER_MAP_AR_TO_EN[genderAr] || genderAr;
  }
  const statusAr = row.getCell(getColumnIndex(headerRow, 'الحالة'))?.value;
  if (statusAr) {
    row.getCell(getColumnIndex(headerRow, 'الحالة')).value =
      STATUS_MAP_AR_TO_EN[statusAr] || statusAr;
  }

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
}

async function processTeacherRow(row, headerRow) {
  const genderAr = row.getCell(getColumnIndex(headerRow, 'الجنس'))?.value;
  if (genderAr) {
    const mappedGender = GENDER_MAP_AR_TO_EN[genderAr] || genderAr;
    row.getCell(getColumnIndex(headerRow, 'الجنس')).value = mappedGender;
  }

  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  const data = {
    name: row.getCell(getColumnIndex(headerRow, 'الاسم واللقب')).value,
    national_id: row.getCell(getColumnIndex(headerRow, 'رقم الهوية')).value,
    contact_info: row.getCell(getColumnIndex(headerRow, 'رقم الهاتف')).value,
    email: row.getCell(getColumnIndex(headerRow, 'البريد الإلكتروني')).value?.text,
    gender: row.getCell(getColumnIndex(headerRow, 'الجنس')).value,
    address: row.getCell(getColumnIndex(headerRow, 'العنوان')).value,
    date_of_birth: row.getCell(getColumnIndex(headerRow, 'تاريخ الميلاد')).value,
    educational_level: row.getCell(getColumnIndex(headerRow, 'المستوى التعليمي')).value,
    specialization: row.getCell(getColumnIndex(headerRow, 'التخصص')).value,
    years_of_experience: row.getCell(getColumnIndex(headerRow, 'سنوات الخبرة')).value,
    availability: row.getCell(getColumnIndex(headerRow, 'أوقات التوفر')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
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
}

async function processUserRow(row, headerRow) {
  const matricule = row.getCell(getColumnIndex(headerRow, 'الرقم التعريفي'))?.value;

  // Get the role from the template (might be in English)
  const roleValue = row.getCell(getColumnIndex(headerRow, 'الدور'))?.value;
  // Map common role names to database format if needed
  const roleMappings = {
    Superadmin: 'Superadmin',
    Administrator: 'Administrator',
    FinanceManager: 'FinanceManager',
    SessionSupervisor: 'SessionSupervisor',
    Manager: 'Administrator', // Fallback mapping for template
    مدير: 'Administrator',
    محاسب: 'FinanceManager',
  };

  const mappedRole = roleMappings[roleValue] || roleValue;

  const data = {
    username: row.getCell(getColumnIndex(headerRow, 'اسم المستخدم')).value,
    first_name: row.getCell(getColumnIndex(headerRow, 'الاسم الأول')).value,
    last_name: row.getCell(getColumnIndex(headerRow, 'اللقب')).value,
    employment_type: row.getCell(getColumnIndex(headerRow, 'نوع التوظيف')).value,
  };

  if (
    !data.username ||
    !data.first_name ||
    !data.last_name ||
    !mappedRole ||
    !data.employment_type
  ) {
    return {
      success: false,
      message: 'اسم المستخدم، الاسم الأول، اللقب، الدور، ونوع التوظيف هي حقول مطلوبة.',
    };
  }

  if (matricule) {
    // Update existing record - need to handle user roles
    const existingUser = await getQuery('SELECT id FROM users WHERE matricule = ?', [matricule]);
    if (!existingUser) {
      return { success: false, message: `المستخدم بالرقم التعريفي "${matricule}" غير موجود.` };
    }

    await runQuery('BEGIN TRANSACTION');

    try {
      // Update basic user data
      const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
      if (fields.length > 0) {
        const setClauses = fields.map((field) => `${field} = ?`).join(', ');
        const values = [...fields.map((k) => data[k]), matricule];
        await runQuery(`UPDATE users SET ${setClauses} WHERE matricule = ?`, values);
      }

      // Update roles - remove existing and add new
      await runQuery('DELETE FROM user_roles WHERE user_id = ?', [existingUser.id]);

      // Get role ID and assign
      const roleRecord = await getQuery('SELECT id FROM roles WHERE name = ?', [mappedRole]);
      if (roleRecord) {
        await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
          existingUser.id,
          roleRecord.id,
        ]);
      }

      await runQuery('COMMIT');
      return { success: true };
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }
  }

  // Insert new record
  const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', [data.username]);
  if (existingUser) {
    return { success: false, message: `المستخدم "${data.username}" موجود بالفعل.` };
  }

  const password = Math.random().toString(36).slice(-8);
  const newMatricule = await generateMatricule('user');

  await runQuery('BEGIN TRANSACTION');

  try {
    // Insert main user record
    const allFields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
    const userFields = [...allFields, 'matricule', 'password'];
    const placeholders = userFields.map(() => '?').join(', ');
    const values = [...allFields.map((k) => data[k]), newMatricule, bcrypt.hashSync(password, 10)];

    const result = await runQuery(
      `INSERT INTO users (${userFields.join(', ')}) VALUES (${placeholders})`,
      values,
    );

    // Assign role
    const roleRecord = await getQuery('SELECT id FROM roles WHERE name = ?', [mappedRole]);
    if (roleRecord) {
      await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
        result.id,
        roleRecord.id,
      ]);
    }

    await runQuery('COMMIT');
    return { success: true, newUser: { username: data.username, password } };
  } catch (error) {
    await runQuery('ROLLBACK');
    throw error;
  }
}

async function processClassRow(row, headerRow) {
  const teacherMatriculeIndex = getColumnIndex(headerRow, 'معرف المعلم');
  if (teacherMatriculeIndex === -1)
    return { success: false, message: 'عمود معرف المعلم غير موجود.' };

  const teacherMatricule = row.getCell(teacherMatriculeIndex)?.value;
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

async function processTransactionRow(row, headerRow) {
  // Arabic translations for transaction types and payment methods
  const TRANSACTION_TYPE_MAP = {
    مدخول: 'INCOME',
    مصروف: 'EXPENSE',
    إيراد: 'INCOME',
    مصاريف: 'EXPENSE',
  };

  const PAYMENT_METHOD_MAP = {
    نقدي: 'CASH',
    شيك: 'CHECK',
    تحويل: 'TRANSFER',
    'تحويل بنكي': 'TRANSFER',
  };

  // Map old category names to new ones
  const CATEGORY_MAP = {
    'رواتب المعلمين': 'منح ومرتبات',
    'رواتب الإداريين': 'منح ومرتبات',
    'الإيجار': 'كراء وفواتير',
    'الكهرباء والماء': 'كراء وفواتير',
    'القرطاسية': 'لوازم مكتبية وصيانة',
    'الصيانة': 'لوازم مكتبية وصيانة',
    'مصاريف أخرى': 'نفقات متنوعة',
  };

  // Get data
  const rawType = row.getCell(getColumnIndex(headerRow, 'النوع')).value;
  const rawCategory = row.getCell(getColumnIndex(headerRow, 'الفئة')).value;
  const rawPaymentMethod = row.getCell(getColumnIndex(headerRow, 'طريقة الدفع')).value;

  const data = {
    type: TRANSACTION_TYPE_MAP[rawType] || rawType,
    category: CATEGORY_MAP[rawCategory] || rawCategory,
    receipt_type: row.getCell(getColumnIndex(headerRow, 'نوع الوصل')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    transaction_date: row.getCell(getColumnIndex(headerRow, 'التاريخ')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
    payment_method: PAYMENT_METHOD_MAP[rawPaymentMethod] || rawPaymentMethod,
    check_number: row.getCell(getColumnIndex(headerRow, 'رقم الشيك')).value,
    voucher_number: row.getCell(getColumnIndex(headerRow, 'رقم الوصل')).value,
    related_person_name: row.getCell(getColumnIndex(headerRow, 'اسم الشخص')).value,
  };

  // Validation
  if (
    !data.type ||
    !data.category ||
    !data.amount ||
    !data.transaction_date ||
    !data.payment_method
  )
    return { success: false, message: 'النوع، الفئة، المبلغ، التاريخ، وطريقة الدفع مطلوبة.' };

  // Validate transaction type
  if (!['INCOME', 'EXPENSE'].includes(data.type)) {
    return {
      success: false,
      message: 'النوع يجب أن يكون مدخول أو مصروف (أو إيراد أو مصاريف)',
    };
  }

  // Validate category exists in database
  const validCategories = await allQuery(
    'SELECT name FROM categories WHERE type = ? AND is_active = 1',
    [data.type === 'INCOME' ? 'INCOME' : 'EXPENSE'],
  );
  const categoryNames = validCategories.map((cat) => cat.name);

  if (!categoryNames.includes(data.category)) {
    return {
      success: false,
      message: `الفئة "${data.category}" غير موجودة في قاعدة البيانات. الفئات الصالحة: ${categoryNames.join(', ')}`,
    };
  }

  // Validate receipt type for cash donations
  const VALID_RECEIPT_TYPES = ['تبرع', 'هبة', 'صدقة', 'زكاة'];

  if (data.category === 'التبرعات النقدية' && !data.receipt_type) {
    return { success: false, message: 'نوع الوصل مطلوب للتبرعات النقدية.' };
  }

  if (data.receipt_type && !VALID_RECEIPT_TYPES.includes(data.receipt_type)) {
    return {
      success: false,
      message: `نوع الوصل غير صالح. الأنواع الصالحة: ${VALID_RECEIPT_TYPES.join(', ')}`,
    };
  }

  // Validate payment method
  if (!['CASH', 'CHECK', 'TRANSFER'].includes(data.payment_method)) {
    return {
      success: false,
      message: 'طريقة الدفع يجب أن تكون نقدي، شيك، أو تحويل (بنكي)',
    };
  }

  // 500 TND rule - Arabic translation
  if (data.amount > 500 && data.payment_method === 'CASH')
    return {
      success: false,
      message: 'المبالغ التي تتجاوز 500 دينار يجب أن تكون عبر شيك أو تحويل بنكي.',
    };

  // Generate matricule
  const year = new Date(data.transaction_date).getFullYear();
  const prefix = data.type === 'INCOME' ? 'I' : 'E';
  const lastTransaction = await getQuery(
    `SELECT matricule FROM transactions WHERE type = ? AND matricule LIKE ? ORDER BY id DESC LIMIT 1`,
    [data.type, `${prefix}-${year}-%`],
  );
  let sequence = 1;
  if (lastTransaction?.matricule) {
    const lastSeq = parseInt(lastTransaction.matricule.split('-')[2]);
    sequence = lastSeq + 1;
  }
  const matricule = `${prefix}-${year}-${sequence.toString().padStart(3, '0')}`;

  // Generate voucher number ONLY if not provided (user's request)
  if (!data.voucher_number) {
    const { generateVoucherNumber } = require('./services/voucherService');
    data.voucher_number = await generateVoucherNumber();
  }

  await runQuery('BEGIN TRANSACTION;');
  try {
    const sql = `INSERT INTO transactions (
      matricule, type, category, receipt_type, amount, transaction_date, description,
      payment_method, check_number, voucher_number, account_id, related_person_name,
      requires_dual_signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`;

    await runQuery(sql, [
      matricule,
      data.type,
      data.category,
      data.receipt_type || null,
      data.amount,
      data.transaction_date,
      data.description || null,
      data.payment_method,
      data.check_number || null,
      data.voucher_number,
      data.related_person_name || null,
      data.amount > 500 ? 1 : 0,
    ]);

    const adjustment = data.type === 'INCOME' ? data.amount : -data.amount;
    await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = 1', [
      adjustment,
    ]);

    await runQuery('COMMIT;');
    return { success: true };
  } catch (error) {
    await runQuery('ROLLBACK;');
    throw error;
  }
}

async function processAttendanceRow(row, headerRow) {
  const statusAr = row.getCell(getColumnIndex(headerRow, 'الحالة'))?.value;
  if (statusAr) {
    row.getCell(getColumnIndex(headerRow, 'الحالة')).value =
      ATTENDANCE_MAP_AR_TO_EN[statusAr] || statusAr;
  }

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
}

async function processGroupRow(row, headerRow) {
  const matriculeIndex = getColumnIndex(headerRow, 'الرقم التعريفي');
  const nameIndex = getColumnIndex(headerRow, 'اسم المجموعة');
  const descriptionIndex = getColumnIndex(headerRow, 'الوصف');
  const categoryIndex = getColumnIndex(headerRow, 'الفئة');

  if (nameIndex === -1 || categoryIndex === -1) {
    return { success: false, message: 'عمود اسم المجموعة أو الفئة غير موجود.' };
  }

  const matricule = matriculeIndex !== -1 ? row.getCell(matriculeIndex)?.value : null;

  const data = {
    name: row.getCell(nameIndex).value,
    description: descriptionIndex !== -1 ? row.getCell(descriptionIndex).value : null,
    category: row.getCell(categoryIndex).value,
  };

  if (!data.name || !data.category) {
    return { success: false, message: 'اسم المجموعة والفئة مطلوبان.' };
  }

  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

  if (matricule) {
    // Update existing record
    const existingGroup = await getQuery('SELECT id FROM groups WHERE matricule = ?', [matricule]);
    if (!existingGroup) {
      return { success: false, message: `المجموعة بالرقم التعريفي "${matricule}" غير موجودة.` };
    }

    if (fields.length === 0) {
      return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
    }

    const setClauses = fields.map((field) => `${field} = ?`).join(', ');
    const values = [...fields.map((k) => data[k]), matricule];
    await runQuery(`UPDATE groups SET ${setClauses} WHERE matricule = ?`, values);
    return { success: true };
  }

  // Insert new record
  const existingGroup = await getQuery('SELECT id FROM groups WHERE name = ?', [data.name]);
  if (existingGroup) {
    return { success: false, message: `المجموعة "${data.name}" موجودة بالفعل.` };
  }

  const newMatricule = await generateMatricule('group');
  const allData = { ...data, matricule: newMatricule };

  const allFields = Object.keys(allData).filter(
    (k) => allData[k] !== null && allData[k] !== undefined,
  );
  const placeholders = allFields.map(() => '?').join(', ');
  const values = allFields.map((k) => allData[k]);
  await runQuery(`INSERT INTO groups (${allFields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processInventoryRow(row, headerRow) {
  const conditionMap = {
    جديد: 'New',
    جيد: 'Good',
    مقبول: 'Fair',
    رديء: 'Poor',
  };

  const data = {
    item_name: row.getCell(getColumnIndex(headerRow, 'اسم العنصر')).value,
    category: row.getCell(getColumnIndex(headerRow, 'الفئة')).value,
    quantity: row.getCell(getColumnIndex(headerRow, 'الكمية')).value,
    unit_value: row.getCell(getColumnIndex(headerRow, 'قيمة الوحدة')).value,
    acquisition_date: row.getCell(getColumnIndex(headerRow, 'تاريخ الاقتناء')).value,
    acquisition_source: row.getCell(getColumnIndex(headerRow, 'مصدر الاقتناء')).value,
    condition_status: row.getCell(getColumnIndex(headerRow, 'الحالة')).value,
    location: row.getCell(getColumnIndex(headerRow, 'موقع التخزين')).value,
    notes: row.getCell(getColumnIndex(headerRow, 'ملاحظات')).value,
  };

  if (
    !data.item_name ||
    !data.category ||
    data.quantity === null ||
    data.quantity === undefined ||
    !data.unit_value
  ) {
    return { success: false, message: 'اسم العنصر، الفئة، الكمية، وقيمة الوحدة مطلوبة.' };
  }

  // Check if item already exists
  const existingItem = await getQuery(
    'SELECT id FROM inventory_items WHERE item_name = ? COLLATE NOCASE',
    [data.item_name],
  );
  if (existingItem) {
    return { success: false, message: `العنصر "${data.item_name}" موجود بالفعل في المخزون.` };
  }

  if (data.condition_status && conditionMap[data.condition_status]) {
    data.condition_status = conditionMap[data.condition_status];
  }

  const total_value = data.quantity * data.unit_value;
  const newMatricule = await generateMatricule('inventory');

  const allData = {
    ...data,
    matricule: newMatricule,
    total_value,
  };

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

module.exports = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
};
