const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { allQuery } = require('../db/db');

// --- Data Fetching ---
async function fetchExportData({ type, fields, options = {} }) {
  if (!fields || fields.length === 0) {
    throw new Error('No fields selected for export.');
  }
  const fieldSelection = fields.join(', ');
  let query = '';
  let params = [];
  let whereClauses = ['1=1'];

  switch (type) {
    case 'students':
      query = `SELECT ${fieldSelection} FROM students`;
      if (options.gender) {
        if (options.gender === 'men') {
          whereClauses.push('gender = ?');
          params.push('Male');
        } else if (options.gender === 'women') {
          whereClauses.push('gender = ?');
          params.push('Female');
        } else if (options.gender === 'kids') {
          // Assuming kids are under 13
          whereClauses.push("strftime('%Y', 'now') - strftime('%Y', date_of_birth) < 13");
        }
      }
      query += ` WHERE ${whereClauses.join(' AND ')} ORDER BY name`;
      break;
    case 'teachers':
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

  const templateData = localizedData.map((item) => {
    return columns.map((col) => {
      return { key: col.header, value: item[col.key] || '' };
    });
  });

  doc.render({
    title: title,
    date: new Date().toLocaleDateString('ar-SA'),
    data: templateData,
  });
  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  fs.writeFileSync(outputPath, buf);
}

module.exports = {
  fetchExportData,
  generatePdf,
  generateXlsx,
  generateDocx,
};
