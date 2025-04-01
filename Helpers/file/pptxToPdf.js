const fs = require('fs-extra');
const { exec } = require('child_process');
const path = require('path');

/**
 * Converts a PPTX buffer to a PDF buffer
 * @param {string} tempFilename - Temporary filename for the conversion
 * @param {Buffer} pptxBuffer - PPTX file buffer
 * @returns {Promise<Buffer>} - PDF file buffer
 */
const convertPptxToPdfBuffer = async (tempFilename, pptxBuffer) => {
  // Create temp file paths
  const tempPptxPath = `./${tempFilename}`;
  const tempPdfPath = `./${path.basename(tempFilename, '.pptx')}.pdf`;

  try {
    // Write PPTX buffer to temp file
    await fs.writeFile(tempPptxPath, pptxBuffer);
    
    // Convert PPTX to PDF using LibreOffice (must be installed on the server)
    // For Windows, adjust the command based on your LibreOffice installation path
    return new Promise((resolve, reject) => {
      const command = process.platform === 'win32' 
        ? `"C:\\Program Files\\LibreOffice\\program\\soffice.exe" --headless --convert-to pdf --outdir . "${tempPptxPath}"`
        : `libreoffice --headless --convert-to pdf --outdir . "${tempPptxPath}"`;
      
      exec(command, async (error) => {
        try {
          if (error) {
            console.error('PPTX conversion error:', error);
            reject(error);
            return;
          }
          
          // Read the PDF file into buffer
          const pdfBuffer = await fs.readFile(tempPdfPath);
          
          // Clean up temporary files
          await Promise.all([
            fs.unlink(tempPptxPath).catch(e => console.warn(`Failed to delete temp file ${tempPptxPath}:`, e)),
            fs.unlink(tempPdfPath).catch(e => console.warn(`Failed to delete temp file ${tempPdfPath}:`, e))
          ]);
          
          resolve(pdfBuffer);
        } catch (err) {
          reject(err);
        }
      });
    });
  } catch (error) {
    // Make sure to clean up temp files even on error
    try {
      if (await fs.pathExists(tempPptxPath)) await fs.unlink(tempPptxPath);
      if (await fs.pathExists(tempPdfPath)) await fs.unlink(tempPdfPath);
    } catch (e) {
      console.warn('Error cleaning up temp files:', e);
    }
    throw error;
  }
};

module.exports = { convertPptxToPdfBuffer };