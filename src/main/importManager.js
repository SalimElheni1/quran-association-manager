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
const { generateMatricule } = require('./services/matriculeService');
const { setDbSalt } = require('./keyManager');

const CLASS_GENDER_MAP = {
  ذكر: 'men',
  أنثى: 'women',
  مختلط: 'all',
  رجال: 'men',
  نساء: 'women',
  أطفال: 'kids',
  male: 'men',
  female: 'women',
  mixed: 'all',
  male_only: 'men',
  female_only: 'women',
  kids: 'kids',
  all: 'all',
  women: 'women',
  men: 'men',
};

const mainStore = new Store();

async function executeSqlScriptSafely(sqlScript) {
  // Get current database tables and their columns
  const tables = await allQuery(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const existingTables = new Set(tables.map((t) => t.name));

  // Get column info for each table
  const tableColumns = {};
  for (const table of tables) {
    const columns = await allQuery(`PRAGMA table_info("${table.name}")`);
    tableColumns[table.name] = new Set(columns.map((c) => c.name));
  }

  // Split SQL script into individual statements
  const statements = sqlScript
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  const validStatements = [];
  const skippedTables = new Set();
  const fixedStatements = [];

  for (const statement of statements) {
    // Extract table name from REPLACE INTO or INSERT statements
    const match = statement.match(
      /(?:REPLACE|INSERT)\s+(?:OR\s+REPLACE\s+)?INTO\s+["']?([^\s"'(\s]+)["']?\s*\(/i,
    );
    if (match) {
      const tableName = match[1];
      if (!existingTables.has(tableName)) {
        skippedTables.add(tableName);
        continue;
      }

      // Extract columns from the statement
      const columnsMatch = statement.match(/\(([^)]+)\)\s*VALUES/i);
      if (columnsMatch) {
        const columns = columnsMatch[1].split(',').map((col) => col.trim().replace(/["']/g, ''));
        const currentColumns = tableColumns[tableName];

        // Check if all columns exist
        const invalidColumns = columns.filter((col) => !currentColumns.has(col));

        if (invalidColumns.length > 0) {
          // Fix the statement by removing invalid columns
          const fixed = fixStatementColumns(statement, columns, invalidColumns);
          if (fixed) {
            validStatements.push(fixed);
            fixedStatements.push(`${tableName}: removed columns [${invalidColumns.join(', ')}]`);
          }
          continue;
        }
      }

      validStatements.push(statement);
    } else {
      // Non-INSERT/REPLACE statements (like CREATE, etc.) - execute as-is
      validStatements.push(statement);
    }
  }

  if (skippedTables.size > 0) {
    logWarn(`Skipped data for non-existent tables: ${Array.from(skippedTables).join(', ')}`);
  }
  if (fixedStatements.length > 0) {
    log(`Fixed column mismatches: ${fixedStatements.join('; ')}`);
  }

  // Execute valid statements
  const finalScript = validStatements.join(';\n');
  if (finalScript.trim()) {
    await dbExec(getDb(), finalScript);
  }
}

function fixStatementColumns(statement, columns, invalidColumns) {
  try {
    // Find the VALUES part
    const valuesMatch = statement.match(/VALUES\s*\(([^)]+)\)/i);
    if (!valuesMatch) return null;

    const values = valuesMatch[1].split(',').map((v) => v.trim());

    // Remove invalid columns and their corresponding values
    const validIndices = [];
    const validColumns = [];

    columns.forEach((col, idx) => {
      if (!invalidColumns.includes(col)) {
        validIndices.push(idx);
        validColumns.push(`"${col}"`);
      }
    });

    const validValues = validIndices.map((idx) => values[idx]);

    // Reconstruct the statement
    const tableMatch = statement.match(
      /(?:REPLACE|INSERT)\s+(?:OR\s+REPLACE\s+)?INTO\s+["']?([^\s"'(\s]+)["']?/i,
    );
    const tableName = tableMatch[1];
    const command = statement.match(/^(REPLACE|INSERT(?:\s+OR\s+REPLACE)?)/i)[0];

    return `${command} INTO "${tableName}" (${validColumns.join(', ')}) VALUES (${validValues.join(', ')})`;
  } catch (error) {
    logError('Failed to fix statement:', error);
    return null;
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

    // Delete main DB file
    if (fsSync.existsSync(currentDbPath)) {
      log(`Deleting old database file at ${currentDbPath}...`);
      await unlinkWithRetry(currentDbPath);
    }

    // Delete WAL file if exists
    const walPath = `${currentDbPath}-wal`;
    if (fsSync.existsSync(walPath)) {
      log(`Deleting old WAL file at ${walPath}...`);
      await unlinkWithRetry(walPath);
    }

    // Delete SHM file if exists
    const shmPath = `${currentDbPath}-shm`;
    if (fsSync.existsSync(shmPath)) {
      log(`Deleting old SHM file at ${shmPath}...`);
      await unlinkWithRetry(shmPath);
    }
    log('Initializing new database with imported salt...');
    await initializeDatabase(password);
    log('New database initialized successfully.');
    log('Processing SQL script to import data...');

    // Temporarily disable foreign key constraints during import
    log('Disabling foreign key constraints for import...');
    await dbExec(getDb(), 'PRAGMA foreign_keys = OFF');

    try {
      await executeSqlScriptSafely(sqlScript);
      log('Data import completed successfully.');
    } finally {
      // Always re-enable foreign key constraints
      log('Re-enabling foreign key constraints...');
      await dbExec(getDb(), 'PRAGMA foreign_keys = ON');
    }

    // Migrate users without roles to user_roles table (for old backups)
    log('Checking for users without role assignments...');
    const usersWithoutRoles = await allQuery(`
      SELECT u.id, u.username
      FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
    `);

    if (usersWithoutRoles.length > 0) {
      log(`Found ${usersWithoutRoles.length} users without roles. Assigning default roles...`);
      for (const user of usersWithoutRoles) {
        // Assign Administrator role as default for imported users
        const roleId = await getQuery('SELECT id FROM roles WHERE name = ?', ['Administrator']);
        if (roleId) {
          await runQuery('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
            user.id,
            roleId.id,
          ]);
          log(`Assigned Administrator role to user: ${user.username}`);
        }
      }
    }

    // Fix matricule formats for imported data (convert old 6-digit to new 4-digit format)
    log('Checking for matricules that need format conversion...');
    const matriculeTables = [
      { name: 'students', prefix: 'S-' },
      { name: 'teachers', prefix: 'T-' },
      { name: 'users', prefix: 'U-' },
      { name: 'groups', prefix: 'G-' },
      { name: 'inventory_items', prefix: 'INV-' },
    ];

    let matriculeFixes = 0;
    for (const table of matriculeTables) {
      // Find matricules that are longer than expected (old 6-digit format)
      const matriculesToFix = await allQuery(`
        SELECT id, matricule
        FROM ${table.name}
        WHERE matricule IS NOT NULL
          AND LENGTH(matricule) > 0
          AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4
      `);

      for (const record of matriculesToFix) {
        // Extract the numeric part and convert to 4-digit format
        const parts = record.matricule.split('-');
        if (parts.length === 2) {
          const prefix = parts[0] + '-';
          const number = parseInt(parts[1], 10);
          const newMatricule = prefix + number.toString().padStart(4, '0');

          // Update the record
          await runQuery(`UPDATE ${table.name} SET matricule = ? WHERE id = ?`, [
            newMatricule,
            record.id,
          ]);

          log(`Converted matricule: ${record.matricule} → ${newMatricule}`);
          matriculeFixes++;
        }
      }
    }

    if (matriculeFixes > 0) {
      log(`Fixed ${matriculeFixes} matricule formats during import.`);
    } else {
      log('All matricules were already in the correct format.');
    }

    // Generate missing charges for students after import
    log('Checking for students without charges...');
    const { checkAndGenerateChargesForAllStudents } = require('./handlers/studentFeeHandlers');
    const chargeGenResult = await checkAndGenerateChargesForAllStudents();
    if (chargeGenResult.success) {
      log(`Generated charges for ${chargeGenResult.studentsProcessed} students.`);
    } else {
      logWarn('Failed to generate charges after import:', chargeGenResult.message);
    }

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
  'رسوم الطلاب': ['رقم التعريفي', 'المبلغ', 'تاريخ الدفع', 'طريقة الدفع'],
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

// Safe helper to get a cell value from a data row by header text.
// Returns null when the header is not found instead of calling row.getCell(-1).
const getCellValueByHeader = (headerRow, dataRow, headerText) => {
  const idx = getColumnIndex(headerRow, headerText);
  if (!idx || idx < 1) return null;
  try {
    const cell = dataRow.getCell(idx);
    if (!cell) return null;
    // Handle hyperlinks which have a .text property
    return cell.value?.text || cell.value;
  } catch (e) {
    // Defensive: if ExcelJS throws for any reason, return null so import can continue gracefully
    logWarn(`Failed to read cell for header "${headerText}": ${e.message}`);
    return null;
  }
};

// Normalize sheet names for tolerant matching (remove Arabic diacritics, normalize chars, trim)
const normalizeSheetName = (s) => {
  if (!s || typeof s !== 'string') return s;
  // NFKC normalization, remove common Arabic diacritics/tashkeel, collapse spaces
  const withoutDiacritics = s
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // map Arabic alef/yaa/taa variants that commonly differ in input files
    .replace(/ى/g, 'ي')
    .replace(/أ|إ|آ/g, 'ا');
  return withoutDiacritics;
};

const findWorksheetTolerant = (workbook, sheetName) => {
  if (!workbook || !sheetName) return null;
  // exact first
  let ws = workbook.getWorksheet(sheetName);
  if (ws) return ws;

  const target = normalizeSheetName(sheetName);
  for (const candidate of workbook.worksheets) {
    if (normalizeSheetName(candidate.name) === target) return candidate;
  }

  // common Arabic plural/singular fallback (quick heuristic)
  if (sheetName === 'المعلمون' || sheetName === 'المعلمين') {
    ws = workbook.getWorksheet(sheetName === 'المعلمون' ? 'المعلمين' : 'المعلمون');
    if (ws) return ws;
  }

  return null;
};

// Parse a human-friendly schedule cell into the internal JSON array format.
// Accepts either a JSON string/array or a simple Arabic string like:
// "الإثنين 08:00-10:00; الأربعاء 09:00-11:00" or "Monday 08:00-10:00|Wednesday 09:00-11:00"
const parseScheduleCell = (raw) => {
  if (!raw) return null;
  // If already a JSON array string or JS array, try parse
  if (typeof raw === 'object') {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    // Try JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Not JSON, fall through to friendly parse
    }

    // Split on semicolon or pipe
    const parts = trimmed
      .split(/;|\|/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;

    const arabicDayMap = {
      الاثنين: 'Monday',
      الإثنين: 'Monday',
      الثلاثاء: 'Tuesday',
      الأربعاء: 'Wednesday',
      الخميس: 'Thursday',
      الجمعة: 'Friday',
      السبت: 'Saturday',
      الاحد: 'Sunday',
      الأحد: 'Sunday',
    };

    const enDayMapLower = {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    };

    const schedule = [];
    for (const part of parts) {
      // Try to capture "day time-range" e.g. "الإثنين 08:00-10:00" or "Monday 08:00-10:00"
      const m = part.match(/^(\S+)\s+([0-2]?\d:[0-5]\d\s*-\s*[0-2]?\d:[0-5]\d)\s*$/);
      if (m) {
        let dayToken = m[1];
        const timeToken = m[2].replace(/\s+/g, '');
        // Map Arabic day to English key if needed
        const dayKey = arabicDayMap[dayToken] || enDayMapLower[dayToken.toLowerCase()] || dayToken;
        schedule.push({ day: dayKey, time: timeToken });
        continue;
      }

      // If not matching the strict pattern, attempt a relaxed parse: find time range then the remaining is day
      const timeMatch = part.match(/([0-2]?\d:[0-5]\d\s*-\s*[0-2]?\d:[0-5]\d)/);
      if (timeMatch) {
        const timeToken = timeMatch[1].replace(/\s+/g, '');
        const dayToken = part.replace(timeMatch[0], '').trim();
        const dayKey = arabicDayMap[dayToken] || enDayMapLower[dayToken.toLowerCase()] || dayToken;
        schedule.push({ day: dayKey, time: timeToken });
        continue;
      }

      // As a last resort, skip badly formatted part
    }

    return schedule.length > 0 ? schedule : null;
  }
  return null;
};

async function importExcelData(filePath, selectedSheets) {
  log(`Starting import with path: ${filePath} and sheets: ${JSON.stringify(selectedSheets)}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const results = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };

  const allSheetProcessors = {
    الطلاب: processStudentRow,
    المعلمون: processTeacherRow,
    المعلمين: processTeacherRow, // Added for pluralization
    المستخدمون: processUserRow,
    المستخدمين: processUserRow, // Added for pluralization
    الفصول: processClassRow,
    'العمليات المالية': processTransactionRow,
    'رسوم الطلاب': processStudentFeesRow,
    الحضور: processAttendanceRow,
    المجموعات: processGroupRow,
    المخزون: processInventoryRow,
  };

  const sheetsToProcess = selectedSheets || Object.keys(allSheetProcessors);
  log(`Sheets to process: ${JSON.stringify(sheetsToProcess)}`);

  for (const sheetName of sheetsToProcess) {
    const processor = allSheetProcessors[sheetName];
    if (!processor) {
      logWarn(`No processor found for sheet: ${sheetName}`);
      continue;
    }

    // Try tolerant lookup for worksheet name (accept small variations in Arabic naming)
    let worksheet = findWorksheetTolerant(workbook, sheetName);
    if (!worksheet) {
      if (selectedSheets && selectedSheets.includes(sheetName)) {
        const available = workbook.worksheets.map((w) => w.name).join(', ');
        results.errors.push(
          `ورقة "${sheetName}" المحددة للاستيراد غير موجودة في ملف Excel. الأوراق الموجودة: ${available}`,
        );
        results.errorCount++;
      }
      continue;
    }

    log(`Processing sheet: ${sheetName}`);
    const headerRow = worksheet.getRow(2);
    if (!headerRow.hasValues) {
      results.errors.push(`ورقة "${sheetName}" لا تحتوي على صف الرأس المطلوب.`);
      results.errorCount++;
      continue;
    }

    const required = REQUIRED_COLUMNS[sheetName] || REQUIRED_COLUMNS[sheetName.slice(0, -1)] || [];
    const missingColumns = required.filter((colName) => getColumnIndex(headerRow, colName) === -1);

    if (missingColumns.length > 0) {
      results.errors.push(
        `ورقة "${sheetName}" ينقصها الأعمدة المطلوبة: ${missingColumns.join(', ')}`,
      );
      results.errorCount += worksheet.rowCount - 2; // Approximate error count
      continue; // Skip processing this sheet
    }

    let processedRows = 0;
    log(`Found ${worksheet.rowCount - 2} rows to process in sheet: ${sheetName}`);
    for (let i = 3; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.hasValues) continue;
      processedRows++;
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
        logError(`Error processing row ${i} in sheet ${sheetName}:`, e);
      }
    }

    if (processedRows === 0) {
      results.errors.push(
        `[${sheetName}]: لم يتم استيراد أي بيانات. يرجى التحقق من البيانات في الورقة.`,
      );
    }
  }

  log(`Import finished with results: ${JSON.stringify(results)}`);
  return results;
}

async function processStudentRow(row, headerRow) {
  try {
    const genderIdx = getColumnIndex(headerRow, 'الجنس');
    if (genderIdx > 0) {
      const genderCell = row.getCell(genderIdx);
      if (genderCell && genderCell.value) {
        genderCell.value = GENDER_MAP_AR_TO_EN[genderCell.value] || genderCell.value;
      }
    }

    const statusIdx = getColumnIndex(headerRow, 'الحالة');
    if (statusIdx > 0) {
      const statusCell = row.getCell(statusIdx);
      if (statusCell && statusCell.value) {
        statusCell.value = STATUS_MAP_AR_TO_EN[statusCell.value] || statusCell.value;
      }
    }

    const civilStatusIdx = getColumnIndex(headerRow, 'الحالة الاجتماعية (راشد)');
    if (civilStatusIdx > 0) {
      const civilStatusCell = row.getCell(civilStatusIdx);
      if (civilStatusCell && civilStatusCell.value) {
        const civilStatusMap = { 'أعزب': 'single', 'متزوج': 'married', 'مطلق': 'divorced', 'أرمل': 'widowed' };
        civilStatusCell.value = civilStatusMap[civilStatusCell.value] || civilStatusCell.value;
      }
    }

    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');

    const data = {
      name: getCellValueByHeader(headerRow, row, 'الاسم واللقب'),
      date_of_birth: getCellValueByHeader(headerRow, row, 'تاريخ الميلاد'),
      gender: getCellValueByHeader(headerRow, row, 'الجنس'),
      address: getCellValueByHeader(headerRow, row, 'العنوان'),
      contact_info: getCellValueByHeader(headerRow, row, 'رقم الهاتف'),
      email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني'),
      status: getCellValueByHeader(headerRow, row, 'الحالة'),
      national_id: getCellValueByHeader(headerRow, row, 'رقم الهوية'),
      memorization_level: getCellValueByHeader(headerRow, row, 'مستوى الحفظ'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
      parent_name: getCellValueByHeader(headerRow, row, 'اسم ولي الأمر (طفل)'),
      guardian_relation: getCellValueByHeader(headerRow, row, 'صلة القرابة (طفل)'),
      parent_contact: getCellValueByHeader(headerRow, row, 'هاتف ولي الأمر (طفل)'),
      guardian_email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني للولي (طفل)'),
      emergency_contact_name: getCellValueByHeader(headerRow, row, 'جهة الاتصال في حالات الطوارئ (طفل)'),
      emergency_contact_phone: getCellValueByHeader(headerRow, row, 'هاتف الطوارئ (طفل)'),
      health_conditions: getCellValueByHeader(headerRow, row, 'الحالة الصحية (طفل)'),
      school_name: getCellValueByHeader(headerRow, row, 'اسم المدرسة (طفل)'),
      grade_level: getCellValueByHeader(headerRow, row, 'المستوى الدراسي (طفل)'),
      educational_level: getCellValueByHeader(headerRow, row, 'المستوى التعليمي (راشد)'),
      occupation: getCellValueByHeader(headerRow, row, 'المهنة (راشد)'),
      civil_status: getCellValueByHeader(headerRow, row, 'الحالة الاجتماعية (راشد)'),
      related_family_members: getCellValueByHeader(headerRow, row, 'أفراد العائلة المسجلون (راشد)'),
      fee_category: getCellValueByHeader(headerRow, row, 'فئة الرسوم'),
      sponsor_name: getCellValueByHeader(headerRow, row, 'اسم الكفيل'),
      sponsor_phone: getCellValueByHeader(headerRow, row, 'هاتف الكفيل'),
      sponsor_cin: getCellValueByHeader(headerRow, row, 'رقم هوية الكفيل'),
      financial_assistance_notes: getCellValueByHeader(headerRow, row, 'ملاحظات المساعدة المالية'),
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

    await runQuery(
      `INSERT INTO students (${allFields.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    return { success: true };
  } catch (error) {
    logError('Error processing student row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

async function processTeacherRow(row, headerRow) {
  try {
    const genderIdx = getColumnIndex(headerRow, 'الجنس');
    if (genderIdx > 0) {
      const genderCell = row.getCell(genderIdx);
      if (genderCell && genderCell.value) {
        genderCell.value = GENDER_MAP_AR_TO_EN[genderCell.value] || genderCell.value;
      }
    }

    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');

    const data = {
      name: getCellValueByHeader(headerRow, row, 'الاسم واللقب'),
      national_id: getCellValueByHeader(headerRow, row, 'رقم الهوية'),
      contact_info: getCellValueByHeader(headerRow, row, 'رقم الهاتف'),
      email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني'),
      gender: getCellValueByHeader(headerRow, row, 'الجنس'),
      address: getCellValueByHeader(headerRow, row, 'العنوان'),
      date_of_birth: getCellValueByHeader(headerRow, row, 'تاريخ الميلاد'),
      educational_level: getCellValueByHeader(headerRow, row, 'المستوى التعليمي'),
      specialization: getCellValueByHeader(headerRow, row, 'التخصص'),
      years_of_experience: getCellValueByHeader(headerRow, row, 'سنوات الخبرة'),
      availability: getCellValueByHeader(headerRow, row, 'أوقات التوفر'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
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

    await runQuery(
      `INSERT INTO teachers (${allFields.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    return { success: true };
  } catch (error) {
    logError('Error processing teacher row:', error);
    return { success: false, message: error.message };
  }
}

async function processUserRow(row, headerRow) {
  try {
    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');

    // Get the role from the template (might be in English)
    const roleValue = getCellValueByHeader(headerRow, row, 'الدور');
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
      username: getCellValueByHeader(headerRow, row, 'اسم المستخدم'),
      first_name: getCellValueByHeader(headerRow, row, 'الاسم الأول'),
      last_name: getCellValueByHeader(headerRow, row, 'اللقب'),
      employment_type: getCellValueByHeader(headerRow, row, 'نوع التوظيف'),
      date_of_birth: getCellValueByHeader(headerRow, row, 'تاريخ الميلاد'),
      national_id: getCellValueByHeader(headerRow, row, 'رقم الهوية'),
      email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني'),
      phone_number: getCellValueByHeader(headerRow, row, 'رقم الهاتف'),
      occupation: getCellValueByHeader(headerRow, row, 'المهنة'),
      civil_status: getCellValueByHeader(headerRow, row, 'الحالة الاجتماعية'),
      start_date: getCellValueByHeader(headerRow, row, 'تاريخ البدء'),
      end_date: getCellValueByHeader(headerRow, row, 'تاريخ الانتهاء'),
      status: getCellValueByHeader(headerRow, row, 'الحالة'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
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
      const values = [
        ...allFields.map((k) => data[k]),
        newMatricule,
        require('bcryptjs').hashSync(password, 10),
      ];

      const result = await runQuery(
        `INSERT INTO users (${userFields.join(', ')}) VALUES (${placeholders})`,
        values,
      );

      // Assign role
      const roleRecord = await getQuery('SELECT id FROM roles WHERE name = ?', [mappedRole]);
      if (!roleRecord) {
        throw new Error(`Role "${mappedRole}" not found.`);
      }
      await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
        result.id,
        roleRecord.id,
      ]);

      await runQuery('COMMIT');
      return { success: true, newUser: { username: data.username, password } };
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logError('Error processing user row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

async function processClassRow(row, headerRow) {
  try {
    // Accept either teacher matricule (معرف المعلم) or teacher name (اسم المعلم)
    const teacherMatricule = getCellValueByHeader(headerRow, row, 'معرف المعلم');
    const teacherName = getCellValueByHeader(headerRow, row, 'اسم المعلم');

    let teacher = null;
    if (teacherMatricule) {
      teacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [teacherMatricule]);
      if (!teacher) {
        return { success: false, message: `لم يتم العثور على معلم بالمعرف "${teacherMatricule}".` };
      }
    } else if (teacherName) {
      // Try to find teacher by name (case-insensitive)
      teacher = await getQuery('SELECT id FROM teachers WHERE LOWER(name) = LOWER(?)', [
        teacherName,
      ]);
      if (!teacher) {
        // Try a LIKE search as fallback
        const likeMatch = await getQuery('SELECT id FROM teachers WHERE name LIKE ?', [
          `%${teacherName}%`,
        ]);
        if (likeMatch) teacher = likeMatch;
      }
      if (!teacher) {
        return { success: false, message: `لم يتم العثور على معلم بالاسم "${teacherName}".` };
      }
    } else {
      return { success: false, message: 'معرف المعلم أو اسم المعلم مطلوب.' };
    }

    const rawSchedule =
      getCellValueByHeader(headerRow, row, 'الجدول الزمني (JSON)') ||
      getCellValueByHeader(headerRow, row, 'الجدول الزمني');
    let parsedSchedule = null;
    try {
      parsedSchedule = parseScheduleCell(rawSchedule);
    } catch (e) {
      parsedSchedule = null;
    }

    const data = {
      name: getCellValueByHeader(headerRow, row, 'اسم الفصل'),
      teacher_id: teacher.id,
      class_type: getCellValueByHeader(headerRow, row, 'نوع الفصل'),
      schedule: parsedSchedule ? JSON.stringify(parsedSchedule) : rawSchedule || null,
      start_date: getCellValueByHeader(headerRow, row, 'تاريخ البدء'),
      end_date: getCellValueByHeader(headerRow, row, 'تاريخ الانتهاء'),
      status: getCellValueByHeader(headerRow, row, 'الحالة'),
      capacity: getCellValueByHeader(headerRow, row, 'السعة'),
      gender: getCellValueByHeader(headerRow, row, 'الجنس'),
    };

    // Normalize class gender to allowed DB values
    try {
      if (data.gender) {
        const rawGender = String(data.gender).trim();
        const lower = rawGender.toLowerCase();
        data.gender = CLASS_GENDER_MAP[rawGender] || CLASS_GENDER_MAP[lower] || data.gender;
      }
    } catch (e) {
      /* ignore and keep original */
    }

    // Normalize class status to DB keys
    try {
      if (data.status) {
        const rawStatus = String(data.status).trim();
        data.status =
          CLASS_STATUS_MAP[rawStatus] || CLASS_STATUS_MAP[rawStatus.toLowerCase()] || data.status;
      }
    } catch (e) {
      /* ignore and keep original */
    }

    if (!data.name) {
      return { success: false, message: 'اسم الفصل مطلوب.' };
    }

    const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map((k) => data[k]);

    await runQuery(`INSERT INTO classes (${fields.join(', ')}) VALUES (${placeholders})`, values);
    return { success: true };
  } catch (error) {
    logError('Error processing class row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
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
    الإيجار: 'كراء وفواتير',
    'الكهرباء والماء': 'كراء وفواتير',
    القرطاسية: 'لوازم مكتبية وصيانة',
    الصيانة: 'لوازم مكتبية وصيانة',
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
  const receiptTypeIndex = getColumnIndex(headerRow, 'نوع الوصل');

  if (data.category === 'التبرعات النقدية' && receiptTypeIndex !== -1 && !data.receipt_type) {
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
  const statusIdx = getColumnIndex(headerRow, 'الحالة');
  if (statusIdx > 0) {
    const statusAr = row.getCell(statusIdx)?.value;
    if (statusAr) {
      row.getCell(statusIdx).value = ATTENDANCE_MAP_AR_TO_EN[statusAr] || statusAr;
    }
  }

  const studentMatricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي للطالب');
  const className = getCellValueByHeader(headerRow, row, 'اسم الفصل');
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
    date: getCellValueByHeader(headerRow, row, 'التاريخ'),
    status: getCellValueByHeader(headerRow, row, 'الحالة'),
  };
  if (!data.date || !data.status) return { success: false, message: 'التاريخ والحالة مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO attendance (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processGroupRow(row, headerRow) {
  try {
    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');
    const name = getCellValueByHeader(headerRow, row, 'اسم المجموعة');
    const description = getCellValueByHeader(headerRow, row, 'الوصف');
    const category = getCellValueByHeader(headerRow, row, 'الفئة');

    if (!name || !category) {
      return { success: false, message: 'عمود اسم المجموعة أو الفئة غير موجود.' };
    }

    const data = {
      name,
      description,
      category,
    };

    if (!data.name || !data.category) {
      return { success: false, message: 'اسم المجموعة والفئة مطلوبان.' };
    }

    const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

    if (matricule) {
      // Update existing record
      const existingGroup = await getQuery('SELECT id FROM groups WHERE matricule = ?', [
        matricule,
      ]);
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
  } catch (error) {
    logError('Error processing group row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

async function processInventoryRow(row, headerRow) {
  try {
    const conditionMap = {
      جديد: 'New',
      جيد: 'Good',
      مقبول: 'Fair',
      رديء: 'Poor',
    };

    const data = {
      item_name: getCellValueByHeader(headerRow, row, 'اسم العنصر'),
      category: getCellValueByHeader(headerRow, row, 'الفئة'),
      quantity: getCellValueByHeader(headerRow, row, 'الكمية'),
      unit_value: getCellValueByHeader(headerRow, row, 'قيمة الوحدة'),
      acquisition_date: getCellValueByHeader(headerRow, row, 'تاريخ الاقتناء'),
      acquisition_source: getCellValueByHeader(headerRow, row, 'مصدر الاقتناء'),
      condition_status: getCellValueByHeader(headerRow, row, 'الحالة'),
      location: getCellValueByHeader(headerRow, row, 'موقع التخزين'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
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

    // Check if item already exists - if so, update quantity instead of rejecting
    const existingItem = await getQuery(
      'SELECT id, quantity, unit_value FROM inventory_items WHERE item_name = ? COLLATE NOCASE',
      [data.item_name],
    );
    if (existingItem) {
      // Update existing item: add to quantity and recalculate total_value
      const newQuantity = existingItem.quantity + data.quantity;
      const newTotalValue = newQuantity * existingItem.unit_value;
      await runQuery('UPDATE inventory_items SET quantity = ?, total_value = ? WHERE id = ?', [
        newQuantity,
        newTotalValue,
        existingItem.id,
      ]);
      return {
        success: true,
        message: `تم تحديث كمية "${data.item_name}" إلى ${newQuantity} وقيمة إجمالية ${newTotalValue.toFixed(2)}.`,
      };
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
  } catch (error) {
    logError('Error processing inventory row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

const GENDER_MAP_AR_TO_EN = { ذكر: 'Male', أنثى: 'Female' };
const STATUS_MAP_AR_TO_EN = { نشط: 'active', 'غير نشط': 'inactive' };
const ATTENDANCE_MAP_AR_TO_EN = {
  حاضر: 'present',
  غائب: 'absent',
};

// Mapping for class status values (database uses: 'pending','active','completed')
const CLASS_STATUS_MAP = {
  'قيد الانتظار': 'pending',
  قيد_الانتظار: 'pending',
  pending: 'pending',
  نشط: 'active',
  active: 'active',
  مكتمل: 'completed',
  completed: 'completed',
};

async function processStudentFeesRow(row, headerRow) {
  try {
    // Helper function to get and trim cell values, preserving leading zeros for receipt numbers
    const getTrimmedCellValue = (headerText, preserveLeadingZeros = false) => {
      const cell = row.getCell(getColumnIndex(headerRow, headerText));
      if (!cell || !cell.value) return null;
      const value = cell.value;
      if (preserveLeadingZeros && typeof value === 'number') {
        return String(value).padStart(3, '0');
      }
      return String(value).trim();
    };

    // Payment method mapping
    const PAYMENT_METHOD_MAP = {
      نقدي: 'CASH',
      شيك: 'CHECK',
      تحويل: 'TRANSFER',
      'تحويل بنكي': 'TRANSFER',
    };

    // Payment type mapping
    const PAYMENT_TYPE_MAP = {
      'رسوم شهرية': 'MONTHLY',
      'رسوم سنوية': 'ANNUAL',
      'رسوم خاصة': 'SPECIAL',
      MONTHLY: 'MONTHLY',
      ANNUAL: 'ANNUAL',
      SPECIAL: 'SPECIAL',
    };

    const data = {
      student_matricule: getTrimmedCellValue('رقم التعريفي'),
      amount: getTrimmedCellValue('المبلغ'),
      payment_date: getTrimmedCellValue('تاريخ الدفع'),
      payment_method: getTrimmedCellValue('طريقة الدفع'),
      payment_type: getTrimmedCellValue('نوع الدفعة'),
      class_matricule: getTrimmedCellValue('رقم تعريفي الفصل'),
      academic_year: getTrimmedCellValue('السنة الدراسية'),
      receipt_number: getTrimmedCellValue('رقم الوصل', true),
      check_number: getTrimmedCellValue('رقم الشيك', true),
      notes: getTrimmedCellValue('ملاحظات'),
    };

    // Validation with better error messages
    if (!data.student_matricule) {
      return { success: false, message: 'رقم التعريفي للطالب مطلوب.' };
    }
    if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
      return {
        success: false,
        message: `المبلغ غير صالح: "${data.amount}". يجب أن يكون رقماً موجباً.`,
      };
    }
    if (!data.payment_date) {
      return { success: false, message: 'تاريخ الدفع مطلوب.' };
    }
    if (!data.payment_method) {
      return { success: false, message: 'طريقة الدفع مطلوبة.' };
    }

    // Validate student exists
    const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [
      data.student_matricule,
    ]);
    if (!student) {
      return {
        success: false,
        message: `الطالب بالرقم التعريفي "${data.student_matricule}" غير موجود.`,
      };
    }

    // Map payment method
    const mappedPaymentMethod = PAYMENT_METHOD_MAP[data.payment_method] || data.payment_method;
    if (!['CASH', 'CHECK', 'TRANSFER'].includes(mappedPaymentMethod)) {
      return { success: false, message: 'طريقة الدفع يجب أن تكون نقدي، شيك، أو تحويل.' };
    }

    // Map payment type
    const mappedPaymentType = PAYMENT_TYPE_MAP[data.payment_type] || data.payment_type;
    if (!['MONTHLY', 'ANNUAL', 'SPECIAL'].includes(mappedPaymentType)) {
      return { success: false, message: 'نوع الدفعة يجب أن يكون رسوم شهرية، سنوية، أو خاصة.' };
    }

    // For SPECIAL payments, validate class exists if class_matricule is provided
    let classId = null;
    if (mappedPaymentType === 'SPECIAL' && data.class_matricule) {
      const classData = await getQuery('SELECT id FROM classes WHERE matricule = ?', [
        data.class_matricule,
      ]);
      if (!classData) {
        return {
          success: false,
          message: `الفصل بالرقم التعريفي "${data.class_matricule}" غير موجود.`,
        };
      }
      classId = data.class_matricule;
    }

    if (!data.receipt_number) {
      const year = new Date(data.payment_date).getFullYear();
      const lastPayment = await getQuery(
        'SELECT receipt_number FROM student_payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1',
        [`RCP-${year}-%`]
      );
      let sequence = 1;
      if (lastPayment?.receipt_number) {
        const lastSeq = parseInt(lastPayment.receipt_number.split('-')[2]);
        sequence = lastSeq + 1;
      }
      data.receipt_number = `RCP-${year}-${sequence.toString().padStart(4, '0')}`;
    } else {
      const existingPayment = await getQuery(
        'SELECT id FROM student_payments WHERE receipt_number = ?',
        [data.receipt_number],
      );
      if (existingPayment) {
        return { success: false, message: `رقم الوصل "${data.receipt_number}" موجود بالفعل.` };
      }
    }

    // Record the payment using the existing handler
    const paymentDetails = {
      student_id: student.id,
      amount: parseFloat(data.amount),
      payment_method: mappedPaymentMethod,
      payment_type: mappedPaymentType,
      academic_year: data.academic_year || new Date().getFullYear().toString(),
      receipt_number: data.receipt_number,
      check_number: data.check_number,
      notes: data.notes,
      class_id: classId, // This will be stored in the class_id column
    };

    // Use the existing recordStudentPayment function
    await require('./handlers/studentFeeHandlers').recordStudentPayment(
      { sender: { userId: 1 } }, // Mock event with userId
      paymentDetails,
    );

    return { success: true };
  } catch (error) {
    logError('Error processing student fees row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

const exported = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
};

// Conditionally export internal functions for testing
if (process.env.NODE_ENV === 'test') {
  exported.processStudentRow = processStudentRow;
  exported.processTeacherRow = processTeacherRow;
  exported.processUserRow = processUserRow;
  exported.processClassRow = processClassRow;
  exported.processTransactionRow = processTransactionRow;
  exported.processAttendanceRow = processAttendanceRow;
  exported.processGroupRow = processGroupRow;
  exported.processInventoryRow = processInventoryRow;
}

module.exports = exported;
