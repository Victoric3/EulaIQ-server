const { createCanvas, loadImage } = require('@napi-rs/canvas');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
const { Page } = require('puppeteer');

/**
 * Convert PDF buffer to image buffers for specific pages
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} startPage - Starting page index (0-based)
 * @param {number} pageCount - Number of pages to convert (default 3)
 * @returns {Array} Array of image buffers with page numbers
 */
const pdfToImage = async (pdfBuffer, startPage = 0, pageCount = 1) => {
  try {
    // Convert Buffer to Uint8Array as required by PDF.js
    const uint8Array = new Uint8Array(pdfBuffer);
    
    // Pass the Uint8Array to PDF.js
    const pdfDoc = await pdfjsLib.getDocument({ data: uint8Array }).promise; 
    const totalPages = pdfDoc.numPages;
    const endPage = Math.min(startPage + pageCount, totalPages);
    console.log(`Converting PDF pages ${startPage+1} to ${endPage+1} of ${totalPages}`);
    const newPageCount = endPage - startPage + 1;
    
    const imageBuffers = [];

    for (let pageNum = startPage + 1; pageNum < endPage + 1; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      
      // Create canvas
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      
      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      // Convert to PNG buffer
      const buffer = await canvas.encode('png');
      
      imageBuffers.push({
        imageBuffer: buffer,
        page: pageNum - 1 // Return 0-based index
      });
    }

    return {imageBuffers, totalPages, newPageCount};
  } catch (error) {
    console.error('Conversion error:', error);
    throw error;
  }
};

module.exports = { pdfToImage };