const { extractPdfContent } = require("../Helpers/file/extractPdf");
const { extractDocxContent } = require("../Helpers/file/extractDocxContent");
const {
  extractCsvContent,
  extractHtmlContent,
  extractJsonContent,
  extractPptxContent,
  extractTxtContent,
} = require("../Helpers/file/otherFileTypes");
const { saveFileAndAddLinkToEbook } = require("../Helpers/file/saveFile");
const { createEbook, getEbookById } = require("./ebook");
const path = require("path");
// const { retry } = require("../Helpers/file/retryFunc");
// const { remove } = require("../Models/comment");

const handleTextExtraction = async (file, currentPage = 0, ebook) => {
  try {
    const fileExtension = path.extname(file.originalname).toLowerCase();

    let response;

    // Extract text from file
    switch (fileExtension) {
      case ".pdf":
        response = await extractPdfContent(file.buffer, ebook, currentPage);
        break;
      case ".docx":
        response = await extractDocxContent(file, ebook, currentPage);
        break;
      case ".json":
        response = await extractJsonContent(file, ebook, currentPage);
        break;
      case ".txt":
        response = await extractTxtContent(file, ebook, currentPage);
        break;
      case ".html":
        response = await extractHtmlContent(file, ebook, currentPage);
        break;
      case ".csv":
        response = await extractCsvContent(file, ebook, currentPage);
        break;
      case ".pptx":
        response = await extractPptxContent(file, ebook, currentPage);
        break;
      default:
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    return response;
  } catch (error) {
    console.error(`Error handling text extraction for file ${file.originalname}:`, error);
    throw new Error(`Error handling text extraction for file ${file.originalname}: ${error.message || error}`);
  }
};

const handlegenerateEbook = async (req, res) => {
  try {
    let response;
    const file = req.file;
    const ebookId = await createEbook(req, file);
    const ebook = await getEbookById(ebookId);

    const clonedFileBuffer = Buffer.from(file.buffer);
    const clonedFileForSaveBuffer = Buffer.from(file.buffer);

    const clonedFile = { ...file, buffer: clonedFileBuffer };
    const clonedFileForSave = { ...file, buffer: clonedFileForSaveBuffer };

    Promise.all([
      // use Cloned file to avoid mutation of req.file
      response = await handleTextExtraction(clonedFile, 0, ebook),
      
      // use Cloned file to avoid mutation of req.file
      await saveFileAndAddLinkToEbook(clonedFileForSave, ebook),
    ]);

    if(response.status === "success"){
      res.status(200).json({message: response.message || "Ebook generated successfully", ebookId});
    }
  }catch(error){
    console.error("Error generating ebook:", error);
    res.status(500).json({errorMessage: `Error generating ebook: ${error.message || error}`});
  }
};

module.exports = {
  extractPdfContent,
  handleTextExtraction,
  handlegenerateEbook,
};