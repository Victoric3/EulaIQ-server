const { extractPdfContent } = require("../Helpers/file/extractPdf");
const { extractDocxContent } = require("../Helpers/file/extractDocxContent");
const {
  extractCsvContent,
  extractHtmlContent,
  extractJsonContent,
  extractPptxContent,
  extractTxtContent,
} = require("../Helpers/file/otherFileTypes");
const { extractTextFromOCR } = require("../Helpers/input/escapeStrinedJson");
const { describe } = require("../data/audioModules");
const { performOCR } = require("../Helpers/file/advancedOcr");
const { pdfToImage } = require("../Helpers/file/pdfToimg");
const { azureOpenai } = require("../Helpers/Libraries/azureOpenai");

const handleTextExtraction = async (file) => {
  try {
    let contents = [];

    switch (file.mimetype) {
      case "application/pdf":
        contents = await extractPdfContent(file.buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        contents = await extractDocxContent(file);
        break;
      case "application/json":
        contents = await extractJsonContent(file);
        break;
      case "text/plain":
        contents = await extractTxtContent(file);
        break;
      case "text/html":
        contents = await extractHtmlContent(file);
        break;
      case "text/csv":
        contents = await extractCsvContent(file);
        break;
      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
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
        pagesContent[pageIndex] = { textChunks: [], images: [] };
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

const handleTextProcessing = async (
  module,
  moduleDescription,
  file
) => {
  //initialize textChunks and results
  let pageTexts = [];
  let textChunks = [];

  try {
    textChunks = await handleTextExtraction(file);

    //create intro/description for the audio
    const firstTextChunk =
      textChunks[0].textChunks[0] + textChunks[1]?.textChunks[0];
    const query = describe(firstTextChunk, module, moduleDescription);
    //describe the collection
    const description = await azureOpenai(
      query,
      `you are an audio resource describer, return a text describing the audio to serve as an introduction to it, use very simple language`,
      "gpt4-omini"
    );
    const extractedDescription = JSON.parse(
      description.replace(/```json|```/g, "").trim()
    );
    // console.log(extractedDescription);

    //if the extractionEfficiency is false and its a pdf use advanced ocr
    if (
      firstTextChunk.length < 20 ||
      (!extractedDescription.extractionEfficiency &&
        file.mimetype === "application/pdf")
    ) {
      const pageImages = await pdfToImage(file.buffer);

      for (let i = 0; i < pageImages.length; i++) {
        if (!pageTexts[i]) {
          pageTexts[i] = { textChunks: [], images: [] };
        }
        const ocrResult = await performOCR(pageImages[i].imageBuffer);
        const text = extractTextFromOCR(ocrResult);
        pageTexts[i].textChunks.push(text);
      }
      textChunks = pageTexts;
    }
    
    return { textChunks, description: extractedDescription };
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  extractPdfContent,
  handleTextExtraction,
  handleTextProcessing,
};
