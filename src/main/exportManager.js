const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const docx = require('docx');
const { allQuery } = require('../db/db');
const { getSetting } = require('./settingsManager');
const {
  handleGetFinancialSummary,
  handleGetPayments,
  handleGetSalaries,
  handleGetDonations,
  handleGetExpenses,
} = require('./financialHandlers');

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
    const resolvedPath = path.resolve(process.cwd(), 'public', imagePath);
    if (!fs.existsSync(resolvedPath)) return '';
    const imageBuffer = fs.readFileSync(resolvedPath);
    const mimeType = resolvedPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
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
    templateHtml = templateHtml.replace(new RegExp(key.replace(/}/g, '\\}').replace(/{/g, '\\{'), 'g'), value);
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
async function generateXlsx(columns, data, outputPath, headerData) {
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

  // --- Insert Header Information Above the Table ---
  const headerRowCount = 4; // 3 for logos/space, 1 for names
  worksheet.insertRows(1, Array(headerRowCount).fill([]));

  // Helper to add images
  const addImageToWorksheet = (imagePath, range) => {
    if (!imagePath) return;
    const resolvedPath = path.resolve(process.cwd(), 'public', imagePath);
    if (fs.existsSync(resolvedPath)) {
      const ext = path.extname(resolvedPath).substring(1);
      const imageId = workbook.addImage({
        buffer: fs.readFileSync(resolvedPath),
        extension: ext === 'jpg' ? 'jpeg' : ext,
      });
      worksheet.addImage(imageId, range);
    }
  };

  // Add logos to the top-left and top-right of the sheet
  const maxCol = columns.length > 1 ? columns.length - 1 : 1;
  addImageToWorksheet(headerData.nationalLogoPath, {
    tl: { col: 0, row: 0 },
    ext: { width: 100, height: 50 },
  });
  addImageToWorksheet(headerData.regionalLocalLogoPath, {
    tl: { col: maxCol - 1 > 0 ? maxCol -1 : 0, row: 0 },
    ext: { width: 100, height: 50 },
  });


  // Add Association Names, centered
  const mergeAcross = `A4:${String.fromCharCode(65 + maxCol)}4`;
  worksheet.mergeCells(mergeAcross);
  const titleCell = worksheet.getCell('A4');
  const branchName = headerData.regionalAssociationName || headerData.localBranchName;
  titleCell.value = `${headerData.nationalAssociationName || ''} - ${branchName || ''}`;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.font = { bold: true, size: 16 };

  // Adjust the original table header row style, which has now shifted down
  worksheet.getRow(headerRowCount + 1).font = { bold: true };

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
async function generateDocx(title, columns, data, outputPath, headerData) {
  const { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, WidthType, AlignmentType, VerticalAlign, PageOrientation, ImageRun, Header, BorderStyle } = docx;
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
    children: columns.map(
      (col) =>
        new TableCell({
          children: [new Paragraph({ text: col.header, alignment: AlignmentType.CENTER })],
          verticalAlign: VerticalAlign.CENTER,
        }),
    ),
    tableHeader: true,
  });

  const dataRows = localizedData.map(
    (item) =>
      new TableRow({
        children: columns.map(
          (col) =>
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun(String(item[col.key] || ''))],
                bidirectional: true,
              })],
            }),
        ),
      }),
  );

  const mainTable = new Table({
    rows: [tableHeader, ...dataRows],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    bidirectional: true,
  });

  const getLogo = (logoPath) => {
    if (!logoPath) return null;
    const resolvedPath = path.resolve(process.cwd(), 'public', logoPath);
    if (fs.existsSync(resolvedPath)) {
      return new ImageRun({
        data: fs.readFileSync(resolvedPath),
        transformation: { width: 100, height: 50 },
      });
    }
    return null;
  }

  const nationalLogo = getLogo(headerData.nationalLogoPath);
  const branchLogo = getLogo(headerData.regionalLocalLogoPath);

  const headerTable = new Table({
    rows: [new TableRow({
        children: [
            new TableCell({ children: [new Paragraph({ children: [branchLogo].filter(Boolean)})], verticalAlign: VerticalAlign.CENTER }),
            new TableCell({ children: [
                new Paragraph({ text: headerData.nationalAssociationName, alignment: AlignmentType.CENTER, bidirectional: true }),
                new Paragraph({ text: headerData.localBranchName || headerData.regionalAssociationName || '', alignment: AlignmentType.CENTER, bidirectional: true }),
            ], verticalAlign: VerticalAlign.CENTER}),
            new TableCell({ children: [new Paragraph({ children: [nationalLogo].filter(Boolean)})], verticalAlign: VerticalAlign.CENTER }),
        ],
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
            orientation:
              columns.length > 5 ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
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

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
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
          gender: 'ذكر',
          national_id: '111222333',
          status: 'نشط',
          memorization_level: '5 أجزاء',
        },
        {
          name: 'سارة عبدالله',
          date_of_birth: '2006-08-22',
          gender: 'أنثى',
          national_id: '222333444',
          status: 'نشط',
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
        { header: 'معرف المعلم', key: 'teacher_matricule', width: 25 },
        { header: 'الجدول الزمني (JSON)', key: 'schedule', width: 30 },
        { header: 'تاريخ البدء', key: 'start_date', width: 15 },
        { header: 'تاريخ الانتهاء', key: 'end_date', width: 15 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'السعة', key: 'capacity', width: 10 },
        { header: 'الجنس', key: 'gender', width: 15 },
      ],
      dummyData: [
        {
          name: 'حلقة التجويد للمبتدئين',
          teacher_matricule: '',
          gender: 'الكل',
          capacity: 15,
          status: 'نشط',
        },
        {
          name: 'دورة الحفظ المكثفة',
          teacher_matricule: '',
          gender: 'رجال',
          capacity: 10,
          status: 'معلق',
        },
      ],
    },
    {
      name: 'الرسوم الدراسية',
      columns: [
        { header: 'الرقم التعريفي للطالب', key: 'student_matricule', width: 25 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'تاريخ الدفع', key: 'payment_date', width: 20 },
        { header: 'طريقة الدفع', key: 'payment_method', width: 20 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      dummyData: [
        {
          student_matricule: '',
          amount: 100,
          payment_date: '2024-09-01',
          payment_method: 'نقداً',
        },
        {
          student_matricule: '',
          amount: 100,
          payment_date: '2024-09-02',
          payment_method: 'تحويل بنكي',
        },
      ],
    },
    {
      name: 'الرواتب',
      columns: [
        { header: 'الرقم التعريفي للموظف', key: 'user_matricule', width: 25 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'تاريخ الدفع', key: 'payment_date', width: 20 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      dummyData: [{ user_matricule: '', amount: 1500, payment_date: '2024-09-05' }],
    },
    {
      name: 'التبرعات',
      columns: [
        { header: 'اسم المتبرع', key: 'donor_name', width: 25 },
        { header: 'نوع التبرع', key: 'donation_type', width: 20 },
        { header: 'المبلغ', key: 'amount', width: 20 },
        { header: 'الوصف', key: 'description', width: 30 },
        { header: 'تاريخ التبرع', key: 'donation_date', width: 20 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      dummyData: [
        {
          donor_name: 'فاعل خير',
          donation_type: 'نقدي',
          amount: 500,
          donation_date: '2024-09-10',
        },
        {
          donor_name: 'مكتبة المدينة',
          donation_type: 'عيني',
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
        { header: 'تاريخ الصرف', key: 'expense_date', width: 20 },
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
      name: 'الحضور',
      columns: [
        { header: 'الرقم التعريفي للطالب', key: 'student_matricule', width: 25 },
        { header: 'اسم الفصل', key: 'class_name', width: 25 },
        { header: 'التاريخ', key: 'date', width: 20 },
        { header: 'الحالة', key: 'status', width: 25 },
      ],
      dummyData: [
        {
          student_matricule: '',
          class_name: 'حلقة التجويد للمبتدئين',
          date: '2024-09-06',
          status: 'حاضر',
        },
        {
          student_matricule: '',
          class_name: 'دورة الحفظ المكثفة',
          date: '2024-09-06',
          status: 'غائب',
        },
      ],
    },
    {
      name: 'المجموعات',
      columns: [
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
        { header: 'الموقع', key: 'location', width: 25 },
        { header: 'ملاحظات', key: 'notes', width: 40 },
      ],
      dummyData: [
        {
          item_name: 'مصحف (نسخة ورقية)',
          category: 'مواد تعليمية',
          quantity: 50,
          unit_value: 15.0,
          acquisition_date: '2024-01-10',
          condition_status: 'جديد',
        },
        {
          item_name: 'سبورة بيضاء',
          category: 'أثاث مكتبي',
          quantity: 5,
          unit_value: 100.0,
          acquisition_date: '2024-02-01',
          condition_status: 'مستخدم',
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

  const classData = [
    {
      name: 'حلقة التجويد للمبتدئين',
      teacher_matricule: 'T-000001',
      gender: 'all',
      capacity: 15,
      status: 'active',
    },
    {
      name: 'دورة الحفظ المكثفة',
      teacher_matricule: 'T-000002',
      gender: 'men',
      capacity: 10,
      status: 'pending',
    },
    {
      name: 'فصل الصغار',
      teacher_matricule: 'T-000001',
      gender: 'kids',
      capacity: 20,
      status: 'active',
    },
  ];

  const paymentData = [
    { student_matricule: 'S-000001', amount: 50, payment_date: '2024-09-01' },
    { student_matricule: 'S-000002', amount: 50, payment_date: '2024-09-02' },
    { student_matricule: 'S-000004', amount: 75, payment_date: '2024-09-03' },
  ];

  const salaryData = [
    { user_matricule: 'T-000001', amount: 1200, payment_date: '2024-09-05' },
    { user_matricule: 'T-000002', amount: 1350, payment_date: '2024-09-05' },
  ];

  const donationData = [
    {
      donor_name: 'فاعل خير (للتطوير)',
      donation_type: 'Cash',
      amount: 1000,
      donation_date: '2024-09-10',
    },
    {
      donor_name: 'مكتبة (للتطوير)',
      donation_type: 'In-kind',
      description: '100 مصحف',
      donation_date: '2024-09-11',
    },
  ];

  const expenseData = [
    {
      category: 'لوازم مكتبية',
      amount: 75,
      expense_date: '2024-09-03',
      responsible_person: 'مدير المالية',
    },
    {
      category: 'كهرباء وماء',
      amount: 250,
      expense_date: '2024-09-04',
      responsible_person: 'مدير المالية',
    },
  ];

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
      item_name: 'مصحف (نسخة ورقية)',
      category: 'مواد تعليمية',
      quantity: 50,
      unit_value: 15.0,
      acquisition_date: '2024-01-10',
      condition_status: 'جديد',
    },
    {
      item_name: 'سبورة بيضاء',
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

  const sheets = [
    { name: 'الطلاب', columns: getCols('الطلاب'), dummyData: studentData },
    { name: 'المعلمون', columns: getCols('المعلمون'), dummyData: teacherData },
    { name: 'المستخدمون', columns: getCols('المستخدمون'), dummyData: userData },
    { name: 'الفصول', columns: getCols('الفصول'), dummyData: classData },
    { name: 'المجموعات', columns: getCols('المجموعات'), dummyData: groupData },
    { name: 'الرسوم الدراسية', columns: getCols('الرسوم الدراسية'), dummyData: paymentData },
    { name: 'الرواتب', columns: getCols('الرواتب'), dummyData: salaryData },
    { name: 'التبرعات', columns: getCols('التبرعات'), dummyData: donationData },
    { name: 'المصاريف', columns: getCols('المصاريف'), dummyData: expenseData },
    { name: 'المخزون', columns: getCols('المخزون'), dummyData: inventoryData },
    { name: 'الحضور', columns: getCols('الحضور'), dummyData: attendanceData },
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
  generatePdf,
  generateXlsx,
  generateFinancialXlsx,
  generateDocx,
  generateExcelTemplate,
  generateDevExcelTemplate,
};
