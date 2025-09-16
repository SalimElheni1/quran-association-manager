# Export Templates

This directory contains the default templates for generating PDF and DOCX reports.

## PDF Template (`default_pdf_template.json`)

This is a `pdfme` JSON template. It can be customized to change the layout of the PDF reports. You can use the online `pdfme` designer to create new templates and replace the existing one.

## DOCX Template (`dynamic_export_template.docx`)

**Action Required:** The `dynamic_export_template.docx` in this directory is a placeholder text file, not a valid `.docx` file. To enable DOCX exports, you must **replace this file with a real `.docx` document** created in Microsoft Word or a similar program.

The template must be formatted for the `docxtemplater` library. It should contain placeholders for the data you want to display.

### Required Placeholders:

*   `{title}`: The title of the report.
*   `{date}`: The date of the export.
*   `{%logo}`: The placeholder for the association's logo image. Note the `%` sign, which tells `docxtemplater` to treat this as an image.
*   A table for the data. The table should be structured to loop through `headers` for the column titles and `items` for the data rows.

### Example Table Structure in Word:

Create a table with two rows.

1.  **Header Row:**
    In the first cell of the header row, insert the following loop: `{#headers}{name}{/headers}`. This will dynamically generate a column header for each field selected in the application.

2.  **Data Row:**
    In the first cell of the second row, insert the following loop: `{#items}{#cells}{value}{/cells}{/items}`. This will loop through each row of data (`items`) and then through each cell in that row (`cells`), printing its `value`.

This structure will create a table with a dynamic number of columns based on the user's selection in the app.
