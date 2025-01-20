const htmlparser2 = require("htmlparser2");
const Papa = require("papaparse");
// const textract = require("textract");
const libre = require("libreoffice-convert");
const fs = require("fs-extra");
const { extractPdfContent } = require("./extractPdf");
// const path = require('path');
// const os = require('os');
// const fs = require("fs");

const extractJsonContent = async (file) => {
  try {
    const jsonContent = JSON.parse(file.buffer.toString("utf-8"));
    const entries = Object.entries(jsonContent);
    const pages = [];
    let currentPage = [];
    let lineIndex = 0;

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      currentPage.push({
        text: `${key}: ${
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value
        }`,
        position: { pageIndex: Math.floor(i / 5), lineIndex: i % 5 },
      });

      if (currentPage.length === 5) {
        pages.push(currentPage);
        currentPage = [];
      }
    }

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages.flat();
  } catch (error) {
    console.error("Error extracting JSON content:", error);
    throw error;
  }
};


const extractTxtContent = async (file) => {
  try {
    const text = file.buffer.toString("utf-8");
    const words = text.split(/\s+/); // Split text into words
    const pages = [];
    let currentPage = [];
    let currentWordCount = 0;

    const addPage = () => {
      pages.push({
        text: currentPage.join(' '),
        position: { pageIndex: pages.length, lineIndex: 0 },
      });
      currentPage = [];
      currentWordCount = 0;
    };

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentPage.push(word);
      currentWordCount++;

      if (currentWordCount >= 400 && currentWordCount <= 500 && (word.endsWith('.') || word.endsWith('\n'))) {
        addPage();
      } else if (currentWordCount > 500) {
        addPage();
      }
    }

    if (currentPage.length > 0) {
      addPage(); // Add the last page if it has remaining words
    }

    return pages.map((page, pageIndex) => ({
      text: page.text,
      position: { pageIndex, lineIndex: 0 },
    }));
  } catch (error) {
    console.error("Error extracting TXT content:", error);
    throw error;
  }
};

const extractHtmlContent = async (file) => {
  try {
    const rawHtml = file.buffer.toString("utf-8");
    const textContents = [];
    const parser = new htmlparser2.Parser({
      ontext(text) {
        textContents.push(text);
      },
    });
    parser.write(rawHtml);
    parser.end();
    return textContents.map((text, lineIndex) => ({
      text,
      position: { pageIndex: 0, lineIndex },
    }));
  } catch (error) {
    console.error("Error extracting HTML content:", error);
    throw error;
  }
};

const extractCsvContent = async (file) => {
  try {
    const csvString = file.buffer.toString("utf-8");
    const parsedData = Papa.parse(csvString, { header: false });
    const records = parsedData.data;

    return records
      .map((row, rowIndex) =>
        row.map((cell, cellIndex) => ({
          text: cell,
          position: { pageIndex: rowIndex, lineIndex: cellIndex },
        }))
      )
      .flat();
  } catch (error) {
    console.error("Error extracting CSV content:", error);
    throw error;
  }
};

async function convertPptxToPdfBuffer(inputPath) {
  try {
    // Read the input PPTX file into a buffer
    const fileBuffer = await fs.readFile(inputPath);
    const outputExt = ".pdf";

    // Convert the PPTX buffer to a PDF buffer
    return new Promise((resolve, reject) => {
      libre.convert(fileBuffer, outputExt, undefined, (err, done) => {
        if (err) {
          return reject(err);
        }
        resolve(done);
      });
    });
  } catch (error) {
    throw new Error("File read error: " + error.message);
  }
}

const extractPptxContent = async (file, imageNumbers) => {
  // Generate a temporary file path
  // const tempFilePath = `./output_${file.originalname}`;

  // try {
  //   // Write the buffer to a temporary file
  //   fs.writeFileSync(tempFilePath, file.buffer);
  //   let textContents = [];

  //   // Process the extracted text
  //   if (imageNumbers.length > 0) {
  //     const pdfBuffer = await convertPptxToPdfBuffer(tempFilePath);
  //     const text = await extractPdfContent(pdfBuffer);
  //     return (textContents = [...text]);
  //   } else {
  //     const text = await new Promise((resolve, reject) => {
  //       textract.fromFileWithPath(tempFilePath, (error, text) => {
  //         if (error) {
  //           return reject(error);
  //         }
  //         resolve(text);
  //       });
  //     });
  //     const lines = text.split(".").map(line => line.trim());
  //     const linesPerChunk = 15;

  //     for (let i = 0; i < lines.length; i += linesPerChunk) {
  //       const chunkLines = lines.slice(i, i + linesPerChunk);
  //       const concatenatedText = chunkLines.join(". ");

  //       textContents.push({
  //         text: concatenatedText,
  //         position: {
  //           pageIndex: Math.floor(i / linesPerChunk),
  //           lineIndex: i % linesPerChunk,
  //         },
  //       });
  //     }
  //   }
    
  //   // Delete the temporary file
  //   fs.unlinkSync(tempFilePath);
  //   return textContents;
  // } catch (error) {
  //   // Ensure the temporary file is deleted even if an error occurs
  //   if (fs.existsSync(tempFilePath)) {
  //     fs.unlinkSync(tempFilePath);
  //   }
  //   console.error("Error extracting PPTX content:", error);
  //   throw error;
  // }
};

module.exports = {
  extractCsvContent,
  extractHtmlContent,
  extractJsonContent,
  extractPptxContent,
  extractTxtContent,
};
