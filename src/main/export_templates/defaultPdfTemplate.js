const fs = require('fs');
const settings = require('../settingsManager');

/**
 * Draws the header for a PDF document.
 * This is called once at the beginning of the document.
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
    .font('Cairo-Bold')
    .fontSize(pdfSettings.titleFontSize)
    .fillColor(pdfSettings.headerColor)
    .text(reportTitle, { align: 'center' }); // Use the dynamic report title

  doc.moveDown(2);
}

/**
 * Draws the footer for a single page of a PDF document.
 * This function will be called for each page.
 * @param {PDFKit.PDFDocument} doc - The PDF document instance.
 */
function drawFooter(doc) {
  const pdfSettings = settings.getSetting('pdf');
  const pageNum = doc.page.pageNumber; // pdfkit is 1-based

  doc
    .font('Cairo-Regular')
    .fontSize(pdfSettings.fontSize - 2)
    .fillColor(pdfSettings.textColor)
    .text(`Page ${pageNum}`, doc.x, doc.page.height - 50, {
      align: 'right',
      lineBreak: false,
    });

  doc
    .font('Cairo-Regular')
    .fontSize(pdfSettings.fontSize - 2)
    .text(new Date().toLocaleDateString('ar-SA'), doc.x, doc.page.height - 50, {
      align: 'left',
      lineBreak: false,
    });
}

module.exports = {
  drawHeader,
  drawFooter,
};
