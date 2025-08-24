const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { allQuery } = require(path.join(__dirname, '..', 'db', 'db.js'));
const { getSetting } = require(path.join(__dirname, 'settingsManager.js'));
const {
  handleGetFinancialSummary,
  handleGetPayments,
  handleGetSalaries,
  handleGetDonations,
  handleGetExpenses,
} = require(path.join(__dirname, 'financialHandlers.js'));

// --- Data Fetching ---
async function fetchFinancialData() {
  const [summary, payments, salaries, donations, expenses] = await Promise.all([
    handleGetFinancialSummary(),
    handleGetPayments(),
    handleGetSalaries(),
    handleGetDonations(),
    handleGetExpenses(),
  ]);
  return { summary, payments, salaries, donations, expenses };
}

async function fetchExportData({ type, fields, options = {} }) {
  if (!fields || fields.length === 0) {
    throw new Error('No fields selected for export.');
  }
  const fieldSelection = fields.join(', ');
  let query = '';
  let params = [];
  let whereClauses = ['1=1'];

  switch (type) {
    case 'students': {
      query = `SELECT ${fieldSelection} FROM students`;
      const adultAge = getSetting('adultAgeThreshold');
      if (options.gender) {
        if (options.gender === 'men') {
          whereClauses.push('gender = ?');
          params.push('Male');
          whereClauses.push(`strftime('%Y', 'now') - strftime('%Y', date_of_birth) >= ?`);
          params.push(adultAge);
        } else if (options.gender === 'women') {
          whereClauses.push('gender = ?');
          params.push('Female');
          whereClauses.push(`strftime('%Y', 'now') - strftime('%Y', date_of_birth) >= ?`);
          params.push(adultAge);
        } else if (options.gender === 'kids') {
          whereClauses.push(`strftime('%Y', 'now') - strftime('%Y', date_of_birth) < ?`);
          params.push(adultAge);
        }
      }
      query += ` WHERE ${whereClauses.join(' AND ')} ORDER BY name`;
      break;
    }
    case 'teachers': {
      query = `SELECT ${fieldSelection} FROM teachers`;
      if (options.gender) {
        if (options.gender === 'men') {
          whereClauses.push('gender = ?');
          params.push('Male');
        } else if (options.gender === 'women') {
          whereClauses.push('gender = ?');
          params.push('Female');
        }
      }
      query += ` WHERE ${whereClauses.join(' AND ')} ORDER BY name`;
      break;
    }
    case 'admins':
      query = `SELECT ${fieldSelection} FROM users WHERE role = 'Branch Admin' OR role = 'Superadmin' ORDER BY username`;
      break;
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
               JOIN classes c ON c.id = a.class_id
               WHERE a.date BETWEEN ? AND ?
               ORDER BY a.date`;
      return allQuery(query, [options.startDate, options.endDate]);
    }
    default:
      throw new Error(`Invalid export type: ${type}`);
  }
  return allQuery(query, params);
}

// --- Data Localization ---
function localizeData(data) {
  const genderMap = {
    Male: 'ذكر',
    Female: 'أنثى',
  };
  return data.map((row) => {
    if (row.gender && genderMap[row.gender]) {
      return { ...row, gender: genderMap[row.gender] };
    }
    return row;
  });
}

// --- PDF Generation ---
async function generatePdf(title, columns, data, outputPath) {
  const localizedData = localizeData(data);
  // 1. Create the HTML content
  const templatePath = path.resolve(__dirname, 'export_templates/report_template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  const headers = columns.map((c) => `<th>${c.header}</th>`).join('');
  const rows = localizedData
    .map((item) => {
      const cells = columns.map((c) => `<td>${item[c.key] || ''}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  let finalHtml = templateHtml.replace('{title}', title);
  finalHtml = finalHtml.replace('{date}', new Date().toLocaleDateString('ar-SA'));
  finalHtml = finalHtml.replace('{table_headers}', headers);
  finalHtml = finalHtml.replace('{table_rows}', rows);

  // 2. Write to a temporary HTML file
  const tempHtmlPath = path.join(os.tmpdir(), `report-${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, finalHtml);

  // 3. Create a hidden browser window
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  try {
    await win.loadFile(tempHtmlPath);

    // 4. Print the window's contents to PDF
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
    });

    // 5. Save the PDF
    fs.writeFileSync(outputPath, pdfData);
  } finally {
    // 6. Clean up
    win.close();
    fs.unlinkSync(tempHtmlPath);
  }
}

// --- Excel (XLSX) Generation ---
async function generateXlsx(columns, data, outputPath) {
  const localizedData = localizeData(data);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Exported Data');
  worksheet.views = [{ rightToLeft: true }];

  worksheet.columns = columns.map((col) => ({ ...col, width: 25 }));

  worksheet.addRows(localizedData);
  worksheet.getRow(1).font = { bold: true };
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
  donationsSheet.addRows(
    data.donations.map((d) => ({
      ...d,
      amount: d.donation_type === 'Cash' ? d.amount : d.description,
    })),
  );

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
function generateDocx(title, columns, data, outputPath) {
  const localizedData = localizeData(data);
  const templatePath = path.resolve(__dirname, 'export_templates/export_template.docx');
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `TEMPLATE_NOT_FOUND: DOCX template not found at ${templatePath}. Please create it.`,
    );
  }
  const content = fs.readFileSync(templatePath, 'binary');

  let zip;
  try {
    zip = new PizZip(content);
  } catch (error) {
    throw new Error(
      'TEMPLATE_INVALID: Could not read the DOCX template. Is it a valid, non-empty Word document?',
    );
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const templateData = {
    title: title,
    date: new Date().toLocaleDateString('ar-SA'),
    c1: columns[0]?.header || '',
    c2: columns[1]?.header || '',
    c3: columns[2]?.header || '',
    c4: columns[3]?.header || '',
    data: localizedData.map((item) => {
      return {
        d1: item[columns[0]?.key] || '',
        d2: item[columns[1]?.key] || '',
        d3: item[columns[2]?.key] || '',
        d4: item[columns[3]?.key] || '',
      };
    }),
  };

  doc.render(templateData);
  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  fs.writeFileSync(outputPath, buf);
}

// --- Excel (XLSX) Template Generation ---
async function generateExcelTemplate(outputPath, returnDefsOnly = false) {
  const workbook = new ExcelJS.Workbook();
  const warningMessage =
    '⚠️ الرجاء عدم تعديل عناوين الأعمدة أو هيكل الملف، قم فقط بإضافة بيانات الصفوف.';

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
        { header: 'اسم ولي الأمر', key: 'parent_name', width: 25 },
        { header: 'صلة القرابة', key: 'guardian_relation', width: 15 },
        { header: 'هاتف ولي الأمر', key: 'parent_contact', width: 20 },
        { header: 'البريد الإلكتروني للولي', key: 'guardian_email', width: 25 },
        { header: 'جهة الاتصال في حالات الطوارئ', key: 'emergency_contact_name', width: 25 },
        { header: 'هاتف الطوارئ', key: 'emergency_contact_phone', width: 20 },
        { header: 'الحالة الصحية', key: 'health_conditions', width: 30 },
        { header: 'رقم الهوية', key: 'national_id', width: 20 },
        { header: 'اسم المدرسة', key: 'school_name', width: 25 },
        { header: 'المستوى الدراسي', key: 'grade_level', width: 15 },
        { header: 'المستوى التعليمي', key: 'educational_level', width: 20 },
        { header: 'المهنة', key: 'occupation', width: 20 },
        { header: 'الحالة الاجتماعية', key: 'civil_status', width: 15 },
        { header: 'أفراد العائلة المسجلون', key: 'related_family_members', width: 30 },
        { header: 'ملاحظات المساعدة المالية', key: 'financial_assistance_notes', width: 30 },
      ],
      dummyData: [
        {
          name: 'علي محمد',
          date_of_birth: '2005-04-10',
          gender: 'Male',
          national_id: '111222333',
          status: 'active',
          memorization_level: '5 أجزاء',
        },
        {
          name: 'سارة عبدالله',
          date_of_birth: '2006-08-22',
          gender: 'Female',
          national_id: '222333444',
          status: 'active',
          memorization_level: '3 أجزاء',
          parent_name: 'عبدالله أحمد',
          parent_contact: '555-123-456',
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
          gender: 'Female',
        },
        {
          name: 'خالد حسين',
          national_id: '202020202',
          email: 'khaled@example.com',
          specialization: 'قراءات',
          years_of_experience: 8,
          gender: 'Male',
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
          username: 'manager_user',
          first_name: 'أحمد',
          last_name: 'محمود',
          role: 'Manager',
          employment_type: 'contract',
          email: 'manager@example.com',
          national_id: '303030303',
        },
        {
          username: 'admin_user',
          first_name: 'نورة',
          last_name: 'سالم',
          role: 'Admin',
          employment_type: 'volunteer',
          email: 'admin@example.com',
          national_id: '404040404',
        },
      ],
    },
    {
      name: 'الفصول',
      columns: [
        { header: 'اسم الفصل', key: 'name', width: 25 },
        { header: 'نوع الفصل', key: 'class_type', width: 20 },
        { header: 'الرقم التعريفي للمعلم', key: 'teacher_matricule', width: 25 },
        { header: 'الجدول الزمني (JSON)', key: 'schedule', width: 30 },
        { header: 'تاريخ البدء', key: 'start_date', width: 15 },
        { header: 'تاريخ الانتهاء', key: 'end_date', width: 15 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'السعة', key: 'capacity', width: 10 },
        { header: 'الجنس', key: 'gender', width: 15 },
      ],
    },
    {
      name: 'الرسوم الدراسية',
      columns: [
        { header: 'الرقم التعريفي للطالب', key: 'student_matricule', width: 25 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'تاريخ الدفع (YYYY-MM-DD)', key: 'payment_date', width: 20 },
        { header: 'طريقة الدفع', key: 'payment_method', width: 20 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
    },
    {
      name: 'الرواتب',
      columns: [
        { header: 'الرقم التعريفي للمعلم', key: 'teacher_matricule', width: 25 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'تاريخ الدفع (YYYY-MM-DD)', key: 'payment_date', width: 20 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
    },
    {
      name: 'التبرعات',
      columns: [
        { header: 'اسم المتبرع', key: 'donor_name', width: 25 },
        { header: 'نوع التبرع (Cash/In-kind)', key: 'donation_type', width: 20 },
        { header: 'المبلغ (للتبرع النقدي)', key: 'amount', width: 20 },
        { header: 'وصف (للتبرع العيني)', key: 'description', width: 30 },
        { header: 'تاريخ التبرع (YYYY-MM-DD)', key: 'donation_date', width: 20 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      dummyData: [
        {
          donor_name: 'فاعل خير',
          donation_type: 'Cash',
          amount: 500,
          donation_date: '2024-09-10',
        },
        {
          donor_name: 'مكتبة المدينة',
          donation_type: 'In-kind',
          description: '50 مصحف',
          donation_date: '2024-09-11',
        },
      ],
    },
    {
      name: 'المصاريف',
      columns: [
        { header: 'الفئة', key: 'category', width: 20 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'تاريخ الصرف (YYYY-MM-DD)', key: 'expense_date', width: 20 },
        { header: 'المسؤول', key: 'responsible_person', width: 25 },
        { header: 'الوصف', key: 'description', width: 30 },
      ],
      dummyData: [
        {
          category: 'فواتير',
          amount: 150,
          expense_date: '2024-09-03',
          responsible_person: 'أحمد محمود',
          description: 'فاتورة الكهرباء',
        },
      ],
    },
    {
      name: 'الحاضر',
      columns: [
        { header: 'الرقم التعريفي للطالب', key: 'student_matricule', width: 25 },
        { header: 'اسم الفصل', key: 'class_name', width: 25 },
        { header: 'التاريخ (YYYY-MM-DD)', key: 'date', width: 20 },
        { header: 'الحالة (present/absent/late/excused)', key: 'status', width: 25 },
      ],
    },
  ];

  if (returnDefsOnly) {
    return sheets;
  }

  for (const sheetInfo of sheets) {
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

    // Add dummy data
    if (sheetInfo.dummyData) {
      worksheet.addRows(sheetInfo.dummyData);
    }
  }

  // --- Add Data Validations for Dropdowns ---
  const studentsSheet = workbook.getWorksheet('الطلاب');
  const teachersSheet = workbook.getWorksheet('المعلمون');
  const classesSheet = workbook.getWorksheet('الفصول');
  const attendanceSheet = workbook.getWorksheet('الحاضر');
  const paymentsSheet = workbook.getWorksheet('الرسوم الدراسية');
  const salariesSheet = workbook.getWorksheet('الرواتب');

  // Define ranges for the dropdown lists. Covers the dummy data + 1000 extra rows.
  const studentMatriculeRange = `'الطلاب'!$A$3:$A$1002`;
  const teacherMatriculeRange = `'المعلمون'!$A$3:$A$1002`;

  const applyValidation = (worksheet, column, range) => {
    if (!worksheet) return;
    for (let i = 3; i <= 1002; i++) {
      worksheet.getCell(`${column}${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [range],
        showErrorMessage: true,
        error: 'الرجاء الاختيار من القائمة المنسدلة.',
      };
    }
  };

  applyValidation(paymentsSheet, 'A', studentMatriculeRange);
  applyValidation(salariesSheet, 'A', teacherMatriculeRange);
  applyValidation(classesSheet, 'C', teacherMatriculeRange);
  applyValidation(attendanceSheet, 'A', studentMatriculeRange);


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
    { name: 'أحمد بن علي (طفل)', national_id: '111000111', gender: 'Male', date_of_birth: '2015-01-15', status: 'active', parent_name: 'علي' },
    { name: 'فاطمة بنت محمد (مراهقة)', national_id: '222000222', gender: 'Female', date_of_birth: '2008-03-20', status: 'active', school_name: 'مدرسة الأمل' },
    { name: 'خالد عبد الله (بالغ)', national_id: '333000333', gender: 'Male', date_of_birth: '1995-07-10', status: 'inactive', occupation: 'مهندس' },
    { name: 'عائشة عمر (بالغة)', national_id: '444000444', gender: 'Female', date_of_birth: '1999-11-05', status: 'active', educational_level: 'جامعي' },
  ];

  const teacherData = [
    { name: 'الأستاذ محمود', national_id: '999888777', specialization: 'تجويد', email: 'mahmoud@dev.com', availability: 'دوام كامل' },
    { name: 'الأستاذة سعاد', national_id: '888777666', specialization: 'حفظ', email: 'souad@dev.com', availability: 'صباحي فقط' },
  ];

  const userData = [
      { username: 'fin_manager', first_name: 'مدير', last_name: 'المالية', role: 'FinanceManager', employment_type: 'contract', start_date: '2023-01-01' },
      { username: 'session_sup', first_name: 'مشرف', last_name: 'الحصص', role: 'SessionSupervisor', employment_type: 'volunteer' },
  ]

  const classData = [
      { name: 'حلقة التجويد للمبتدئين', teacher_matricule: 'T-000001', gender: 'all', capacity: 15, status: 'active' },
      { name: 'دورة الحفظ المكثفة', teacher_matricule: 'T-000002', gender: 'men', capacity: 10, status: 'pending' },
      { name: 'فصل الصغار', teacher_matricule: 'T-000001', gender: 'kids', capacity: 20, status: 'active' },
  ];

  const paymentData = [
      { student_matricule: 'S-000001', amount: 50, payment_date: '2024-09-01' },
      { student_matricule: 'S-000002', amount: 50, payment_date: '2024-09-02' },
      { student_matricule: 'S-000004', amount: 75, payment_date: '2024-09-03' },
  ];

  const salaryData = [
      { teacher_matricule: 'T-000001', amount: 1200, payment_date: '2024-09-05' },
      { teacher_matricule: 'T-000002', amount: 1350, payment_date: '2024-09-05' },
  ];

  const donationData = [
      { donor_name: 'فاعل خير (للتطوير)', donation_type: 'Cash', amount: 1000, donation_date: '2024-09-10' },
      { donor_name: 'مكتبة (للتطوير)', donation_type: 'In-kind', description: '100 مصحف', donation_date: '2024-09-11' },
  ];

  const expenseData = [
      { category: 'لوازم مكتبية', amount: 75, expense_date: '2024-09-03', responsible_person: 'مدير المالية' },
      { category: 'كهرباء وماء', amount: 250, expense_date: '2024-09-04', responsible_person: 'مدير المالية' },
  ];

  const attendanceData = [
      { student_matricule: 'S-000001', class_name: 'فصل الصغار', date: '2024-09-06', status: 'present' },
      { student_matricule: 'S-000002', class_name: 'حلقة التجويد للمبتدئين', date: '2024-09-06', status: 'absent' },
      { student_matricule: 'S-000001', class_name: 'حلقة التجويد للمبتدئين', date: '2024-09-07', status: 'late' }, // Student in multiple classes
  ];


  const allSheetDefs = await generateExcelTemplate(null, true);
  const getCols = (name) => allSheetDefs.find(s => s.name === name).columns;

  const sheets = [
    { name: 'الطلاب', columns: getCols('الطلاب'), dummyData: studentData },
    { name: 'المعلمون', columns: getCols('المعلمون'), dummyData: teacherData },
    { name: 'المستخدمون', columns: getCols('المستخدمون'), dummyData: userData },
    { name: 'الفصول', columns: getCols('الفصول'), dummyData: classData },
    { name: 'الرسوم الدراسية', columns: getCols('الرسوم الدراسية'), dummyData: paymentData },
    { name: 'الرواتب', columns: getCols('الرواتب'), dummyData: salaryData },
    { name: 'التبرعات', columns: getCols('التبرعات'), dummyData: donationData },
    { name: 'المصاريف', columns: getCols('المصاريف'), dummyData: expenseData },
    { name: 'الحاضر', columns: getCols('الحاضر'), dummyData: attendanceData },
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
  fetchExportData,
  fetchFinancialData,
  generatePdf,
  generateXlsx,
  generateFinancialXlsx,
  generateDocx,
  generateExcelTemplate,
  generateDevExcelTemplate,
};
