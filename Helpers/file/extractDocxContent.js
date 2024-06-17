const { convertDocxToPdf } = require('./docxtopdf');
const { extractPdfContent } = require('./extractPdf')
const mammoth = require('mammoth');

const extractDocxContent = async (file, imageNumbers) => {
  try {
    let textContents;

    if (imageNumbers) {
      const pdf = await convertDocxToPdf(file.buffer);
      textContents = await extractPdfContent(pdf.buffer);
    } else {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const text = result.value; // The extracted plain text

      // Split the text into words
      const words = text.split(/\s+/);
      const pages = [];
      let currentPage = [];
      let wordCount = 0;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        currentPage.push(word);
        wordCount++;

        // Check for full stop
        if (word.includes('.') || word.includes('\n')) {
          // If word count exceeds 400 and there's a full stop within 400 to 500 words
          if (wordCount > 1000 && wordCount <= 1100) {
            // Split the current page at the last full stop within the word count range
            const lastFullStopIndex = currentPage.lastIndexOf('.');
            if (lastFullStopIndex !== -1) {
              pages.push(currentPage.slice(0, lastFullStopIndex + 1).join(' '));
              currentPage = currentPage.slice(lastFullStopIndex + 1);
              wordCount = currentPage.length;
            }
          } else if (wordCount > 600) {
            // If no suitable full stop is found, split at 600 words
            pages.push(currentPage.join(' '));
            currentPage = [];
            wordCount = 0;
          }
        }
      }

      // Add any remaining words to the last page
      if (currentPage.length > 0) {
        pages.push(currentPage.join(' '));
      }

      // Prepare the output in the desired format
      const formattedOutput = pages.map((page, pageIndex) => {
        const lines = page.split('\n');
        return lines.map((line, lineIndex) => ({
          text: line,
          position: { pageIndex, lineIndex }
        }));
      }).flat();

      textContents = formattedOutput;
    }

    return textContents;
  } catch (error) {
    console.error("Error extracting DOCX content:", error);
    throw error;
  }
};


module.exports = { extractDocxContent }