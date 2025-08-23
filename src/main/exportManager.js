const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { allQuery } = require('../db/db');
const { getSetting } = require('./settingsManager');
const {
  handleGetFinancialSummary,
  handleGetPayments,
  handleGetSalaries,
  handleGetDonations,
  handleGetExpenses,
} = require('./financialHandlers');

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
      dummyData: [
        {
          name: 'فصل التجويد المتقدم',
          class_type: 'حلقة',
          teacher_matricule: 'T-000001',
          gender: 'women',
          status: 'pending',
          capacity: 20,
          schedule: '[{"day":"Monday","time":"After Asr"}]',
        },
        {
          name: 'فصل القراءات',
          class_type: 'دورة',
          teacher_matricule: 'T-000002',
          gender: 'men',
          status: 'pending',
          capacity: 15,
          start_date: '2024-09-01',
        },
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
      dummyData: [
        {
          student_matricule: 'S-000001',
          amount: 100,
          payment_date: '2024-09-01',
          payment_method: 'Cash',
        },
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
      dummyData: [
        { teacher_matricule: 'T-000001', amount: 1500, payment_date: '2024-09-05' },
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
      dummyData: [
        {
          student_matricule: 'S-000001',
          class_name: 'فصل التجويد المتقدم',
          date: '2024-09-02',
          status: 'present',
        },
        {
          student_matricule: 'S-000002',
          class_name: 'فصل التجويد المتقدم',
          date: '2024-09-02',
          status: 'absent',
        },
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
    worksheet.getRow(1).font = { bold: true };

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

  await workbook.xlsx.writeFile(outputPath);
}

// --- Dev Data Generation ---
async function generateDevExcelTemplate(outputPath) {
  const workbook = new ExcelJS.Workbook();
  const warningMessage =
    '⚠️ This is a development template. Do not use in production. Do not modify headers.';

  const studentData = [
    { name: 'أحمد بن علي', national_id: '111000111', gender: 'Male', date_of_birth: '2005-01-15', status: 'active' },
    { name: 'فاطمة بنت محمد', national_id: '222000222', gender: 'Female', date_of_birth: '2006-03-20', status: 'active' },
    { name: 'خالد عبد الله', national_id: '333000333', gender: 'Male', date_of_birth: '2004-07-10', status: 'inactive' },
    { name: 'عائشة عمر', national_id: '444000444', gender: 'Female', date_of_birth: '2007-11-05', status: 'active' },
    { name: 'يوسف إبراهيم', national_id: '555000555', gender: 'Male', date_of_birth: '1998-02-25', status: 'graduated' },
    { name: 'مريم حسن', national_id: '666000666', gender: 'Female', date_of_birth: '1999-09-12', status: 'active' },
  ];

  const teacherData = [
    { name: 'الأستاذ محمود', national_id: '999888777', specialization: 'تجويد', email: 'mahmoud@dev.com' },
    { name: 'الأستاذة سعاد', national_id: '888777666', specialization: 'حفظ', email: 'souad@dev.com' },
  ];

  const classData = [
      { name: 'حلقة التجويد للمبتدئين', teacher_national_id: '999888777', gender: 'all' },
      { name: 'دورة الحفظ المكثفة', teacher_national_id: '888777666', gender: 'all' },
  ];

  const paymentData = [
      { student_national_id: '111000111', amount: 50, payment_date: '2024-09-01' },
      { student_national_id: '222000222', amount: 50, payment_date: '2024-09-02' },
  ];

  const salaryData = [
      { teacher_national_id: '999888777', amount: 1200, payment_date: '2024-09-05' },
  ];

  const donationData = [
      { donor_name: 'فاعل خير (للتطوير)', donation_type: 'Cash', amount: 1000, donation_date: '2024-09-10' },
  ];

  const expenseData = [
      { category: 'لوازم مكتبية', amount: 75, expense_date: '2024-09-03' },
  ];

  const attendanceData = [
      { student_national_id: '111000111', class_name: 'حلقة التجويد للمبتدئين', date: '2024-09-06', status: 'present' },
      { student_national_id: '222000222', class_name: 'حلقة التجويد للمبتدئين', date: '2024-09-06', status: 'absent' },
  ];


  const sheets = [
    { name: 'الطلاب', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'الطلاب').columns, dummyData: studentData },
    { name: 'المعلمون', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'المعلمون').columns, dummyData: teacherData },
    { name: 'الفصول', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'الفصول').columns, dummyData: classData },
    { name: 'الرسوم الدراسية', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'الرسوم الدراسية').columns, dummyData: paymentData },
    { name: 'الرواتب', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'الرواتب').columns, dummyData: salaryData },
    { name: 'التبرعات', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'التبرعات').columns, dummyData: donationData },
    { name: 'المصاريف', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'المصاريف').columns, dummyData: expenseData },
    { name: 'الحاضر', columns: (await generateExcelTemplate(null, true)).find(s => s.name === 'الحضور').columns, dummyData: attendanceData },
    // No users sheet for dev data to avoid conflicts with superadmin
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
