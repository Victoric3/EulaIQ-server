const { convertDocxToPdf } = require('./docxtopdf');
const { extractPdfContent } = require('./extractPdf');

/**
 * Extract content from DOCX file by converting to PDF first
 * @param {Object} file - File object with buffer
 * @param {Object} ebook - Ebook document to update
 * @param {Number} currentPage - Starting page index
 * @param {Number} batchSize - Number of pages to process
 * @returns {Object} - Response with status, metrics, and page counts
 */
const extractDocxContent = async (file, ebook, currentPage = 0, batchSize = 1) => {
  try {
    // Convert DOCX to PDF first
    const pdfResult = await convertDocxToPdf(file.buffer);
    
    if (!pdfResult || !pdfResult.buffer) {
      throw new Error('Failed to convert DOCX to PDF');
    }
    
    // Use the standard PDF extraction pipeline
    return await extractPdfContent(pdfResult.buffer, ebook, currentPage, batchSize);
  } catch (error) {
    console.error("Error extracting DOCX content:", error);
    throw error; // Propagate error to be handled by handleTextExtraction
  }
};

module.exports = { extractDocxContent };