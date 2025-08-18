const fs = require('fs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { allQuery } = require('../db/db');
const settings = require('./settingsManager');
const { processArabicText } = require('./utils');

// --- Data Fetching ---

/**
 * Fetches data for exports from the database.
 * @param {string} type - The type of data to fetch ('students', 'teachers', 'admins', 'attendance').
 * @param {string[]} fields - An array of field names to select.
 * @param {object} options - Additional options (e.g., date ranges for attendance).
 * @returns {Promise<object[]>} A promise that resolves to an array of data objects.
 */
async function fetchExportData({ type, fields, options = {} }) {
  // Basic validation
  if (!fields || fields.length === 0) {
    throw new Error('No fields selected for export.');
  }

  // Ensure 'id' is always fetched if not present, for consistency.
  if (!fields.includes('id')) {
    fields.unshift('id');
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
      // Admins are users with a specific role
      query = `SELECT ${fieldSelection} FROM users WHERE role = 'Branch Admin' OR role = 'Superadmin' ORDER BY username`;
      break;
    case 'attendance':
      // Attendance requires joining with students and classes for meaningful data
      const attendanceFieldMap = {
        student_name: 's.name as student_name',
        class_name: 'c.name as class_name',
        date: 'a.date',
        status: 'a.status',
      };
      const selectedFields = fields
        .map((f) => attendanceFieldMap[f])
        .filter(Boolean) // Filter out any undefined fields
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
    default:
      throw new Error(`Invalid export type: ${type}`);
  }

  return allQuery(query);
}

// --- PDF Generation ---

/**
 * Generates a PDF document from data using a template.
 * @param {string} title - The title of the report.
 * @param {string[]} headers - An array of header strings for the table.
 * @param {object[]} data - An array of data objects.
 * @param {string[]} dataKeys - An array of keys to access data in the correct order for the table.
 * @param {string} outputPath - The path to save the generated PDF file.
 * @param {object} template - The template object with drawHeader and drawFooter methods.
 * @returns {Promise<void>}
 */
function generatePdf(title, headers, data, dataKeys, outputPath, template) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, layout: 'portrait', size: 'A4' });
    const writeStream = fs.createWriteStream(outputPath);

    doc.pipe(writeStream);

    writeStream.on('finish', () => resolve());
    writeStream.on('error', reject);
    doc.on('error', reject);

    // Use the template to draw the header
    template.drawHeader(doc, title);

    // --- Table ---
    const pdfSettings = settings.getSetting('pdf');
    const tableTop = doc.y;
    const itemWidth = (doc.page.width - 100) / headers.length;

    // Draw table header
    doc.font(pdfSettings.fontBold).fillColor(pdfSettings.headerColor);
    headers.forEach((header, i) => {
      doc.text(processArabicText(header), 50 + i * itemWidth, tableTop, {
        width: itemWidth,
        align: 'center',
      });
    });
    doc.y += 20;
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown();

    // Draw table rows
    doc.font(pdfSettings.font).fillColor(pdfSettings.textColor);
    data.forEach((item) => {
      const rowY = doc.y;
      dataKeys.forEach((key, i) => {
        doc.text(processArabicText(item[key]), 50 + i * itemWidth, rowY, {
          width: itemWidth,
          align: 'right',
        });
      });
      doc.y += 20; // Spacing for next row
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown();
    });

    // Use the template to draw the footer
    template.drawFooter(doc);

    doc.end();
  });
}

// --- Excel (XLSX) Generation ---

/**
 * Generates an Excel (XLSX) document from data.
 * @param {string[]} headers - An array of header strings.
 * @param {object[]} data - An array of data objects.
 * @param {string[]} dataKeys - An array of keys to access data in the correct order.
 * @param {string} outputPath - The path to save the generated XLSX file.
 * @returns {Promise<void>}
 */
async function generateXlsx(headers, data, dataKeys, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Exported Data');

  worksheet.views = [{ rightToLeft: true }];

  worksheet.columns = headers.map((header, index) => ({
    header: header,
    key: dataKeys[index],
    width: 20,
  }));

  worksheet.addRows(data);

  worksheet.getRow(1).font = { bold: true };

  await workbook.xlsx.writeFile(outputPath);
}

module.exports = {
  fetchExportData,
  generatePdf,
  generateXlsx,
};
