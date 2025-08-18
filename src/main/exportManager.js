const fs = require('fs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { allQuery } = require('../db/db');

// --- Constants and Placeholders ---

// TODO: The logo files (g13.png, g247.png) were not found in the project.
// When they are available, place them in a suitable assets directory
// and update these paths.
const path = require('path');

// --- Constants and Placeholders ---

// The logo files were not found in the project. This provides a safe fallback.
const LOGO_NATIONAL_PATH = path.join(__dirname, '../renderer/assets/g13.png'); // Placeholder path
const LOGO_LOCAL_PATH = path.join(__dirname, '../renderer/assets/g247.png'); // Placeholder path

// Path to the font that supports Arabic Glyphs.
const FONT_REGULAR_PATH = path.join(
  __dirname,
  '../renderer/assets/fonts/cairo-v30-arabic_latin-regular.woff2',
);
const FONT_BOLD_PATH = path.join(
  __dirname,
  '../renderer/assets/fonts/cairo-v30-arabic_latin-700.woff2',
);

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
        .map(f => attendanceFieldMap[f])
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
 * Generates a PDF document from data.
 * @param {string} title - The title of the report.
 * @param {string[]} headers - An array of header strings for the table.
 * @param {object[]} data - An array of data objects.
 * @param {string[]} dataKeys - An array of keys to access data in the correct order for the table.
 * @param {string} outputPath - The path to save the generated PDF file.
 * @returns {Promise<void>}
 */
function generatePdf(title, headers, data, dataKeys, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, layout: 'portrait', size: 'A4' });
    const writeStream = fs.createWriteStream(outputPath);

    doc.pipe(writeStream);

    writeStream.on('finish', () => resolve());
    writeStream.on('error', reject);
    doc.on('error', reject);

    // Register fonts
    try {
      doc.registerFont('Cairo-Regular', FONT_REGULAR_PATH);
      doc.registerFont('Cairo-Bold', FONT_BOLD_PATH);
    } catch (fontError) {
      console.error('Error registering font. Using fallback Helvetica.', fontError);
      doc.registerFont('Cairo-Regular', 'Helvetica');
      doc.registerFont('Cairo-Bold', 'Helvetica-Bold');
    }

    // --- Header ---
    if (fs.existsSync(LOGO_NATIONAL_PATH)) {
      doc.image(LOGO_NATIONAL_PATH, 50, 20, { width: 50 });
    } else {
      console.log('National logo not found, skipping.');
    }
    if (fs.existsSync(LOGO_LOCAL_PATH)) {
      doc.image(LOGO_LOCAL_PATH, doc.page.width - 100, 20, { width: 50 });
    } else {
      console.log('Local logo not found, skipping.');
    }
    doc.font('Cairo-Bold').fontSize(16).text('Quran Branch Manager', { align: 'center' });
    doc.moveDown();

    // Report Title
    doc.font('Cairo-Bold').fontSize(12).text(title, { align: 'center' });
    doc.moveDown(2);

    // --- Table ---
    const tableTop = doc.y;
    const itemWidth = (doc.page.width - 100) / headers.length;
    // Draw table header
    headers.forEach((header, i) => {
      doc
        .font('Cairo-Bold')
        .text(header, 50 + i * itemWidth, tableTop, { width: itemWidth, align: 'center' });
    });
    doc.y += 20;
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown();

    // Draw table rows
    data.forEach((item) => {
      const rowY = doc.y;
      dataKeys.forEach((key, i) => {
        doc.font('Cairo-Regular').text(String(item[key] || ''), 50 + i * itemWidth, rowY, {
          width: itemWidth,
          align: 'right', // Align right for better RTL appearance
        });
      });
      doc.y += 20; // Spacing for next row
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown();
    });

    // --- Footer ---
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.count; i++) {
      doc.switchToPage(i);
      const pageNum = i + 1;
      const pageCount = range.count;
      doc
        .font('Cairo-Regular')
        .fontSize(8)
        .text(`Page ${pageNum} of ${pageCount}`, 50, doc.page.height - 30, { align: 'right' });
      doc
        .font('Cairo-Regular')
        .fontSize(8)
        .text(new Date().toLocaleString(), 50, doc.page.height - 30, { align: 'left' });
    }

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

  // TODO: Set RTL properties for the worksheet
  worksheet.views = [{ rightToLeft: true }];

  // Set columns
  worksheet.columns = headers.map((header, index) => ({
    header: header,
    key: dataKeys[index],
    width: 20,
  }));

  // Add rows
  worksheet.addRows(data);

  // Style header
  worksheet.getRow(1).font = { bold: true };

  await workbook.xlsx.writeFile(outputPath);
}

module.exports = {
  fetchExportData,
  generatePdf,
  generateXlsx,
};
