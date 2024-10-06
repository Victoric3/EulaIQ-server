const { PDFDocument } = require("pdf-lib");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { createCanvas } = require("canvas");
const { chunkText } = require("../Libraries/azureOpenai");
const { performOCR } = require("./advancedOcr");
const { extractTextFromOCR } = require("../input/escapeStrinedJson");
const { pdfToImage } = require("./pdfToimg");

const renderPageToImageAndOCR = async (page) => {
  const viewport = page.getViewport({ scale: 1 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  const imageBuffer = canvas.toBuffer();

  const {
    data: { text },
  } = await Tesseract.recognize(imageBuffer, "eng");
  return text;
};

const extractPdfContent = async (pdfFile, res) => {
  try {
    const clonedBuffer = pdfFile.slice(0);
    // const uint8Array = new Uint8Array(pdfFile);
    // const pdfDoc = await PDFDocument.load(uint8Array);
    // const pages = pdfDoc.getPages();
    const textContents = [];

    // Check if the PDF text is selectable
    // const data = await pdfParse(uint8Array);
    // const isTextSelectable = data.text.trim().length > 50;

    ///temporary function
    const pageImages = await retry(() => pdfToImage(clonedBuffer));
    for (let i = 0; i < pageImages.length; i++) {
      if (!textContents[i]) {
        textContents[i] = [];
      }

      const ocrResult = await retry(() =>
        performOCR(pageImages[i].imageBuffer, res)
      );
      const text = extractTextFromOCR(ocrResult);
      console.log(`text[${i}]`, text);
      
      textContents.push({
        text,
        position: { pageIndex: i, lineIndex: 0 },
      });
    }

    // if (isTextSelectable) {
    //   const textPages = data.text
    //     .split("\n\n")
    //     .map((page) => page.split("\n").filter((line) => line.trim() !== ""));

    //   // Iterate through each page to find poor content
    //   for (let pageIndex = 0; pageIndex < textPages.length; pageIndex++) {
    //     const pageLines = textPages[pageIndex];
    //     const pageText = pageLines.map((line, lineIndex) => ({
    //       text: line,
    //       position: { pageIndex, lineIndex },
    //     }));
    //     // console.log(`pagetext${pageIndex}: `, pageText)
    //     const totalPageChars = pageLines.join("").length;

    //     const pageImages = await pdfToImage(clonedBuffer);
    //     if (totalPageChars < 20 && pageImages.length >= textPages.length) {
    //       // Perform advanced OCR for poor quality pages
    //       console.log("pageIndex: ", pageIndex);
    //       console.log("pageImagesLength: ", pageImages.length);
    //       console.log("textPagesLength: ", textPages.length);
    //       const ocrResult = await retry(() =>
    //         performOCR(pageImages[pageIndex].imageBuffer, res)
    //       );
    //       const ocrText = extractTextFromOCR(ocrResult);
    //       console.log(ocrText);

    //       const advancedOcrText = chunkText(ocrText); // Assuming chunkText processes OCR result
    //       textContents.push({
    //         text: advancedOcrText,
    //         position: { pageIndex },
    //       });
    //     } else {
    //       // Push original page text if it's not poor quality
    //       textContents.push(...pageText);
    //     }
    //   }
    // } else {
    //   // Use OCR for non-selectable PDFs
    //   const pdfJsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    //   const pdf = await pdfJsLib.getDocument({ data: uint8Array }).promise;

    //   for (let i = 0; i < pages.length; i++) {
    //     const page = await pdf.getPage(i + 1);
    //     const text = await renderPageToImageAndOCR(page); // Render page to image for OCR
    // const chunkedText = chunkText(text);

    //     textContents.push({
    //       text: chunkedText,
    //       position: { pageIndex: i },
    //     });
    //   }
    // }

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
