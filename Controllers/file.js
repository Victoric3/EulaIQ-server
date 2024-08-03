const { extractPdfContent } = require("../Helpers/file/extractPdf");
const { extractDocxContent } = require("../Helpers/file/extractDocxContent");
const {
  extractCsvContent,
  extractHtmlContent,
  extractJsonContent,
  extractPptxContent,
  extractTxtContent,
} = require("../Helpers/file/otherFileTypes");
const { extractTextFromOCR, extractAndParseJSON } = require("../Helpers/input/escapeStrinedJson");
const { describe } = require("../data/audioModules");
const { performOCR } = require("../Helpers/file/advancedOcr");
const { pdfToImage } = require("../Helpers/file/pdfToimg");
const { azureOpenai } = require("../Helpers/Libraries/azureOpenai");
const path = require("path");

const handleTextExtraction = async (file) => {
  try {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    let contents = [];

    switch (fileExtension) {
      case ".pdf":
        contents = await extractPdfContent(file.buffer);
        break;
      case ".docx":
        contents = await extractDocxContent(file);
        break;
      case ".json":
        contents = await extractJsonContent(file);
        break;
      case ".txt":
        contents = await extractTxtContent(file);
        break;
      case ".html":
        contents = await extractHtmlContent(file);
        break;
      case ".csv":
        contents = await extractCsvContent(file);
        break;
      case ".pptx":
        contents = await extractPptxContent(file, []);
        break;
      default:
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    // Initialize an object to hold text and images grouped by page index
    const pagesContent = [];

    for (const { text, position } of contents) {
      const pageIndex = position.pageIndex;

      // Initialize page content array if it doesn't exist
      if (!pagesContent[pageIndex]) {
        pagesContent[pageIndex] = { textChunks: [] };
      }

      if (text) {
        // Add text to the current text chunk
        pagesContent[pageIndex].textChunks.push(text);
      }
    }

    // Convert the pagesContent object into an array sorted by page index
    const orderedPagesContent = Object.keys(pagesContent)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((pageIndex) => pagesContent[pageIndex]);

    return orderedPagesContent;
  } catch (error) {
    console.error("Error handling text conversion:", error);
    throw error;
  }
};

const handleTextProcessing = async (module, moduleDescription, file, text, res) => {
  let pageTexts = [];
  let textChunks;
  const maxRetries = 3;

  const retry = async (fn, retries = maxRetries, res) => {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`Attempt ${attempt} failed. Retrying...`);
        if (res) {
          res.io.emit('text-processing-progress', {
            message: `Attempt ${attempt} failed. Retrying...`,
            attempt,
            error: error.message
          });
        }
      }
    }
    throw lastError;
  };

  try {
    console.log("started extracting file text");
    if (file) {
      textChunks = await retry(() => handleTextExtraction(file), 3, res);
    }

    const firstTextChunk =
    text?.length > 0
    ? text
    : textChunks[0].textChunks[0] + textChunks[1]?.textChunks[0];

    const query = describe(firstTextChunk, module, moduleDescription);

    const extractedDescription = await retry(async () => {
      const description = await azureOpenai(
      query,
      `you are an audio resource describer, return a text describing the audio to serve as an introduction to it, use very simple language`,
      "gpt-4o"
    )
    return extractAndParseJSON(description)
  }, 3, res);
    console.log("extractedDescription :", extractedDescription)
    if (
      firstTextChunk.length < 20 ||
      (!extractedDescription.extractionEfficiency &&
        file.mimetype === "application/pdf")
    ) {
      const pageImages = await retry(() => pdfToImage(file.buffer));
      for (let i = 0; i < pageImages.length; i++) {
        if (!pageTexts[i]) {
          pageTexts[i] = { textChunks: [], images: [] };
        }

        const ocrResult = await retry(() => performOCR(pageImages[i].imageBuffer));
        const text = extractTextFromOCR(ocrResult);
        pageTexts[i].textChunks.push(text);
      }
      textChunks = pageTexts;
    }

    return { 
      textChunks: textChunks.flatMap(obj => obj.textChunks), 
      description: extractedDescription 
    };
  } catch (error) {
    console.log(error);
      res.io.emit('text-processing-error', {
        message: "Error during text processing",
        error: error.message
      });
    throw error;
  }
};



module.exports = {
  extractPdfContent,
  handleTextExtraction,
  handleTextProcessing,
};
