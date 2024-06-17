const { PDFDocument } = require("pdf-lib");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { createCanvas } = require("canvas");
const { chunkText } = require("../Libraries/azureOpenai")

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

const extractPdfContent = async (pdfFile) => {
  try {
    const uint8Array = new Uint8Array(pdfFile);
    const pdfDoc = await PDFDocument.load(uint8Array);
    const pages = pdfDoc.getPages();
    const textContents = [];

    // Check if the PDF text is selectable
    const data = await pdfParse(uint8Array);
    const isTextSelectable = data.text.trim().length > 50;

    if (isTextSelectable) {
      // Extract text content from the PDF
      const textPages = data.text
        .split("\n\n")
        .map((page) => page.split("\n").filter(line => line.trim() !== ""))
        textPages.forEach((pageLines, pageIndex) => {
        const pageText = pageLines.map((line, lineIndex) => ({
          text: line,
          position: { pageIndex, lineIndex },
        }));
        textContents.push(...pageText);
      });
    } else {
      // Dynamically import pdfjs-dist to handle OCR for non-selectable text
      const pdfJsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await pdfJsLib.getDocument({ data: uint8Array }).promise;

      for (let i = 0; i < pages.length; i++) {
        const page = await pdf.getPage(i + 1);
        const text = await renderPageToImageAndOCR(page);
        const chunkedText = chunkText(text)

        textContents.push({
          text: chunkedText,
          position: { pageIndex: i },
        });
      }
    }
    // console.log("textContents:", textContents);
    return textContents;
  } catch (error) {
    console.error("Error extracting PDF content:", error);
    throw error;
  }
};

module.exports = { extractPdfContent };
