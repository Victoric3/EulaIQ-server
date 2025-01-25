const { performOCR } = require("./advancedOcr");
// const { extractTextFromOCR } = require("../input/escapeStrinedJson");
const { pdfToImage } = require("./pdfToimg");
const { retry } = require("../file/retryFunc");
const fs = require('fs-extra');
// const { fetchFileFromBlob } = require("../file/fetchSavedFile");

const extractPdfContent = async (pdfFile, ebook, currentPage = 0) => {
  try {
    //---------------OCR FUNCTION------------------
    let tempFilePaths = [];
    //1. convert the text in file to pdf pages
    const imageBuffers = await pdfToImage(pdfFile.buffer, currentPage, 2);
    
    imageBuffers.forEach((image) => {
      const { imageBuffer, page } = image;  
      fs.writeFileSync(`page-${page}.png`, imageBuffer);
      tempFilePaths.push(`page-${page}.png`);
    });
      
    console.log("tempFilePaths: ", tempFilePaths);
    
    //2. carry out ocr on the current page and 2 pages after the current page
      const response = await performOCR(currentPage, ebook, tempFilePaths)

      tempFilePaths.forEach((tempFilePath) => {
        fs.unlinkSync(tempFilePath);
      });

    // return {status: "success", message: "successfully extracted pdf content", tempFilePaths: tempFilePaths};
    return response;
      
  } catch (error) {
    console.error("Error extracting PDF content:", error);
    throw error;
  }
};

module.exports = { extractPdfContent };
