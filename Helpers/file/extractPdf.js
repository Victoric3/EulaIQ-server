const { performOCR } = require("./advancedOcr");
const { extractTextFromOCR } = require("../input/escapeStrinedJson");
const { pdfToImage } = require("./pdfToimg");
const { retry } = require("../file/retryFunc");
const { fetchFileFromBlob } = require("../file/fetchSavedFile");

const extractPdfContent = async (pdfFile, ebook, currentPage = 0) => {
  try {
    // Create buffer from PDF and load data from the PDF
    const clonedBuffer = pdfFile.buffer.slice(0);

    // const textContents = [];
    //---------------OCR FUNCTION------------------
    //1. convert the text in file to pdf pages
    const pageImages = await retry(() => pdfToImage(clonedBuffer));
    
    //2. carry out ocr on the current page and 2 pages after the current page
      const response = await retry(() =>
        performOCR(pageImages, currentPage, ebook)
      );

      return response;
      
  } catch (error) {
    console.error("Error extracting PDF content:", error);
    throw error;
  }
};

module.exports = { extractPdfContent };
