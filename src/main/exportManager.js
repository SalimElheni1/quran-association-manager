const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { allQuery } = require('../db/db');
const settings = require('./settingsManager');

// --- Data Fetching ---
async function fetchExportData({ type, fields, options = {} }) {
  if (!fields || fields.length === 0) {
    throw new Error('No fields selected for export.');
  }
  const fieldSelection = fields.join(', ');
  let query = '';
  switch (type) {
    case 'students':
      query = `SELECT ${fieldSelection} FROM students ORDER BY name`;
      break;
    case 'teachers':
      query = `SELECT ${fieldSelection} FROM teachers ORDER BY name`;
      break;
    case 'admins':
      query = `SELECT ${fieldSelection} FROM users WHERE role = 'Branch Admin' OR role = 'Superadmin' ORDER BY username`;
      break;
    case 'attendance':
      const attendanceFieldMap = {
        student_name: 's.name as student_name',
        class_name: 'c.name as class_name',
        date: 'a.date',
        status: 'a.status',
      };
      const selectedFields = fields.map((f) => attendanceFieldMap[f]).filter(Boolean).join(', ');
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
    default:
      throw new Error(`Invalid export type: ${type}`);
  }
  return allQuery(query);
}

// --- PDF Generation ---
function generatePdf(title, columns, data, outputPath, template) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, layout: 'portrait', size: 'A4' });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    doc.on('error', reject);

    // Register the 'pageAdded' event listener to add footers to new pages
    doc.on('pageAdded', () => template.drawFooter(doc));

    const pdfSettings = settings.getSetting('pdf');
    try {
      doc.registerFont('Cairo-Bold', pdfSettings.fontBold);
      doc.registerFont('Cairo-Regular', pdfSettings.font);
    } catch (e) {
      console.error('Failed to register font, falling back to Helvetica', e);
      doc.registerFont('Cairo-Bold', 'Helvetica-Bold');
      doc.registerFont('Cairo-Regular', 'Helvetica');
    }

    template.drawHeader(doc, title);

    const headers = columns.map(c => c.header);
    const dataKeys = columns.map(c => c.key);
    const tableTop = doc.y;
    const itemWidth = (doc.page.width - 100) / columns.length;

    doc.font('Cairo-Bold').fillColor(pdfSettings.headerColor);
    headers.forEach((header, i) => {
      doc.text(header, 50 + i * itemWidth, tableTop, {
        width: itemWidth,
        align: 'center',
      });
    });
    doc.y += 20;
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown();

    doc.font('Cairo-Regular').fillColor(pdfSettings.textColor);
    data.forEach((item) => {
      const rowY = doc.y;
      dataKeys.forEach((key, i) => {
        doc.text(String(item[key] || ''), 50 + i * itemWidth, rowY, {
          width: itemWidth,
          align: 'right',
        });
      });
      doc.y += 20;
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown();
    });

    // Manually draw the footer on the first/last page
    template.drawFooter(doc);

    doc.end();
  });
}

// --- Excel (XLSX) Generation ---
async function generateXlsx(columns, data, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Exported Data');
  worksheet.views = [{ rightToLeft: true }];

  worksheet.columns = columns.map(col => ({ ...col, width: 25 }));

  worksheet.addRows(data);
  worksheet.getRow(1).font = { bold: true };
  await workbook.xlsx.writeFile(outputPath);
}

// --- DOCX Generation ---
function generateDocx(title, columns, data, outputPath) {
  const templatePath = path.resolve(__dirname, 'export_templates/export_template.docx');
  if (!fs.existsSync(templatePath)) {
    // Return a specific, user-friendly error code/message
    const err = new Error(`DOCX template not found at ${templatePath}. Please create it.`);
    err.code = 'TEMPLATE_NOT_FOUND';
    throw err;
  }
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const templateData = data.map(item => {
    const nameKey = columns[0].key;
    const otherKeys = columns.slice(1).map(c => c.key);
    const details = otherKeys.map(key => {
        const column = columns.find(c => c.key === key);
        return `${column.header}: ${item[key] || ''}`;
    }).join(' | ');
    return { name: item[nameKey], details: details };
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
