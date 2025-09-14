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
    const configFile = zip.file('salt.json');
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
        logWarn(`EBUSY error, retrying unlink on ${filePath} in ${delay}ms... (Attempt ${i + 1}/${retries})`);
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
    if (!configFile) configFile = zip.file('config.json');

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
    return { success: true, message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.' };
  } catch (error) {
    logError('Failed to replace database from package:', error);
    return { success: false, message: `فشل استيراد قاعدة البيانات: ${error.message}` };
  }
}

const ENTITY_CONFIG = {
  students: {
    tableName: 'students',
    idField: 'matricule',
    requiredFields: ['name'],
    uniqueCheck: async (d) => getQuery('SELECT id FROM students WHERE name = ? OR national_id = ?', [d.name, d.national_id]),
    generateId: () => generateMatricule('student'),
  },
  teachers: {
    tableName: 'teachers',
    idField: 'matricule',
    requiredFields: ['name'],
    uniqueCheck: async (d) => getQuery('SELECT id FROM teachers WHERE national_id = ?', [d.national_id]),
    generateId: () => generateMatricule('teacher'),
  },
  users: {
    tableName: 'users',
    idField: 'matricule',
    requiredFields: ['username', 'first_name', 'last_name', 'role', 'employment_type'],
    uniqueCheck: async (d) => getQuery('SELECT id FROM users WHERE username = ?', [d.username]),
    generateId: () => generateMatricule('user'),
    preProcess: async (data) => {
      if (!data.matricule) {
        const password = Math.random().toString(36).slice(-8);
        data.password = bcrypt.hashSync(password, 10);
        data._transient = { newUserPassword: password };
      }
      return data;
    },
  },
  classes: {
    tableName: 'classes',
    requiredFields: ['name', 'teacher_id'],
    foreignKeyLookups: {
      teacher_id: { fromField: 'teacher_matricule', tableName: 'teachers', idField: 'matricule' },
    },
  },
  payments: {
    tableName: 'payments',
    requiredFields: ['student_id', 'amount', 'payment_date'],
    foreignKeyLookups: {
      student_id: { fromField: 'student_matricule', tableName: 'students', idField: 'matricule' },
    },
  },
  salaries: {
    tableName: 'salaries',
    requiredFields: ['teacher_id', 'amount', 'payment_date'],
    foreignKeyLookups: {
      teacher_id: { fromField: 'teacher_matricule', tableName: 'teachers', idField: 'matricule' },
    },
  },
  donations: {
    tableName: 'donations',
    requiredFields: ['donor_name', 'donation_type', 'donation_date'],
    preProcess: async (data) => {
      const errors = [];
      if (data.donation_type === 'Cash' && !data.amount) errors.push('Amount is required for Cash donations.');
      if (data.donation_type === 'In-kind' && !data.description) errors.push('Description is required for In-kind donations.');
      return { ...data, _errors: errors };
    },
  },
  expenses: {
    tableName: 'expenses',
    requiredFields: ['category', 'amount', 'expense_date'],
  },
  attendance: {
    tableName: 'attendance',
    requiredFields: ['student_id', 'class_id', 'date', 'status'],
    foreignKeyLookups: {
      student_id: { fromField: 'student_matricule', tableName: 'students', idField: 'matricule' },
      class_id: { fromField: 'class_name', tableName: 'classes', idField: 'name' },
    },
  },
};

async function processAndValidateRow(rowData, entityType, columnMap, options = { isDryRun: false }) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) return { success: false, errors: [`Invalid entity type: ${entityType}`] };

  const data = {};
  for (const key in columnMap) {
    if (rowData[key] !== undefined && rowData[key] !== null) data[columnMap[key]] = rowData[key];
  }

  const errors = [];
  let transientData = {};

  if (config.foreignKeyLookups) {
    for (const targetField in config.foreignKeyLookups) {
      const lookupConfig = config.foreignKeyLookups[targetField];
      const providedId = data[lookupConfig.fromField];
      if (!providedId) {
        errors.push(`Missing foreign key identifier: ${lookupConfig.fromField}`);
        continue;
      }
      const record = await getQuery(`SELECT id FROM ${lookupConfig.tableName} WHERE ${lookupConfig.idField} = ?`, [providedId]);
      if (!record) {
        errors.push(`Referenced record not found in "${lookupConfig.tableName}" with identifier "${providedId}"`);
      } else {
        data[targetField] = record.id;
        delete data[lookupConfig.fromField];
      }
    }
  }

  for (const field of config.requiredFields) {
    if (!data[field]) errors.push(`Missing required field: ${field}`);
  }

  if (config.preProcess) {
    const processed = await config.preProcess(data);
    if (processed._transient) {
      transientData = processed._transient;
      delete processed._transient;
    }
    if (processed._errors?.length > 0) errors.push(...processed._errors);
  }

  if (errors.length > 0) return { success: false, errors };

  try {
    if (!config.idField) {
      if (!options.isDryRun) {
        const fields = Object.keys(data);
        const placeholders = fields.map(() => '?').join(', ');
        await runQuery(`INSERT INTO ${config.tableName} (${fields.join(',')}) VALUES (${placeholders})`, Object.values(data));
      }
      return { success: true, action: 'INSERT', data };
    }

    const idValue = data[config.idField];
    if (idValue) {
      const record = await getQuery(`SELECT id FROM ${config.tableName} WHERE ${config.idField} = ?`, [idValue]);
      if (!record) return { success: false, errors: [`Record with ID "${idValue}" not found.`] };
      if (!options.isDryRun) {
        const fieldsToUpdate = Object.keys(data).filter(k => k !== config.idField);
        const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
        const values = [...fieldsToUpdate.map((k) => data[k]), idValue];
        await runQuery(`UPDATE ${config.tableName} SET ${setClauses} WHERE ${config.idField} = ?`, values);
      }
      return { success: true, action: 'UPDATE', id: idValue, data };
    } else {
      const duplicate = await config.uniqueCheck(data);
      if (duplicate) return { success: false, errors: ['Record already exists.'] };
      const newId = await config.generateId();
      data[config.idField] = newId;
      if (!options.isDryRun) {
        const fields = Object.keys(data);
        const placeholders = fields.map(() => '?').join(', ');
        await runQuery(`INSERT INTO ${config.tableName} (${fields.join(',')}) VALUES (${placeholders})`, Object.values(data));
      }
      return { success: true, action: 'INSERT', id: newId, data, transientData };
    }
  } catch (e) {
    logError(`DB Error processing row for ${entityType}:`, e);
    return { success: false, errors: [e.message] };
  }
}

async function parseHeadersFromFile(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('The Excel file contains no worksheets.');
    const headerRow = worksheet.getRow(1);
    if (!headerRow.hasValues) return [];
    return headerRow.values.filter((v) => v);
  } catch (error) {
    logError('Error parsing headers from file:', error);
    throw error;
  }
}

async function processImport(filePath, entityType, columnMap, options = { isDryRun: false }, onProgress) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  const results = { summary: { successCount: 0, errorCount: 0 }, errors: [], processedRows: [] };
  const totalRows = worksheet.rowCount - 1;
  const headerRow = worksheet.getRow(1);
  if (!headerRow.hasValues) throw new Error('Header row not found or is empty.');

  const headerIndexMap = {};
  headerRow.eachCell((cell, colNumber) => {
    headerIndexMap[cell.value] = colNumber;
  });

  if (!options.isDryRun) {
    log('Beginning import transaction.');
    await runQuery('BEGIN TRANSACTION;');
  }

  try {
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (onProgress) onProgress({ processed: i - 1, total: totalRows });
      if (!row.hasValues) continue;

      const mappedRowData = {};
      const internalColumnMap = {};
      for (const fileHeader in columnMap) {
        const dbField = columnMap[fileHeader];
        if (dbField) {
            const colIndex = headerIndexMap[fileHeader];
            if (colIndex) {
                mappedRowData[dbField] = row.getCell(colIndex).value?.text || row.getCell(colIndex).value;
                internalColumnMap[dbField] = dbField;
            }
        }
      }

      const result = await processAndValidateRow(mappedRowData, entityType, internalColumnMap, options);
      if (result.success) {
        results.summary.successCount++;
      } else {
        results.summary.errorCount++;
        results.errors.push({ row: i, errors: result.errors });
      }
      results.processedRows.push({ row: i, ...result });
    }

    if (!options.isDryRun) {
      log('Import successful. Committing transaction.');
      await runQuery('COMMIT;');
    }
    if (onProgress) onProgress({ processed: totalRows, total: totalRows });
    return results;
  } catch (error) {
    if (!options.isDryRun) {
      logError('An error occurred during import. Rolling back transaction.', error);
      await runQuery('ROLLBACK;');
    }
    throw error;
  }
}

const LEGACY_TEMPLATE_MAP = {
  students: {
    sheetName: 'الطلاب',
    columns: {
      matricule: { header: 'الرقم التعريفي', field: 'matricule' },
      name: { header: 'الاسم واللقب', field: 'name' },
      date_of_birth: { header: 'تاريخ الميلاد', field: 'date_of_birth' },
      gender: { header: 'الجنس', field: 'gender' },
      address: { header: 'العنوان', field: 'address' },
      contact_info: { header: 'رقم الهاتف', field: 'contact_info' },
      email: { header: 'البريد الإلكتروني', field: 'email' },
      status: { header: 'الحالة', field: 'status' },
      national_id: { header: 'رقم الهوية', field: 'national_id' },
    },
  },
  teachers: {
    sheetName: 'المعلمون',
    columns: {
      matricule: { header: 'الرقم التعريفي', field: 'matricule' },
      name: { header: 'الاسم واللقب', field: 'name' },
      national_id: { header: 'رقم الهوية', field: 'national_id' },
      contact_info: { header: 'رقم الهاتف', field: 'contact_info' },
      email: { header: 'البريد الإلكتروني', field: 'email' },
    },
  },
  users: {
    sheetName: 'المستخدمون',
    columns: {
      matricule: { header: 'الرقم التعريفي', field: 'matricule' },
      username: { header: 'اسم المستخدم', field: 'username' },
      first_name: { header: 'الاسم الأول', field: 'first_name' },
      last_name: { header: 'اللقب', field: 'last_name' },
      role: { header: 'الدور', field: 'role' },
      employment_type: { header: 'نوع التوظيف', field: 'employment_type' },
    },
  },
  classes: {
    sheetName: 'الفصول',
    columns: {
      name: { header: 'اسم الفصل', field: 'name' },
      teacher_matricule: { header: 'الرقم التعريفي للمعلم', field: 'teacher_matricule' },
      class_type: { header: 'نوع الفصل', field: 'class_type' },
      schedule: { header: 'الجدول الزمني (JSON)', field: 'schedule' },
      start_date: { header: 'تاريخ البدء', field: 'start_date' },
      end_date: { header: 'تاريخ الانتهاء', field: 'end_date' },
      status: { header: 'الحالة', field: 'status' },
      capacity: { header: 'السعة', field: 'capacity' },
      gender: { header: 'الجنس', field: 'gender' },
    },
  },
  payments: {
    sheetName: 'الرسوم الدراسية',
    columns: {
      student_matricule: { header: 'الرقم التعريفي للطالب', field: 'student_matricule' },
      amount: { header: 'المبلغ', field: 'amount' },
      payment_date: { header: 'تاريخ الدفع (YYYY-MM-DD)', field: 'payment_date' },
      payment_method: { header: 'طريقة الدفع', field: 'payment_method' },
      notes: { header: 'ملاحظات', field: 'notes' },
    },
  },
  salaries: {
    sheetName: 'الرواتب',
    columns: {
      teacher_matricule: { header: 'الرقم التعريفي للمعلم', field: 'teacher_matricule' },
      amount: { header: 'المبلغ', field: 'amount' },
      payment_date: { header: 'تاريخ الدفع (YYYY-MM-DD)', field: 'payment_date' },
      notes: { header: 'ملاحظات', field: 'notes' },
    },
  },
  donations: {
    sheetName: 'التبرعات',
    columns: {
      donor_name: { header: 'اسم المتبرع', field: 'donor_name' },
      donation_type: { header: 'نوع التبرع (Cash/In-kind)', field: 'donation_type' },
      amount: { header: 'المبلغ (للتبرع النقدي)', field: 'amount' },
      description: { header: 'وصف (للتبرع العيني)', field: 'description' },
      donation_date: { header: 'تاريخ التبرع (YYYY-MM-DD)', field: 'donation_date' },
      notes: { header: 'ملاحظات', field: 'notes' },
    },
  },
  expenses: {
    sheetName: 'المصاريف',
    columns: {
      category: { header: 'الفئة', field: 'category' },
      amount: { header: 'المبلغ', field: 'amount' },
      expense_date: { header: 'تاريخ الصرف (YYYY-MM-DD)', field: 'expense_date' },
      responsible_person: { header: 'المسؤول', field: 'responsible_person' },
      description: { header: 'الوصف', field: 'description' },
    },
  },
  attendance: {
    sheetName: 'الحضور',
    columns: {
      student_matricule: { header: 'الرقم التعريفي للطالب', field: 'student_matricule' },
      class_name: { header: 'اسم الفصل', field: 'class_name' },
      date: { header: 'التاريخ (YYYY-MM-DD)', field: 'date' },
      status: { header: 'الحالة (present/absent/late/excused)', field: 'status' },
    },
  },
};

async function importExcelData(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const results = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };

  log('Beginning import transaction.');
  await runQuery('BEGIN TRANSACTION;');

  try {
    const processSheet = async (entityType, config) => {
      const worksheet = workbook.getWorksheet(config.sheetName);
      if (!worksheet) return;

      const headerRow = worksheet.getRow(2);
      if (!headerRow.hasValues) return;

      const headerIndexMap = {};
      headerRow.eachCell((cell, colNumber) => {
        headerIndexMap[cell.value] = colNumber;
      });

      for (let i = 3; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        if (!row.hasValues) continue;

        const rowData = {};
        for (const key in config.columns) {
          const header = config.columns[key].header;
          const cellValue = row.getCell(headerIndexMap[header])?.value;
          rowData[key] = cellValue?.text || cellValue;
        }

        const dbFieldMap = Object.fromEntries(Object.entries(config.columns).map(([k, v]) => [k, v.field]));
        const result = await processAndValidateRow(rowData, entityType, dbFieldMap, { isDryRun: false });

        if (result.success) {
          results.successCount++;
          if (result.transientData?.newUserPassword) {
            results.newUsers.push({ username: result.data.username, password: result.transientData.newUserPassword });
          }
        } else {
          results.errorCount++;
          const errorMsg = `[${config.sheetName}] Row ${i}: ${result.errors.join(', ')}`;
          results.errors.push(errorMsg);
          throw new Error(errorMsg);
        }
      }
    };

    for (const entityType in LEGACY_TEMPLATE_MAP) {
      await processSheet(entityType, LEGACY_TEMPLATE_MAP[entityType]);
    }

    if (results.errorCount === 0) {
      log('Import successful. Committing transaction.');
      await runQuery('COMMIT;');
    } else {
      throw new Error('Import failed with errors, rolling back.');
    }

    return results;
  } catch (error) {
    logError('An error occurred during import. Rolling back transaction.', error);
    await runQuery('ROLLBACK;');
    results.errors.push(`Fatal error: ${error.message}. All changes have been rolled back.`);
    results.errorCount = results.successCount + results.errorCount;
    results.successCount = 0;
    return results;
  }
}

module.exports = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
  processImport,
  parseHeadersFromFile,
};
