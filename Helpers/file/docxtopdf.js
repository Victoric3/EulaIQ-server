const docxConverter = require('docx-pdf');
const fs = require('fs');

const convertDocxToPdf = (docxBuffer, originalname) => {
  return new Promise((resolve, reject) => {
    // Save the DOCX buffer to a temporary file
    const tempDocxPath = `./temp_${originalname}`;
    fs.writeFileSync(tempDocxPath, docxBuffer);

    // Define the output PDF path
    const outputPdfPath = `./output_${originalname}.pdf`;

    // Convert DOCX to PDF
    docxConverter(tempDocxPath, outputPdfPath, function(err, result) {
      if (err) {
        reject(err);
      } else {
        // Read the PDF file into a buffer
        const pdfBuffer = fs.readFileSync(outputPdfPath);
        // Construct the desired object format
        const pdfObject = {
            buffer: pdfBuffer,
            originalname: `converted_${originalname}`,
            mimetype: 'application/pdf',
            size: pdfBuffer.length,
        };

        // Clean up temporary files
        fs.unlinkSync(tempDocxPath);
        fs.unlinkSync(outputPdfPath);

        resolve(pdfObject);
      }
    });
  })}

  module.exports = { convertDocxToPdf }