const fs = require('fs');
const settings = require('../settingsManager');
const { processArabicText } = require('../utils'); // Import from the new utility file

/**
 * Draws the header for a PDF document.
 * @param {PDFKit.PDFDocument} doc - The PDF document instance.
 * @param {string} reportTitle - The title of the specific report.
 */
function drawHeader(doc, reportTitle) {
  const logoNational = settings.getSetting('logoNationalPath');
  const logoLocal = settings.getSetting('logoLocalPath');
  const pdfSettings = settings.getSetting('pdf');

  // Draw logos if they exist
  if (fs.existsSync(logoNational)) {
    doc.image(logoNational, 50, 20, { width: 50 });
  }
  if (fs.existsSync(logoLocal)) {
    doc.image(logoLocal, doc.page.width - 100, 20, { width: 50 });
  }

  // Main Title
  doc
    .font(pdfSettings.fontBold)
    .fontSize(pdfSettings.titleFontSize)
    .fillColor(pdfSettings.headerColor)
    .text(processArabicText('مدير فرع القرآن'), { align: 'center' }); // Main app title

  doc.moveDown();

  // Report Specific Title
  doc
    .font(pdfSettings.fontBold)
    .fontSize(pdfSettings.fontSize + 2) // Slightly smaller than main title
    .text(processArabicText(reportTitle), { align: 'center' });

  doc.moveDown(2);
}

/**
 * Draws the footer for each page of a PDF document.
 * @param {PDFKit.PDFDocument} doc - The PDF document instance.
 */
function drawFooter(doc) {
  const pdfSettings = settings.getSetting('pdf');
  const range = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const pageNum = i + 1;

    // Draw page number and generation date
    doc
      .font(pdfSettings.font)
      .fontSize(pdfSettings.fontSize - 2)
      .fillColor(pdfSettings.textColor)
      .text(`Page ${pageNum} of ${range.count}`, doc.x, doc.page.height - 50, {
        align: 'right',
        lineBreak: false,
      });

    doc
      .font(pdfSettings.font)
      .fontSize(pdfSettings.fontSize - 2)
      .text(new Date().toLocaleString(), doc.x, doc.page.height - 50, {
        align: 'left',
        lineBreak: false,
      });
  }
}

module.exports = {
  drawHeader,
  drawFooter,
};
