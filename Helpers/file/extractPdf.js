const { performOCR } = require("./advancedOcr");
const { pdfToImage } = require("./pdfToimg");
const fs = require('fs-extra');

const extractPdfContent = async (pdfBuffer, ebook, currentPage = 0, batchSize = 1) => {
  let tempFilePaths = [];
  try {
    
    // Convert smaller batch of pages to images
    const {imageBuffers, totalPages, newPageCount} = await pdfToImage(
      pdfBuffer, 
      currentPage, 
      batchSize // Use smaller batch size
    );
    console.log("imageBuffersLength: ", imageBuffers.length);
    
    // Write images to disk one at a time
    for (const image of imageBuffers) {
      const { imageBuffer, page } = image;
      const tempPath = `page-${page}-${Date.now()}.png`; // Add timestamp to avoid conflicts
      fs.writeFileSync(tempPath, imageBuffer);
      tempFilePaths.push(tempPath);
      
      // Clear reference to help garbage collection
      image.imageBuffer = null;
    }
    
    // Process OCR on smaller batch
    const response = await performOCR(currentPage, ebook, tempFilePaths, totalPages);
    
    // Clean up temp files immediately
    for (const tempPath of tempFilePaths) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.warn(`Failed to delete temp file ${tempPath}:`, e);
      }
    }
    
    console.log(`Processed ${newPageCount} pages out of ${totalPages} total`);
    
    return {
      status: response.status || "success",
      message: response.message || "Content processed successfully",
      metrics: response.metrics,
      totalPages: totalPages,
      newPageCount: newPageCount
    };
  } catch (error) {
    // Clean up temp files even on error
    for (const tempPath of tempFilePaths) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e) {
        console.warn(`Failed to delete temp file ${tempPath}:`, e);
      }
    }
    
    console.error("Error extracting PDF content:", error);
    throw error;
  }
};

module.exports = { extractPdfContent };
