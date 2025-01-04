const { performOCR } = require("./advancedOcr");
const { extractTextFromOCR } = require("../input/escapeStrinedJson");
const { pdfToImage } = require("./pdfToimg");

const extractPdfContent = async (pdfFile, res) => {
  try {
    //load data from the pdf
    const clonedBuffer = pdfFile.slice(0);
    const textContents = [];

    //---------------OCR FUNCTION------------------
    //1. convert the text in file to pdf pages
    const pageImages = await retry(() => pdfToImage(clonedBuffer));
    for (let i = 0; i < pageImages.length; i++) {
    //2. if no textcontent index, an empty array as that page data index
      if (!textContents[i]) {
        textContents[i] = [];
      }
    
    //3. carry out ocr
      const ocrResult = await retry(() =>
        performOCR(pageImages[i].imageBuffer, res)
      );
    
    //4. create a collection of book data and save it
      const text = extractTextFromOCR(ocrResult);
      console.log(`text[${i}]`, text);
    
    //5. push textcontent in
      textContents.push({
        text,
        position: { pageIndex: i, lineIndex: 0 },
      });
    }

    return textContents;
  } catch (error) {
    console.error("Error extracting PDF content:", error);
    throw error;
  }
};

// Example retry function (if not implemented)
const retry = async (fn, retries = 3) => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      console.log("Retrying due to error:", error);
      return retry(fn, retries - 1);
    } else {
      throw error;
    }
  }
};

module.exports = { extractPdfContent };
