const { performOCR } = require("./advancedOcr");
const { pdfToImage } = require("./pdfToimg");
const fs = require('fs-extra');

const extractPdfContent = async (pdfFile, ebook, currentPage = 0) => {
  try {
    //---------------OCR FUNCTION------------------
    let tempFilePaths = [];
    //1. convert the text in file to pdf pages
    const {imageBuffers, totalPages, newPageCount} = await pdfToImage(pdfFile.buffer, currentPage, 2);
    
    imageBuffers.forEach((image) => {
      const { imageBuffer, page } = image;  
      fs.writeFileSync(`page-${page}.png`, imageBuffer);
      tempFilePaths.push(`page-${page}.png`);
    });
          
    //2. carry out ocr on the current page and 2 pages after the current page
      const response = await performOCR(currentPage, ebook, tempFilePaths, totalPages);
      
      tempFilePaths.forEach((tempFilePath) => {
        fs.unlinkSync(tempFilePath);
      });
      console.log(totalPages);

    return {
      status: response.status || "success", 
      message: response.message || "Ebook generated successfully",
      metrics: response.metrics,
      totalPages: totalPages,
      newPageCount: newPageCount
    };
      
  } catch (error) {
    console.error("Error extracting PDF content:", error);
    throw error;
  }
};

module.exports = { extractPdfContent };
