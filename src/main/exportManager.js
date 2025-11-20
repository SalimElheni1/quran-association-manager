const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow, app } = require('electron');
const ExcelJS = require('exceljs');
const docx = require('docx');
const { allQuery } = require('../db/db');
const { getSetting } = require('./settingsManager');

/**
 * Calculates age from date of birth string.
 * Uses the same logic as the frontend and studentHandlers.
 *
 * @param {string} dob - Date of birth in YYYY-MM-DD format
 * @returns {number|null} Age in years or null if invalid date
 */

// --- Header Data ---
async function getExportHeaderData() {
  const [
    nationalAssociationName,
    regionalAssociationName,
    localBranchName,
    nationalLogoPath,
    regionalLocalLogoPath,
  ] = await Promise.all([
    getSetting('national_association_name'),
    getSetting('regional_association_name'),
    getSetting('local_branch_name'),
    getSetting('national_logo_path'),
    getSetting('regional_local_logo_path'),
  ]);

  return {
    nationalAssociationName,
    regionalAssociationName,
    localBranchName,
    nationalLogoPath,
    regionalLocalLogoPath,
  };
}

// --- Data Fetching ---
async function fetchFinancialData(period) {
  const {
    handleGetFinancialSummary,
    handleGetPayments,
    handleGetSalaries,
    handleGetDonations,
    handleGetExpenses,
  } = require('./handlers/legacyFinancialHandlers');
  const { handleGetInventoryItems } = require('./handlers/inventoryHandlers');

  // handleGetFinancialSummary now takes a year. If a period is provided,
  // we can extract the year from the startDate. If not, it will default to the current year.
  const summaryYear = period ? new Date(period.startDate).getFullYear() : null;

  const [summary, payments, salaries, donations, expenses] = await Promise.all([
    handleGetFinancialSummary(null, summaryYear),
    handleGetPayments(null, period),
    handleGetSalaries(null, period),
    handleGetDonations(null, period),
    handleGetExpenses(null, period),
  ]);
  // include inventory items for the financial export
  const inventory = await handleGetInventoryItems();
  return { summary, payments, salaries, donations, expenses, inventory };
}

async function fetchExportData({ type, fields, options = {} }) {
  if (!fields || fields.length === 0) {
    throw new Error('No fields selected for export.');
  }
  // Map logical field keys (from UI) to actual DB columns or expressions per export type
  function buildFieldSelectionFor(type, fields) {
    // Comprehensive mapping from UI logical keys to DB columns or SQL expressions.
    // Keep aliases consistent with the SELECT FROM clauses used in fetchExportData.
    const maps = {
      students: {
        matricule: 'matricule',
        name: 'name',
        date_of_birth: 'date_of_birth',
        gender: 'gender',
        address: 'address',
        contact_info: 'contact_info',
        email: 'email',
        status: 'status',
        memorization_level: 'memorization_level',
        notes: 'notes',
        parent_name: 'parent_name',
        guardian_relation: 'guardian_relation',
        parent_contact: 'parent_contact',
        guardian_email: 'guardian_email',
        emergency_contact_name: 'emergency_contact_name',
        emergency_contact_phone: 'emergency_contact_phone',
        health_conditions: 'health_conditions',
        national_id: 'national_id',
        school_name: 'school_name',
        grade_level: 'grade_level',
        educational_level: 'educational_level',
        occupation: 'occupation',
        civil_status: 'civil_status',
        related_family_members: 'related_family_members',
        fee_category: 'fee_category',
        sponsor_name: 'sponsor_name',
        sponsor_phone: 'sponsor_phone',
        sponsor_cin: 'sponsor_cin',
        financial_assistance_notes: 'financial_assistance_notes',
      },
      teachers: {
        matricule: 'matricule',
        name: 'name',
        national_id: 'national_id',
        contact_info: 'contact_info',
        email: 'email',
        address: 'address',
        date_of_birth: 'date_of_birth',
        gender: 'gender',
        educational_level: 'educational_level',
        specialization: 'specialization',
        years_of_experience: 'years_of_experience',
        availability: 'availability',
        notes: 'notes',
        // Legacy / alternate keys
        date_of_joining: 'created_at',
        qualifications: 'educational_level',
      },
      admins: {
        matricule: 'matricule',
        username: 'username',
        first_name: 'first_name',
        last_name: 'last_name',
        email: 'email',
        phone_number: 'phone_number',
        role: 'role', // role aggregation handled at query-time if needed
        status: 'status',
        notes: 'notes',
      },
      users: {
        matricule: 'matricule',
        username: 'username',
        first_name: 'first_name',
        last_name: 'last_name',
        date_of_birth: 'date_of_birth',
        national_id: 'national_id',
        email: 'email',
        phone_number: 'phone_number',
        occupation: 'occupation',
        civil_status: 'civil_status',
        employment_type: 'employment_type',
        start_date: 'start_date',
        end_date: 'end_date',
        role: 'role',
        status: 'status',
        notes: 'notes',
      },
      classes: {
        name: 'c.name',
        teacher_name: 't.name as teacher_name',
        schedule: 'c.schedule',
        gender: 'c.gender',
        status: 'c.status',
        matricule: 'c.matricule',
      },
      inventory: {
        matricule: 'matricule',
        item_name: 'item_name',
        category: 'category',
        quantity: 'quantity',
        unit_value: 'unit_value',
        acquisition_date: 'acquisition_date',
        acquisition_source: 'acquisition_source',
        condition_status: 'condition_status',
        location: 'location',
        notes: 'notes',
      },
      attendance: {
        student_name: 's.name as student_name',
        class_name: 'c.name as class_name',
        date: 'a.date',
        status: 'a.status',
      },
    };

    const map = maps[type] || {};
    return fields
      .map((f) => {
        if (map[f]) return map[f];
        // default: use as-is (assume it's a valid column or aliased column key)
        return f;
      })
      .join(', ');
  }

  // Build mapped field list (not yet joined) so we can validate against table columns
  const mappedFields = buildFieldSelectionFor(type, fields)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let query = '';
  let params = [];

  // Helper to get table columns (returns Set)
  async function getTableColumns(tableName) {
    try {
      const cols = await allQuery(`PRAGMA table_info(${tableName})`, []);
      return new Set((cols || []).map((c) => c.name));
    } catch (err) {
      return new Set();
    }
  }

  switch (type) {
    case 'students': {
      // Apply fast SQL filters (group membership and basic gender)
      // Validate selected columns against the `students` table
      const studentCols = await getTableColumns('students');
      const allowed = [];
      const omitted = [];
      for (const mf of mappedFields) {
        // keep expressions (contain space 'as' or a dot for joined aliases) unfiltered
        if (/\s+as\s+/i.test(mf) || mf.includes('.') || mf.includes('(')) {
          allowed.push(mf);
          continue;
        }
        if (studentCols.has(mf)) {
          allowed.push(mf);
        } else {
          omitted.push(mf);
        }
      }

      if (omitted.length > 0) {
        console.warn('Export: omitted non-existing student columns:', omitted.join(', '));
      }

      if (allowed.length === 0) {
        throw new Error(
          'No valid student fields available for export after validating against DB columns.',
        );
      }

      const fieldSelection = allowed.join(', ');

      if (options.groupId) {
        query = `SELECT ${fieldSelection} FROM students s JOIN student_groups sg ON s.id = sg.student_id WHERE sg.group_id = ? ORDER BY s.name`;
        params.push(options.groupId);
      } else {
        query = `SELECT ${fieldSelection} FROM students s ORDER BY s.name`;
      }

      return await allQuery(query, params);
    }
    case 'teachers': {
      // Validate teacher fields against teachers table
      const teacherCols = await getTableColumns('teachers');
      const allowedT = [];
      const omittedT = [];
      for (const mf of mappedFields) {
        if (/\s+as\s+/i.test(mf) || mf.includes('.') || mf.includes('(')) {
          allowedT.push(mf);
          continue;
        }
        if (teacherCols.has(mf)) {
          allowedT.push(mf);
        } else {
          omittedT.push(mf);
        }
      }
      if (omittedT.length > 0)
        console.warn('Export: omitted non-existing teacher columns:', omittedT.join(', '));
      if (allowedT.length === 0) throw new Error('No valid teacher fields available for export.');
      const fieldSelectionT = allowedT.join(', ');
      query = `SELECT ${fieldSelectionT} FROM teachers`;
      let teacherWhereClauses = [];
      if (options.gender && options.gender !== 'all') {
        if (options.gender === 'men' || options.gender === 'Male') {
          teacherWhereClauses.push('gender = ? AND gender IS NOT NULL');
          params.push('Male');
        } else if (options.gender === 'women' || options.gender === 'Female') {
          teacherWhereClauses.push('gender = ? AND gender IS NOT NULL');
          params.push('Female');
        }
      }
      if (teacherWhereClauses.length > 0) {
        query += ` WHERE ${teacherWhereClauses.join(' AND ')}`;
      }
      query += ' ORDER BY name';
      return allQuery(query, params);
    }
    case 'admins': {
      // Validate admin/user fields against users table
      const userCols = await getTableColumns('users');
      const allowedU = [];
      const omittedU = [];
      for (const mf of mappedFields) {
        if (/\s+as\s+/i.test(mf) || mf.includes('.') || mf.includes('(')) {
          allowedU.push(mf);
          continue;
        }
        if (userCols.has(mf)) {
          allowedU.push(mf);
        } else {
          omittedU.push(mf);
        }
      }
      if (omittedU.length > 0)
        console.warn('Export: omitted non-existing user columns:', omittedU.join(', '));
      if (allowedU.length === 0)
        throw new Error('No valid user/admin fields available for export.');
      const fieldSelectionU = allowedU.join(', ');
      query = `SELECT ${fieldSelectionU} FROM users WHERE role = 'Branch Admin' OR role = 'Superadmin' ORDER BY username`;
      return allQuery(query, params);
    }
    case 'attendance': {
      const attendanceFieldMap = {
        student_name: 's.name as student_name',
        class_name: 'c.name as class_name',
        date: 'a.date',
        status: 'a.status',
      };
      const selectedFields = fields
        .map((f) => attendanceFieldMap[f])
        .filter(Boolean)
        .join(', ');
      if (!selectedFields) {
        throw new Error('No valid attendance fields selected.');
      }
      query = `SELECT ${selectedFields}
               FROM attendance a
               JOIN students s ON s.id = a.student_id
               JOIN classes c ON c.id = a.class_id`;
      const whereClauses = ['a.date BETWEEN ? AND ?'];
      const params = [options.startDate, options.endDate];

      if (options.classId && options.classId !== 'all') {
        whereClauses.push('c.id = ?');
        params.push(options.classId);
      }

      query += ` WHERE ${whereClauses.join(' AND ')} ORDER BY a.date`;
      return allQuery(query, params);
    }
    case 'classes': {
      // Export classes: validate selected columns against the classes table
      // Note: teacher_name is joined from teachers table
      const classCols = await getTableColumns('classes');
      const allowed = [];
      const omitted = [];
      for (const mf of mappedFields) {
        // keep expressions (contain space 'as' or a dot for joined aliases) unfiltered
        if (/\s+as\s+/i.test(mf) || mf.includes('.') || mf.includes('(')) {
          allowed.push(mf);
          continue;
        }
        if (classCols.has(mf)) {
          allowed.push(mf);
        } else {
          omitted.push(mf);
        }
      }

      if (omitted.length > 0) {
        console.warn('Export: omitted non-existing class columns:', omitted.join(', '));
      }

      if (allowed.length === 0) {
        throw new Error(
          'No valid class fields available for export after validating against DB columns.',
        );
      }

      const fieldSelection = allowed.join(', ');

      query = `SELECT ${fieldSelection} FROM classes c LEFT JOIN teachers t ON c.teacher_id = t.id`;
      // Optional filtering by class id
      if (options.classId && options.classId !== 'all') {
        query += ' WHERE c.id = ?';
        params.push(options.classId);
      }
      query += ' ORDER BY c.name';
      return allQuery(query, params);
    }
    case 'inventory': {
      // Inventory export: validate selected columns against the inventory_items table
      const inventoryCols = await getTableColumns('inventory_items');
      const allowed = [];
      const omitted = [];
      for (const mf of mappedFields) {
        // keep expressions (contain space 'as' or a dot for joined aliases) unfiltered
        if (/\s+as\s+/i.test(mf) || mf.includes('.') || mf.includes('(')) {
          allowed.push(mf);
          continue;
        }
        if (inventoryCols.has(mf)) {
          allowed.push(mf);
        } else {
          omitted.push(mf);
        }
      }

      if (omitted.length > 0) {
        console.warn('Export: omitted non-existing inventory columns:', omitted.join(', '));
      }

      if (allowed.length === 0) {
        throw new Error(
          'No valid inventory fields available for export after validating against DB columns.',
        );
      }

      const fieldSelection = allowed.join(', ');

      query = `SELECT ${fieldSelection} FROM inventory_items i`;
      if (options.category) {
        query += ' WHERE i.category = ?';
        params.push(options.category);
      }
      query += ' ORDER BY i.item_name';
      return allQuery(query, params);
    }
    case 'student-fees': {
      // Student fees export: join student_payments with students table
      // Check if class_id column exists (for backward compatibility)
      let hasClassIdColumn = false;
      try {
        const columns = await allQuery(`PRAGMA table_info(student_payments)`, []);
        hasClassIdColumn = columns.some((col) => col.name === 'class_id');
      } catch (e) {
        // If we can't check, assume it doesn't exist
        hasClassIdColumn = false;
      }

      // Map logical keys to actual DB columns
      const studentFeesMaps = {
        student_matricule: 's.matricule as student_matricule',
        student_name: 's.name as student_name',
        amount: 'sp.amount',
        payment_date: 'sp.payment_date',
        payment_method: 'sp.payment_method',
        payment_type: 'sp.payment_type',
        class_matricule: hasClassIdColumn
          ? 'sp.class_id as class_matricule'
          : 'NULL as class_matricule',
        academic_year: 'sp.academic_year',
        receipt_number: 'sp.receipt_number',
        check_number: 'sp.check_number',
        notes: 'sp.notes',
      };

      const selectedFields = fields
        .map((f) => studentFeesMaps[f])
        .filter(Boolean)
        .join(', ');

      if (!selectedFields) {
        throw new Error('No valid student fees fields selected.');
      }

      query = `SELECT ${selectedFields}
               FROM student_payments sp
               JOIN students s ON sp.student_id = s.id
               ORDER BY sp.payment_date DESC, s.name`;
      return allQuery(query, params);
    }
    case 'expenses': {
      // Expenses export: query transactions table with type = 'EXPENSE'
      // Map logical keys to actual DB columns
      const expenseFieldMaps = {
        date: 'transaction_date as date',
        description: 'description',
        amount: 'amount',
        category_name: 'category as category_name',
        payment_method: 'payment_method',
      };

      const selectedFields = fields
        .map((f) => expenseFieldMaps[f])
        .filter(Boolean)
        .join(', ');

      if (!selectedFields) {
        throw new Error('No valid expense fields selected.');
      }

      query = `SELECT ${selectedFields}
               FROM transactions
               WHERE type = 'EXPENSE'
               ORDER BY transaction_date DESC`;
      return allQuery(query, params);
    }
    default:
      throw new Error(`Invalid export type: ${type}`);
  }
}

// --- Data Localization ---
function localizeData(data) {
  const genderMap = {
    Male: 'ذكر',
    Female: 'أنثى',
    men: 'رجال',
    women: 'نساء',
    kids: 'أطفال',
    all: 'الكل',
  };
  const statusMap = {
    active: 'نشط',
    inactive: 'غير نشط',
    pending: 'معلق',
    present: 'حاضر',
    absent: 'غائب',
    late: 'متأخر',
  };
  const specializationMap = {
    Taajoed: 'تجويد',
    Tajweed: 'تجويد',
    Qiraat: 'قراءات',
    Memorization: 'حفظ',
    Hifdh: 'حفظ',
    'Islamic Studies': 'دراسات إسلامية',
    'Islamic Education': 'تربية إسلامية',
    Fiqh: 'فقه',
    Hadith: 'حديث',
    Aqeedah: 'عقيدة',
    Arabic: 'عربية',
  };
  const roleMap = {
    'Branch Admin': 'مدير فرع',
    Superadmin: 'مدير عام',
    FinanceManager: 'مدير مالي',
    SessionSupervisor: 'مشرف جلسات',
    BranchManager: 'مدير فرع',
    Admin: 'مدير',
  };

  const paymentMethodMap = {
    Cash: 'نقداً',
    'Bank Transfer': 'تحويل بنكي',
    cash: 'نقداً',
    'bank transfer': 'تحويل بنكي',
    CASH: 'نقداً',
    CHECK: 'شيك',
    TRANSFER: 'تحويل بنكي',
  };
  const paymentTypeMap = {
    MONTHLY: 'رسوم شهرية',
    ANNUAL: 'رسوم سنوية',
    SPECIAL: 'رسوم خاصة',
  };
  const donationTypeMap = {
    Cash: 'نقدي',
    'In-kind': 'عيني',
    cash: 'نقدي',
    'in-kind': 'عيني',
    // Add missing mappings
    'In-Kind': 'عيني',
    CASH: 'نقدي',
    'IN-KIND': 'عيني',
  };

  return data.map((row) => {
    const out = { ...row };
    if (out.gender && genderMap[out.gender]) out.gender = genderMap[out.gender];
    if (out.status && statusMap[out.status]) out.status = statusMap[out.status];
    if (out.specialization && specializationMap[out.specialization])
      out.specialization = specializationMap[out.specialization];
    if (out.role && roleMap[out.role]) out.role = roleMap[out.role];
    if (out.payment_method && paymentMethodMap[out.payment_method])
      out.payment_method = paymentMethodMap[out.payment_method];
    if (out.payment_type && paymentTypeMap[out.payment_type])
      out.payment_type = paymentTypeMap[out.payment_type];
    if (out.donation_type && donationTypeMap[out.donation_type])
      out.donation_type = donationTypeMap[out.donation_type];
    return out;
  });
}

// --- PDF Generation ---
async function generatePdf(title, columns, data, outputPath, headerData) {
  const localizedData = localizeData(data);
  let templateHtml = fs.readFileSync(
    path.resolve(__dirname, 'export_templates/report_template.html'),
    'utf8',
  );

  const headers = columns.map((c) => `<th>${c.header}</th>`).join('');
  const rows = localizedData
    .map((item) => {
      const cells = columns.map((c) => `<td>${item[c.key] || ''}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const getBase64Image = (imagePath) => {
    if (!imagePath) return '';
    const candidates = [];
    try {
      if (path.isAbsolute(imagePath)) {
        candidates.push(imagePath);
      } else {
        // user-uploaded files live under userData (internalCopyLogoAsset returns a relative path)
        try {
          const userDataPath = app.getPath('userData');
          candidates.push(path.resolve(userDataPath, imagePath));
        } catch (e) {
          // ignore
        }
        candidates.push(path.resolve(process.cwd(), 'public', imagePath));
        candidates.push(path.resolve(__dirname, '..', 'public', imagePath));
        candidates.push(path.resolve(__dirname, imagePath));
      }
    } catch (e) {
      candidates.push(imagePath);
    }

    for (const p of candidates) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) {
          const buffer = fs.readFileSync(p);
          if (!buffer || buffer.length === 0) continue;
          const ext = path.extname(p).toLowerCase();
          const mimeType =
            ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
          return `data:${mimeType};base64,${buffer.toString('base64')}`;
        }
      } catch (err) {
        continue;
      }
    }
    return '';
  };

  const titleMap = {
    students: 'تقرير الطلاب',
    teachers: 'تقرير المعلمين',
    admins: 'تقرير المستخدمين',
    attendance: 'تقرير الحضور',
  };
  const exportType = title.split(' ')[0].toLowerCase();
  const arabicTitle = titleMap[exportType] || title;

  const gregorianDate = new Date().toLocaleDateString('ar-TN-u-ca-gregory', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hijriDate = new Intl.DateTimeFormat('ar-TN-u-ca-islamic', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const replacements = {
    '{report_title}': arabicTitle,
    '{date}': `${gregorianDate} م / ${hijriDate}`,
    '{table_headers}': headers,
    '{table_rows}': rows,
    '{national_association_name}': headerData.nationalAssociationName || '',
    '{branch_name}': headerData.regionalAssociationName || headerData.localBranchName || '',
    '{image_national}': getBase64Image(headerData.nationalLogoPath),
    '{image_branch}': getBase64Image(headerData.regionalLocalLogoPath),
  };

  for (const [key, value] of Object.entries(replacements)) {
    templateHtml = templateHtml.replace(
      new RegExp(key.replace(/}/g, '\\}').replace(/{/g, '\\{'), 'g'),
      value,
    );
  }

  const tempHtmlPath = path.join(os.tmpdir(), `report-${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, templateHtml);

  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  try {
    await win.loadFile(tempHtmlPath);

    const landscape = columns.length > 4;
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape,
    });

    fs.writeFileSync(outputPath, pdfData);
  } finally {
    win.close();
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

// --- Excel (XLSX) Generation ---
async function generateXlsx(columns, data, outputPath) {
  const localizedData = localizeData(data);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Exported Data');
  worksheet.views = [{ rightToLeft: true }];

  // Define table structure first
  worksheet.columns = columns.map((col) => ({ ...col, width: 25 }));
  // Add data rows
  worksheet.addRows(localizedData);
  // Style the header row of the table
  worksheet.getRow(1).font = { bold: true };

  // --- Insert Title Above the Table (no logos for XLSX exports) ---
  // We'll insert a single title row merged across the table columns.
  const titleMap = {
    students: 'تقرير الطلاب',
    teachers: 'تقرير المعلمين',
    admins: 'تقرير المستخدمين',
    attendance: 'تقرير الحضور',
  };
  // Try to infer export type from the first column's key (caller provides report title in later step)
  const exportTypeGuess = (columns && columns[0] && columns[0].key) || '';
  const arabicTitle = titleMap[exportTypeGuess] || '';
  // Insert one empty row then the title row then another spacer row so headers shift down by 2
  worksheet.insertRow(1, []);
  worksheet.insertRow(2, [arabicTitle]);
  worksheet.mergeCells(2, 1, 2, columns.length);
  const titleCell = worksheet.getCell(2, 1);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.font = { bold: true, size: 16 };
  worksheet.insertRow(3, []);

  // XLSX exports intentionally omit logo resolution helpers to keep sheets focused on data.

  // Note: XLSX exports intentionally omit logos to keep sheets clean and focused on data.

  // Adjust the original table header row style, which has shifted down because of our inserted rows
  // Header row will now be row 4 (two inserted + title + spacer)
  worksheet.getRow(4).font = { bold: true };

  await workbook.xlsx.writeFile(outputPath);
}

async function generateFinancialXlsx(data, outputPath) {
  const workbook = new ExcelJS.Workbook();

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('الملخص');
  summarySheet.views = [{ rightToLeft: true }];
  summarySheet.addRow(['الملخص المالي العام']);
  summarySheet.addRow(['إجمالي الدخل', data.summary.totalIncome]);
  summarySheet.addRow(['إجمالي المصروفات', data.summary.totalExpenses]);
  summarySheet.addRow(['الرصيد الإجمالي', data.summary.balance]);

  // Payments Sheet
  const paymentsSheet = workbook.addWorksheet('الرسوم الدراسية');
  paymentsSheet.views = [{ rightToLeft: true }];
  paymentsSheet.columns = [
    { header: 'الطالب', key: 'student_name', width: 25 },
    { header: 'المبلغ', key: 'amount', width: 15 },
    { header: 'طريقة الدفع', key: 'payment_method', width: 20 },
    { header: 'تاريخ الدفع', key: 'payment_date', width: 20 },
    { header: 'ملاحظات', key: 'notes', width: 30 },
  ];
  paymentsSheet.addRows(data.payments);

  // Salaries Sheet
  const salariesSheet = workbook.addWorksheet('الرواتب');
  salariesSheet.views = [{ rightToLeft: true }];
  salariesSheet.columns = [
    { header: 'المعلم', key: 'teacher_name', width: 25 },
    { header: 'المبلغ', key: 'amount', width: 15 },
    { header: 'تاريخ الدفع', key: 'payment_date', width: 20 },
    { header: 'ملاحظات', key: 'notes', width: 30 },
  ];
  salariesSheet.addRows(data.salaries);

  // Donations Sheet
  const donationsSheet = workbook.addWorksheet('التبرعات');
  donationsSheet.views = [{ rightToLeft: true }];
  donationsSheet.columns = [
    { header: 'اسم المتبرع', key: 'donor_name', width: 25 },
    { header: 'نوع التبرع', key: 'donation_type', width: 15 },
    { header: 'القيمة / الوصف', key: 'amount', width: 20 },
    { header: 'تاريخ التبرع', key: 'donation_date', width: 20 },
    { header: 'ملاحظات', key: 'notes', width: 30 },
  ];
  // Localize donation data before adding to sheet
  const localizedDonations = data.donations.map((d) => {
    const localized = { ...d };
    // Localize donation type
    const donationTypeMap = {
      Cash: 'نقدي',
      'In-kind': 'عيني',
      'In-Kind': 'عيني',
      cash: 'نقدي',
      'in-kind': 'عيني',
    };
    if (localized.donation_type && donationTypeMap[localized.donation_type]) {
      localized.donation_type = donationTypeMap[localized.donation_type];
    }
    // Set amount/description based on type
    localized.amount =
      d.donation_type === 'Cash' || d.donation_type === 'cash' ? d.amount : d.description;
    return localized;
  });

  donationsSheet.addRows(localizedDonations);

  // Expenses Sheet
  const expensesSheet = workbook.addWorksheet('المصاريف');
  expensesSheet.views = [{ rightToLeft: true }];
  expensesSheet.columns = [
    { header: 'الفئة', key: 'category', width: 20 },
    { header: 'المبلغ', key: 'amount', width: 15 },
    { header: 'تاريخ الصرف', key: 'expense_date', width: 20 },
    { header: 'المسؤول', key: 'responsible_person', width: 25 },
    { header: 'الوصف', key: 'description', width: 30 },
  ];
  expensesSheet.addRows(data.expenses);

  await workbook.xlsx.writeFile(outputPath);
}

// --- DOCX Generation ---
async function generateDocx(title, columns, data, outputPath, headerData) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableCell,
    TableRow,
    WidthType,
    AlignmentType,
    VerticalAlign,
    PageOrientation,
    ImageRun,
    Header,
    BorderStyle,
  } = docx;
  const localizedData = localizeData(data);

  const titleMap = {
    students: 'تقرير الطلاب',
    teachers: 'تقرير المعلمين',
    admins: 'تقرير المستخدمين',
    attendance: 'تقرير الحضور',
  };
  const exportType = title.split(' ')[0].toLowerCase();
  const arabicTitle = titleMap[exportType] || title;

  const gregorianDate = new Date().toLocaleDateString('ar-TN-u-ca-gregory', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hijriDate = new Intl.DateTimeFormat('ar-TN-u-ca-islamic', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const tableHeader = new TableRow({
    // Reverse columns so that the first logical column appears on the right in RTL Word docs
    children: [...columns].reverse().map(
      (col) =>
        new TableCell({
          children: [
            new Paragraph({
              text: col.header,
              alignment: AlignmentType.CENTER,
              bidirectional: true,
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        }),
    ),
    tableHeader: true,
  });

  const dataRows = localizedData.map(
    (item) =>
      new TableRow({
        // Reverse column order for RTL
        children: [...columns]
          .slice()
          .reverse()
          .map(
            (col) =>
              new TableCell({
                children: [
                  new Paragraph({
                    // Preserve numeric 0 and boolean false (only convert null/undefined to empty)
                    children: (() => {
                      const cellValue =
                        item[col.key] === undefined || item[col.key] === null ? '' : item[col.key];

                      return [new TextRun(String(cellValue))];
                    })(),
                    bidirectional: true,
                  }),
                ],
              }),
          ),
      }),
  );

  const mainTable = new Table({
    // For RTL documents the visual order in Word places the first logical column on the right.
    // To ensure columns appear in the logical order expected, reverse the column order in each row
    // when creating the docx Table so that Word lays them out correctly.
    rows: [tableHeader, ...dataRows.map((r) => r)],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    bidirectional: true,
  });

  const getLogo = (logoPath) => {
    if (!logoPath) return null;
    // Try several sensible locations: if absolute, use as-is; otherwise try ./public/<logoPath>
    const candidates = [];
    try {
      if (path.isAbsolute(logoPath)) {
        candidates.push(logoPath);
      } else {
        // Prefer userData (uploaded by user) first
        try {
          const userDataPath = app.getPath('userData');
          candidates.push(path.resolve(userDataPath, logoPath));
        } catch (e) {
          // ignore
        }
        // Then packaged/public paths
        candidates.push(path.resolve(process.cwd(), 'public', logoPath));
        candidates.push(path.resolve(__dirname, '..', 'public', logoPath));
        // also allow relative paths from current module
        candidates.push(path.resolve(__dirname, logoPath));
      }
    } catch (e) {
      candidates.push(logoPath);
    }

    for (const p of candidates) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) {
          const ext = path.extname(p).toLowerCase();
          // only handle common image extensions; skip unknowns to avoid embedding invalid data
          if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) continue;
          const buffer = fs.readFileSync(p);
          if (!buffer || buffer.length === 0) continue;
          return new ImageRun({ data: buffer, transformation: { width: 100, height: 50 } });
        }
      } catch (err) {
        // ignore and try next candidate
        continue;
      }
    }
    return null;
  };

  const nationalLogo = getLogo(headerData.nationalLogoPath);
  const branchLogo = getLogo(headerData.regionalLocalLogoPath);

  const headerTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              (() => {
                const children = [];
                if (branchLogo) children.push(branchLogo);
                // docx requires paragraphs to have at least one child; add a fallback empty TextRun so packer
                // doesn't produce empty paragraphs which can trigger Word recovery warnings.
                children.push(new TextRun(''));
                return new Paragraph({ children, bidirectional: true });
              })(),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [
              new Paragraph({
                text: headerData.nationalAssociationName || '',
                alignment: AlignmentType.CENTER,
                bidirectional: true,
              }),
              new Paragraph({
                text: headerData.localBranchName || headerData.regionalAssociationName || '',
                alignment: AlignmentType.CENTER,
                bidirectional: true,
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          new TableCell({
            children: [
              (() => {
                const children = [];
                if (nationalLogo) children.push(nationalLogo);
                children.push(new TextRun(''));
                return new Paragraph({ children, bidirectional: true });
              })(),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
            orientation: columns.length > 5 ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
        },
        headers: {
          default: new Header({
            children: [headerTable],
          }),
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: arabicTitle, bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun({ text: `${gregorianDate} م / ${hijriDate}`, size: 20 })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }), // Spacer
          mainTable,
        ],
      },
    ],
  });

  // Pack document and write only if packing succeeds. Catch errors and surface them
  try {
    const buffer = await Packer.toBuffer(doc);
    if (!buffer || buffer.length === 0) {
      throw new Error('Packer produced empty buffer for DOCX document');
    }
    fs.writeFileSync(outputPath, buffer);
  } catch (err) {
    // Provide helpful diagnostics in console; do not write an empty/corrupt file
    console.warn('Failed to generate DOCX:', err && err.message ? err.message : err);
    throw err; // let caller handle the error
  }
}

// --- Excel (XLSX) Template Generation ---
async function generateExcelTemplate(outputPath, options = {}) {
  const { sheetName: singleSheetName, returnDefsOnly = false, importType } = options;
  const workbook = new ExcelJS.Workbook();
  const warningMessage =
    '⚠️ الرجاء عدم تعديل عناوين الأعمدة أو هيكل الملف، قم فقط بإضافة بيانات الصفوف.';

  // Simplified sheets - only basic data that can be imported independently
  const sheets = [
    {
      name: 'الطلاب',
      columns: [
        { header: 'الرقم التعريفي', key: 'matricule', width: 20 },
        { header: 'الاسم واللقب', key: 'name', width: 25 },
        { header: 'تاريخ الميلاد', key: 'date_of_birth', width: 15 },
        { header: 'الجنس', key: 'gender', width: 10 },
        { header: 'العنوان', key: 'address', width: 30 },
        { header: 'رقم الهاتف', key: 'contact_info', width: 20 },
        { header: 'البريد الإلكتروني', key: 'email', width: 25 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'مستوى الحفظ', key: 'memorization_level', width: 20 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
        { header: 'اسم ولي الأمر (طفل)', key: 'parent_name', width: 25 },
        { header: 'صلة القرابة (طفل)', key: 'guardian_relation', width: 15 },
        { header: 'هاتف ولي الأمر (طفل)', key: 'parent_contact', width: 20 },
        { header: 'البريد الإلكتروني للولي (طفل)', key: 'guardian_email', width: 25 },
        { header: 'جهة الاتصال في حالات الطوارئ (طفل)', key: 'emergency_contact_name', width: 25 },
        { header: 'هاتف الطوارئ (طفل)', key: 'emergency_contact_phone', width: 20 },
        { header: 'الحالة الصحية (طفل)', key: 'health_conditions', width: 30 },
        { header: 'رقم الهوية', key: 'national_id', width: 20 },
        { header: 'اسم المدرسة (طفل)', key: 'school_name', width: 25 },
        { header: 'المستوى الدراسي (طفل)', key: 'grade_level', width: 15 },
        { header: 'المستوى التعليمي (راشد)', key: 'educational_level', width: 20 },
        { header: 'المهنة (راشد)', key: 'occupation', width: 20 },
        { header: 'الحالة الاجتماعية (راشد)', key: 'civil_status', width: 15 },
        { header: 'أفراد العائلة المسجلون (راشد)', key: 'related_family_members', width: 30 },
        { header: 'فئة الرسوم', key: 'fee_category', width: 20 },
        { header: 'اسم الكفيل', key: 'sponsor_name', width: 25 },
        { header: 'هاتف الكفيل', key: 'sponsor_phone', width: 20 },
        { header: 'رقم هوية الكفيل', key: 'sponsor_cin', width: 20 },
        { header: 'ملاحظات المساعدة المالية', key: 'financial_assistance_notes', width: 30 },
      ],
      dummyData: [
        // طفل - بنت في المدرسة الابتدائية
        {
          name: 'فاطمة أحمد',
          date_of_birth: '2012-03-15',
          gender: 'أنثى',
          national_id: '112233445',
          contact_info: '555-123-456',
          email: 'fatima.ahmed@example.com',
          address: 'حي السلام، شارع المدرسة، رقم 15',
          status: 'نشط',
          memorization_level: 'جزء عم',
          notes: 'طالبة مجتهدة في المدرسة',
          parent_name: 'أحمد محمد',
          guardian_relation: 'أب',
          parent_contact: '555-123-456',
          guardian_email: 'ahmed.mohamed@example.com',
          emergency_contact_name: 'سارة أحمد',
          emergency_contact_phone: '555-987-654',
          health_conditions: 'لا توجد حساسية معروفة',
          school_name: 'مدرسة الروضة الابتدائية',
          grade_level: 'الصف الخامس',
          fee_category: 'CAN_PAY',
          sponsor_name: '',
          sponsor_phone: '',
          sponsor_cin: '',
          financial_assistance_notes: '',
        },
        // طفل - ولد في المدرسة الإعدادية
        {
          name: 'محمد علي',
          date_of_birth: '2010-07-22',
          gender: 'ذكر',
          national_id: '223344556',
          contact_info: '555-234-567',
          email: 'mohamed.ali@example.com',
          address: 'حي النور، شارع الجامع، رقم 8',
          status: 'نشط',
          memorization_level: 'جزء تبارك',
          notes: 'يحب المشاركة في الأنشطة الجماعية',
          parent_name: 'علي حسن',
          guardian_relation: 'أب',
          parent_contact: '555-234-567',
          guardian_email: 'ali.hasan@example.com',
          emergency_contact_name: 'فاطمة علي',
          emergency_contact_phone: '555-876-543',
          health_conditions: 'ربو خفيف',
          school_name: 'مدرسة الإعدادية النموذجية',
          grade_level: 'الصف الثامن',
          fee_category: 'SPONSORED',
          sponsor_name: 'جمعية البر الخيرية',
          sponsor_phone: '555-111-222',
          sponsor_cin: '123456789',
          financial_assistance_notes: 'مكفول من الجمعية الخيرية',
        },
        // راشد - طالب جامعي
        {
          name: 'أحمد محمود',
          date_of_birth: '1998-11-10',
          gender: 'ذكر',
          national_id: '334455667',
          contact_info: '555-345-678',
          email: 'ahmed.mahmoud@example.com',
          address: 'حي الجامعة، شارع الطلبة، رقم 25',
          status: 'نشط',
          memorization_level: 'ختمة كاملة',
          notes: 'طالب في كلية الشريعة، يساعد في التدريس أحياناً',
          educational_level: 'جامعي',
          occupation: 'طالب',
          civil_status: 'أعزب',
          related_family_members: 'أخوه محمد مسجل في نفس الجمعية',
          fee_category: 'CAN_PAY',
          sponsor_name: '',
          sponsor_phone: '',
          sponsor_cin: '',
          financial_assistance_notes: 'يسدد الرسوم بانتظام',
        },
        // راشد - موظف
        {
          name: 'خديجة سالم',
          date_of_birth: '1995-05-30',
          gender: 'أنثى',
          national_id: '445566778',
          contact_info: '555-456-789',
          email: 'khadeeja.salem@example.com',
          address: 'حي الوحدة، شارع النساء، رقم 12',
          status: 'نشط',
          memorization_level: '10 أجزاء',
          notes: 'معلمة في المدرسة، ملتزمة بالحضور',
          educational_level: 'جامعي',
          occupation: 'معلمة',
          civil_status: 'متزوجة',
          related_family_members: 'زوجها وأطفالها الثلاثة',
          fee_category: 'EXEMPT',
          sponsor_name: '',
          sponsor_phone: '',
          sponsor_cin: '',
          financial_assistance_notes: 'معفاة من الرسوم لقاء التدريس',
        },
        // راشد - متقاعد
        {
          name: 'عمر عبدالله',
          date_of_birth: '1965-12-03',
          gender: 'ذكر',
          national_id: '556677889',
          contact_info: '555-567-890',
          email: 'omar.abdullah@example.com',
          address: 'حي الشيوخ، شارع المسجد، رقم 5',
          status: 'نشط',
          memorization_level: 'ختمات متعددة',
          notes: 'شيخ كبير، له دور كبير في الجمعية',
          educational_level: 'ثانوي',
          occupation: 'متقاعد',
          civil_status: 'متزوج',
          related_family_members: 'زوجته وابناؤه الخمسة',
          fee_category: 'EXEMPT',
          sponsor_name: '',
          sponsor_phone: '',
          sponsor_cin: '',
          financial_assistance_notes: 'معفى من الرسوم لسنوات الخدمة الطويلة',
        },
      ],
    },
    {
      name: 'المعلمون',
      columns: [
        { header: 'الرقم التعريفي', key: 'matricule', width: 20 },
        { header: 'الاسم واللقب', key: 'name', width: 25 },
        { header: 'رقم الهوية', key: 'national_id', width: 20 },
        { header: 'رقم الهاتف', key: 'contact_info', width: 20 },
        { header: 'البريد الإلكتروني', key: 'email', width: 25 },
        { header: 'العنوان', key: 'address', width: 30 },
        { header: 'تاريخ الميلاد', key: 'date_of_birth', width: 15 },
        { header: 'الجنس', key: 'gender', width: 10 },
        { header: 'المستوى التعليمي', key: 'educational_level', width: 20 },
        { header: 'التخصص', key: 'specialization', width: 20 },
        { header: 'سنوات الخبرة', key: 'years_of_experience', width: 15 },
        { header: 'أوقات التوفر', key: 'availability', width: 30 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      dummyData: [
        {
          name: 'فاطمة الزهراء',
          national_id: '101010101',
          email: 'fatima@example.com',
          specialization: 'تجويد',
          years_of_experience: 5,
          gender: 'أنثى',
        },
        {
          name: 'خالد حسين',
          national_id: '202020202',
          email: 'khaled@example.com',
          specialization: 'قراءات',
          years_of_experience: 8,
          gender: 'ذكر',
        },
      ],
    },
    {
      name: 'المستخدمون',
      columns: [
        { header: 'الرقم التعريفي', key: 'matricule', width: 20 },
        { header: 'اسم المستخدم', key: 'username', width: 20 },
        { header: 'الاسم الأول', key: 'first_name', width: 20 },
        { header: 'اللقب', key: 'last_name', width: 20 },
        { header: 'تاريخ الميلاد', key: 'date_of_birth', width: 15 },
        { header: 'رقم الهوية', key: 'national_id', width: 20 },
        { header: 'البريد الإلكتروني', key: 'email', width: 25 },
        { header: 'رقم الهاتف', key: 'phone_number', width: 20 },
        { header: 'المهنة', key: 'occupation', width: 20 },
        { header: 'الحالة الاجتماعية', key: 'civil_status', width: 15 },
        { header: 'نوع التوظيف', key: 'employment_type', width: 15 },
        { header: 'تاريخ البدء', key: 'start_date', width: 15 },
        { header: 'تاريخ الانتهاء', key: 'end_date', width: 15 },
        { header: 'الدور', key: 'role', width: 20 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      dummyData: [
        {
          username: 'finance_manager',
          first_name: 'أحمد',
          last_name: 'محمود',
          role: 'FinanceManager', // Updated to match database role
          employment_type: 'contract',
          email: 'manager@example.com',
          national_id: '303030303',
        },
        {
          username: 'session_supervisor',
          first_name: 'نورة',
          last_name: 'سالم',
          role: 'SessionSupervisor', // Updated to match database role
          employment_type: 'volunteer',
          email: 'supervisor@example.com',
          national_id: '404040404',
        },
      ],
    },
    {
      name: 'الفصول',
      columns: [
        { header: 'الرقم التعريفي', key: 'matricule', width: 20 },
        { header: 'اسم الفصل', key: 'name', width: 25 },
        { header: 'معرف المعلم', key: 'teacher_matricule', width: 20 },
        { header: 'اسم المعلم', key: 'teacher_name', width: 25 },
        { header: 'نوع الفصل', key: 'class_type', width: 18 },
        { header: 'الجدول الزمني', key: 'schedule', width: 40 },
        { header: 'تاريخ البدء', key: 'start_date', width: 15 },
        { header: 'تاريخ الانتهاء', key: 'end_date', width: 15 },
        { header: 'السعة', key: 'capacity', width: 10 },
        { header: 'الجنس', key: 'gender', width: 10 },
        { header: 'الحالة', key: 'status', width: 15 },
      ],
      dummyData: [
        {
          name: 'حلقة التحفيظ الصباحية',
          teacher_matricule: '',
          teacher_name: 'خالد حسين',
          class_type: 'تحفيظ',
          // Friendly Arabic schedule example for non-technical users
          schedule: 'الإثنين 08:00-10:00; الأربعاء 09:00-11:00',
          start_date: '2024-09-01',
          end_date: '2025-06-30',
          capacity: 30,
          gender: 'رجال',
          status: 'نشط',
        },
      ],
    },
    {
      name: 'المجموعات',
      columns: [
        { header: 'الرقم التعريفي', key: 'matricule', width: 20 },
        { header: 'اسم المجموعة', key: 'name', width: 25 },
        { header: 'الوصف', key: 'description', width: 40 },
        { header: 'الفئة', key: 'category', width: 20 },
      ],
      dummyData: [
        { name: 'مجموعة الحفظ الصباحية', description: 'لمراجعة الحفظ اليومي', category: 'نساء' },
        { name: 'مجموعة التجويد المسائية', description: 'لتحسين أحكام التلاوة', category: 'رجال' },
      ],
    },
    {
      name: 'المخزون',
      columns: [
        { header: 'الرقم التعريفي', key: 'matricule', width: 20 },
        { header: 'اسم العنصر', key: 'item_name', width: 25 },
        { header: 'الفئة', key: 'category', width: 20 },
        { header: 'الكمية', key: 'quantity', width: 10 },
        { header: 'قيمة الوحدة', key: 'unit_value', width: 15 },
        { header: 'تاريخ الاقتناء', key: 'acquisition_date', width: 18 },
        { header: 'مصدر الاقتناء', key: 'acquisition_source', width: 25 },
        { header: 'الحالة', key: 'condition_status', width: 15 },
        { header: 'موقع التخزين', key: 'location', width: 25 },
        { header: 'ملاحظات', key: 'notes', width: 40 },
      ],
      dummyData: [
        {
          item_name: 'مصحف (نسخة ورقية)',
          category: 'مواد تعليمية',
          quantity: 50,
          unit_value: 15.0,
          acquisition_date: '2024-01-10',
          acquisition_source: 'تبرع',
          condition_status: 'جديد',
        },
        {
          item_name: 'سبورة بيضاء كبيرة',
          category: 'أثاث مكتبي',
          quantity: 5,
          unit_value: 100.0,
          acquisition_date: '2024-02-01',
          acquisition_source: 'شراء',
          condition_status: 'جيد',
        },
      ],
    },
    {
      name: 'رسوم الطلاب',
      columns: [
        { header: 'رقم التعريفي', key: 'student_matricule', width: 18 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'تاريخ الدفع', key: 'payment_date', width: 15 },
        { header: 'طريقة الدفع', key: 'payment_method', width: 15 },
        { header: 'نوع الدفعة', key: 'payment_type', width: 15 },
        { header: 'رقم تعريفي الفصل', key: 'class_matricule', width: 18 },
        { header: 'السنة الدراسية', key: 'academic_year', width: 15 },
        { header: 'رقم الوصل', key: 'receipt_number', width: 15 },
        { header: 'رقم الشيك', key: 'check_number', width: 15 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      dummyData: [
        {
          student_matricule: 'S-0001',
          amount: 50,
          payment_date: '2024-09-10',
          payment_method: 'نقدي',
          payment_type: 'رسوم شهرية',
          class_matricule: '',
          academic_year: '2024-2025',
          receipt_number: 'RCP-001',
          check_number: '',
          notes: 'دفع رسوم شهر سبتمبر',
        },
        {
          student_matricule: 'S-0002',
          amount: 200,
          payment_date: '2024-09-15',
          payment_method: 'شيك',
          payment_type: 'رسوم سنوية',
          class_matricule: '',
          academic_year: '2024-2025',
          receipt_number: 'RCP-002',
          check_number: 'CHK-2024-001',
          notes: 'دفع رسوم سنوية كاملة',
        },
        {
          student_matricule: 'S-0003',
          amount: 75,
          payment_date: '2024-09-20',
          payment_method: 'تحويل',
          payment_type: 'رسوم خاصة',
          class_matricule: 'C-0001',
          academic_year: '2024-2025',
          receipt_number: 'RCP-003',
          check_number: '',
          notes: 'دفع رسوم فصل دراسي خاص',
        },
        {
          student_matricule: 'S-0004',
          amount: 30,
          payment_date: '2024-09-25',
          payment_method: 'نقدي',
          payment_type: 'رسوم شهرية',
          class_matricule: '',
          academic_year: '2024-2025',
          receipt_number: 'RCP-004',
          check_number: '',
          notes: 'دفع جزء من الرسوم الشهرية',
        },
      ],
    },
    {
      name: 'العمليات المالية',
      columns: [
        { header: 'الرقم التسلسلي', key: 'matricule', width: 18 },
        { header: 'النوع', key: 'type', width: 12 },
        { header: 'الفئة', key: 'category', width: 20 },
        { header: 'نوع الوصل', key: 'receipt_type', width: 18 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'التاريخ', key: 'transaction_date', width: 15 },
        { header: 'الوصف', key: 'description', width: 30 },
        { header: 'طريقة الدفع', key: 'payment_method', width: 15 },
        { header: 'رقم الشيك', key: 'check_number', width: 15 },
        { header: 'رقم الوصل', key: 'voucher_number', width: 15 },
        { header: 'اسم الشخص', key: 'related_person_name', width: 25 },
      ],
      dummyData: [
        {
          type: 'مدخول',
          category: 'التبرعات النقدية',
          receipt_type: 'تبرع',
          amount: 100,
          transaction_date: '2024-09-10',
          payment_method: 'نقدي',
          related_person_name: 'فاعل خير',
          description: 'تبرع للمشروع التعليمي',
        },
        {
          type: 'مصروف',
          category: 'الكهرباء والماء',
          amount: 150,
          transaction_date: '2024-09-03',
          payment_method: 'نقدي',
          description: 'فاتورة الكهرباء والماء',
        },
        {
          type: 'مدخول',
          category: 'مداخيل أخرى',
          amount: 250,
          transaction_date: '2024-09-05',
          payment_method: 'شيك',
          check_number: 'CHK-2024-001',
          related_person_name: 'أحمد محمد',
          description: 'دفع رسوم خدمات',
        },
        {
          type: 'مصروف',
          category: 'رواتب المعلمين',
          amount: 400,
          transaction_date: '2024-09-01',
          payment_method: 'تحويل',
          description: 'راتب شهري',
        },
      ],
    },
  ];

  if (returnDefsOnly) {
    return sheets;
  }

  const sheetsToGenerate = singleSheetName
    ? sheets.filter(
        (s) =>
          s.name === singleSheetName || (s.name === 'المعلمون' && singleSheetName === 'المعلمين'),
      )
    : sheets;

  if (sheetsToGenerate.length === 0) {
    throw new Error(`No sheet definition found for: ${singleSheetName}`);
  }

  for (const sheetInfo of sheetsToGenerate) {
    const worksheet = workbook.addWorksheet(sheetInfo.name);
    worksheet.views = [{ rightToLeft: true }];

    // Set columns first, which creates the header row
    worksheet.columns = sheetInfo.columns;

    // Add a comment to the matricule header to explain its use
    if (sheetInfo.columns.some((c) => c.key === 'matricule')) {
      worksheet.getCell('A2').note =
        'اتركه فارغًا للسجلات الجديدة. سيقوم النظام بإنشاء رقم تعريفي تلقائيًا.\n\nاستخدم هذا الحقل فقط للإشارة إلى السجلات الموجودة لتحديثها.';
    }

    worksheet.getRow(2).font = { bold: true }; // Header row is now row 2

    // Insert the warning message as the new first row
    worksheet.spliceRows(1, 0, [warningMessage]);

    // Style the new warning row
    const warningRow = worksheet.getRow(1);
    warningRow.font = { color: { argb: 'FFFF0000' }, bold: true, size: 14 };
    warningRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    warningRow.height = 30;
    worksheet.mergeCells(1, 1, 1, sheetInfo.columns.length);

    // Add dummy data (filter if needed based on importType for financial sheets)
    let dummyDataToAdd = sheetInfo.dummyData;
    if (sheetInfo.dummyData && importType && sheetInfo.name === 'العمليات المالية') {
      if (importType === 'المداخيل') {
        // Show only income examples (مدخول)
        dummyDataToAdd = sheetInfo.dummyData.filter((item) => item.type === 'مدخول');
      } else if (importType === 'المصاريف') {
        // Show only expense examples (مصروف)
        dummyDataToAdd = sheetInfo.dummyData.filter((item) => item.type === 'مصروف');
      } else if (importType === 'رسوم الطلاب') {
        // For student fees, show a mix of payment-related examples or create specific ones
        dummyDataToAdd = sheetInfo.dummyData.filter(
          (item) =>
            item.related_person_name &&
            (item.type === 'مدخول' || item.description.includes('رسوم')),
        );
      }
    }

    if (dummyDataToAdd) {
      worksheet.addRows(dummyDataToAdd);
    }
  }

  // No cross-sheet validations needed for simplified import system

  if (outputPath) {
    await workbook.xlsx.writeFile(outputPath);
  }
}

// --- Dev Data Generation ---
async function generateDevExcelTemplate(outputPath) {
  const workbook = new ExcelJS.Workbook();
  const warningMessage =
    '⚠️ This is a development template. Do not use in production. Do not modify headers.';

  // Comprehensive dummy data
  const studentData = [
    {
      name: 'أحمد بن علي (طفل)',
      national_id: '111000111',
      gender: 'ذكر',
      date_of_birth: '2015-01-15',
      status: 'نشط',
      parent_name: 'علي',
    },
    {
      name: 'فاطمة بنت محمد (مراهقة)',
      national_id: '222000222',
      gender: 'أنثى',
      date_of_birth: '2008-03-20',
      status: 'نشط',
      school_name: 'مدرسة الأمل',
    },
    {
      name: 'خالد عبد الله (بالغ)',
      national_id: '333000333',
      gender: 'ذكر',
      date_of_birth: '1995-07-10',
      status: 'غير نشط',
      occupation: 'مهندس',
    },
    {
      name: 'عائشة عمر (بالغة)',
      national_id: '444000444',
      gender: 'أنثى',
      date_of_birth: '1999-11-05',
      status: 'نشط',
      educational_level: 'جامعي',
    },
  ];

  const teacherData = [
    {
      name: 'الأستاذ محمود',
      national_id: '999888777',
      specialization: 'تجويد',
      email: 'mahmoud@dev.com',
      availability: 'دوام كامل',
      gender: 'ذكر',
    },
    {
      name: 'الأستاذة سعاد',
      national_id: '888777666',
      specialization: 'حفظ',
      email: 'souad@dev.com',
      availability: 'صباحي فقط',
      gender: 'أنثى',
    },
  ];

  const userData = [
    {
      username: 'fin_manager',
      first_name: 'مدير',
      last_name: 'المالية',
      role: 'FinanceManager',
      employment_type: 'contract',
      start_date: '2023-01-01',
    },
    {
      username: 'session_sup',
      first_name: 'مشرف',
      last_name: 'الحصص',
      role: 'SessionSupervisor',
      employment_type: 'volunteer',
    },
  ];

  // Legacy donation/expense data not used in unified dev template

  const attendanceData = [
    {
      student_matricule: 'S-000001',
      class_name: 'فصل الصغار',
      date: '2024-09-06',
      status: 'حاضر',
    },
    {
      student_matricule: 'S-000002',
      class_name: 'حلقة التجويد للمبتدئين',
      date: '2024-09-06',
      status: 'غائب',
    },
    {
      student_matricule: 'S-000001',
      class_name: 'حلقة التجويد للمبتدئين',
      date: '2024-09-07',
      status: 'متأخر',
    }, // Student in multiple classes
  ];

  const groupData = [
    { name: 'مجموعة الحفظ الصباحية', description: 'لمراجعة الحفظ اليومي', category: 'نساء' },
    { name: 'مجموعة التجويد المسائية', description: 'لتحسين أحكام التلاوة', category: 'رجال' },
  ];

  const inventoryData = [
    {
      item_name: 'مصحف (نسخة ورقية) - مجموعة 1',
      category: 'مواد تعليمية',
      quantity: 50,
      unit_value: 15.0,
      acquisition_date: '2024-01-10',
      condition_status: 'جديد',
    },
    {
      item_name: 'سبورة بيضاء كبيرة - قاعة 1',
      category: 'أثاث مكتبي',
      quantity: 5,
      unit_value: 100.0,
      acquisition_date: '2024-02-01',
      condition_status: 'مستخدم',
    },
  ];

  const allSheetDefs = await generateExcelTemplate(null, true);
  const getCols = (name) => {
    const def = allSheetDefs.find((s) => s.name === name);
    if (!def) throw new Error(`Sheet definition not found for: ${name}`);
    return def.columns;
  };

  // Dev template sheets - match importConstants.js exactly
  const sheets = [
    { name: 'الطلاب', columns: getCols('الطلاب'), dummyData: studentData },
    { name: 'المعلمون', columns: getCols('المعلمون'), dummyData: teacherData },
    { name: 'المستخدمون', columns: getCols('المستخدمون'), dummyData: userData },
    { name: 'الفصول', columns: getCols('الفصول'), dummyData: [] },
    { name: 'العمليات المالية', columns: getCols('العمليات المالية'), dummyData: [] },
    { name: 'الحضور', columns: getCols('الحضور'), dummyData: attendanceData },
    { name: 'المجموعات', columns: getCols('المجموعات'), dummyData: groupData },
    { name: 'المخزون', columns: getCols('المخزون'), dummyData: inventoryData },
  ];

  for (const sheetInfo of sheets) {
    const worksheet = workbook.addWorksheet(sheetInfo.name);
    worksheet.views = [{ rightToLeft: true }];
    worksheet.columns = sheetInfo.columns;
    worksheet.getRow(1).font = { bold: true };
    worksheet.spliceRows(1, 0, [warningMessage]);
    const warningRow = worksheet.getRow(1);
    warningRow.font = { color: { argb: 'FFFF0000' }, bold: true, size: 14 };
    worksheet.mergeCells(1, 1, 1, sheetInfo.columns.length);
    worksheet.addRows(sheetInfo.dummyData);
  }

  await workbook.xlsx.writeFile(outputPath);
}

module.exports = {
  getExportHeaderData,
  fetchExportData,
  fetchFinancialData,
  localizeData,
  generatePdf,
  generateXlsx,
  generateFinancialXlsx,
  generateDocx,
  generateExcelTemplate,
  generateDevExcelTemplate,
};
