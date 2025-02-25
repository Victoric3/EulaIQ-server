const { extractPdfContent } = require("../Helpers/file/extractPdf");
const { extractDocxContent } = require("../Helpers/file/extractDocxContent");
const {
  extractCsvContent,
  extractHtmlContent,
  extractJsonContent,
  extractPptxContent,
  extractTxtContent,
} = require("../Helpers/file/otherFileTypes");
const { saveFileAndAddLinkToEbook, fetchSavedFile } = require("../Helpers/file/saveFile");
const { createEbook, getEbookById } = require("./ebook");
const path = require("path");

const handleTextExtraction = async (file, currentPage = 0, ebook) => {
  try {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    console.log("currentPage: ", currentPage);
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

    console.log("ebookId: ", ebookId);

    const clonedFileBuffer = Buffer.from(file.buffer);
    const clonedFileForSaveBuffer = Buffer.from(file.buffer);

    const clonedFile = { ...file, buffer: clonedFileBuffer };
    const clonedFileForSave = { ...file, buffer: clonedFileForSaveBuffer };

    const results = await Promise.all([
      handleTextExtraction(clonedFile, 0, ebook),
      saveFileAndAddLinkToEbook(clonedFileForSave, ebook),
    ]);

    response = await results[0];

    // if the pages in the ebook are greater than 3, we will extract the next 3 pages, continue until we have extracted all the pages
    let currentPage = 3;
    let pageCount = response.newPageCount;
    let totalMetrics = response.metrics;
    
    
    while (currentPage < response.totalPages) {
      const clonedFileForMorePagesBuffer = Buffer.from(file.buffer);
      const clonedFileForMorePages = { ...file, buffer: clonedFileForMorePagesBuffer };
      response = await handleTextExtraction(clonedFileForMorePages, currentPage, ebook);
      currentPage += 3;
      pageCount += response.newPageCount;
      totalMetrics.characters += response.metrics.characters;
      totalMetrics.titlesAdded += response.metrics.titlesAdded;
      totalMetrics.processingTime += parseInt(response.metrics.processingTime, 10);
    }
    console.log("response: ", response);
    console.log("pageCount: ", pageCount);
    console.log("pageConvInEbook: ", ebook.content.length);
    

    if(response.status === "success"){
      totalMetrics.processingTime = `${totalMetrics.processingTime}ms`;
      res.status(200).json({message: `Processed ${pageCount} pages in parallel`, metrics: totalMetrics, ebook});
    }
  }catch(error){
    console.error("Error generating ebook:", error);
    res.status(500).json({errorMessage: `Error generating ebook: ${error.message || error}`});
  }
};

const handleContinueEbookGeneration = async (req, res) => {
  try {
    const { ebookId } = req.params;
    
    // Get existing ebook
    const ebook = await getEbookById(ebookId);
    if (!ebook) {
      throw new Error('Ebook not found');
    }

    const { file } = await fetchSavedFile(ebook.fileUrl);
    console.log(file);
    // Calculate starting point and remaining pages
    const processedPages = ebook.content.length * 3;
    const totalPages = ebook.contentCount;
    
    if (processedPages >= totalPages) {
      return res.status(200).json({
        message: 'Ebook generation already complete',
        metrics: {
          totalPages,
          processedPages
        }
      });
    }

    let response;
    let currentPage = processedPages;
    let pageCount = 0;
    let totalMetrics = {
      characters: 0,
      titlesAdded: 0,
      processingTime: 0
    };

    // Process remaining pages in chunks of 3
    while (currentPage < totalPages) {
      const clonedFileBuffer = Buffer.from(file.buffer);
      const clonedFile = { ...file, buffer: clonedFileBuffer };
      console.log("clonedFile.originalName: ", clonedFile.originalname);
      
      response = await handleTextExtraction(clonedFile, currentPage, ebook);
      currentPage += 3;
      pageCount += response.newPageCount;
      
      // Accumulate metrics
      totalMetrics.characters += response.metrics.characters;
      totalMetrics.titlesAdded += response.metrics.titlesAdded;
      totalMetrics.processingTime += parseInt(response.metrics.processingTime, 10);
    }

    if (response.status === "success") {
      totalMetrics.processingTime = `${totalMetrics.processingTime}ms`;
      res.status(200).json({
        message: `Resumed and processed ${pageCount} additional pages`,
        metrics: totalMetrics,
        ebook,
        progress: {
          totalPages,
          processedPages: currentPage,
          remainingPages: Math.max(0, totalPages - currentPage)
        }
      });
    }

  } catch (error) {
    console.error("Error continuing ebook generation:", error);
    res.status(500).json({
      errorMessage: `Error continuing ebook generation: ${error.message}`,
    });
  }
};

module.exports = {
  extractPdfContent,
  handleTextExtraction,
  handlegenerateEbook,
  handleContinueEbookGeneration,
};