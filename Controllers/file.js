const { extractPdfContent } = require("../Helpers/file/extractPdf");
const { extractDocxContent } = require("../Helpers/file/extractDocxContent");
const {
  // extractCsvContent,
  // extractHtmlContent,
  // extractJsonContent,
  extractPptxContent,
  // extractTxtContent,
} = require("../Helpers/file/otherFileTypes");
const { saveFileAndAddLinkToEbook, fetchSavedFile } = require("../Helpers/file/saveFile");
const { createEbook, getEbookById } = require("./ebook");
const path = require("path");

const handleTextExtraction = async (file, currentPage = 0, ebook, batchSize = 1) => {
  try {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    console.log(`Processing ${fileExtension} file from page ${currentPage} with batch size ${batchSize}`);
    let response;

    // Extract text from file - consistent parameter passing
    switch (fileExtension) {
      case ".pdf":
        response = await extractPdfContent(file.buffer, ebook, currentPage, batchSize);
        break;
      case ".docx":
        response = await extractDocxContent(file, ebook, currentPage, batchSize);
        break;
      // case ".json":
      //   response = await extractJsonContent(file, ebook, currentPage, batchSize);
      //   break;
      // case ".txt":
      //   response = await extractTxtContent(file, ebook, currentPage, batchSize);
      //   break;
      // case ".html":
      //   response = await extractHtmlContent(file, ebook, currentPage, batchSize);
      //   break;
      // case ".csv":
      //   response = await extractCsvContent(file, ebook, currentPage, batchSize);
      //   break;
      case ".pptx":
        response = await extractPptxContent(file, ebook, currentPage, batchSize);
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
    console.log("file: ", file);
    
    // Create ebook record first
    const ebookId = await createEbook(req, file);
    const ebook = await getEbookById(ebookId);
    
    console.log("ebookId: ", ebookId);
    
    // Save file only once - avoid creating multiple buffer copies
    const saveFileResponse = await saveFileAndAddLinkToEbook(file, ebook);
    console.log("saveFileResponse: ", saveFileResponse);
    
    // Begin incremental processing with lower batch size
    const BATCH_SIZE = 1; // Process one page at a time instead of three
    let currentPage = 0;
    let totalProcessed = 0;
    let totalMetrics = { characters: 0, titlesAdded: 0, processingTime: 0 };
    
    // Start with first page to get total page count
    response = await processPageBatch(file, ebook, currentPage, BATCH_SIZE);
    
    // Update metrics
    currentPage += BATCH_SIZE;
    totalProcessed += response.newPageCount || 0;
    updateTotalMetrics(totalMetrics, response.metrics);
    
    // Send initial response to client
    res.status(202).json({
      message: "Ebook generation started",
      ebookId: ebookId,
      status: "processing",
      progress: {
        processed: totalProcessed,
        total: response.totalPages || 0,
        percent: Math.round((totalProcessed / (response.totalPages || 1)) * 100)
      }
    });
    
    // Continue processing in background
    const totalPages = response.totalPages;
    processPagesInBackground(file, ebook, currentPage, totalPages, BATCH_SIZE);
    
  } catch (error) {
    console.error("Error generating ebook:", error);
    res.status(500).json({errorMessage: `Error generating ebook: ${error.message || error}`});
  }
};

// Helper function to process pages in background after response is sent
async function processPagesInBackground(file, ebook, startPage, totalPages, batchSize) {
  try {
    let currentPage = startPage;
    
    while (currentPage < totalPages) {
      console.log(`Processing pages ${currentPage} to ${currentPage + batchSize - 1}`);
      
      // Process just one file buffer at a time, avoid multiple copies
      await processPageBatch(file, ebook, currentPage, batchSize);
      currentPage += batchSize;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
    
    // Update ebook status when complete
    ebook.status = "complete";
    await ebook.save();
    
    console.log(`Completed processing ${totalPages} pages for ebook: ${ebook._id}`);
  } catch (error) {
    console.error(`Background processing failed: ${error.message}`);
    ebook.status = "error";
    ebook.processingError = error.message;
    await ebook.save();
  }
}

// Process a batch of pages without creating multiple buffer copies
async function processPageBatch(file, ebook, currentPage, batchSize) {
  // Create a single buffer copy for this batch
  const fileBuffer = Buffer.from(file.buffer);
  const processFile = { 
    ...file, 
    buffer: fileBuffer 
  };
  
  try {
    // Extract content
    const response = await handleTextExtraction(processFile, currentPage, ebook, batchSize);
    
    // Clear buffer reference to help garbage collection
    processFile.buffer = null;
    
    return response;
  } catch (error) {
    console.error(`Error handling text extraction for file ${file?.originalname || 'unknown'}:`, error);
    throw new Error(`Error handling text extraction for file ${file?.originalname || 'unknown'}: ${error.message || error}`);
  }
}

// Helper to update metrics
function updateTotalMetrics(totalMetrics, newMetrics) {
  if (!newMetrics) return;
  
  totalMetrics.characters += newMetrics.characters || 0;
  totalMetrics.titlesAdded += newMetrics.titlesAdded || 0;
  totalMetrics.processingTime += parseInt(newMetrics.processingTime, 10) || 0;
}

const handleContinueEbookGeneration = async (req, res) => {
  try {
    const { ebookId } = req.params;
    
    // Get existing ebook
    const ebook = await getEbookById(ebookId);
    if (!ebook) {
      throw new Error('Ebook not found');
    }

    // Fetch saved file
    const { file } = await fetchSavedFile(ebook.fileUrl);
    
    // Use the same batch size for consistency
    const BATCH_SIZE = 1;
    
    // Calculate starting point and remaining pages
    const processedPages = ebook.processingProgress?.pagesProcessed || 0;
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

    // Process first page to get metrics and updated page count
    let response = await processPageBatch(file, ebook, processedPages, BATCH_SIZE);
    let currentPage = processedPages + BATCH_SIZE;
    let totalMetrics = {
      characters: 0,
      titlesAdded: 0,
      processingTime: 0
    };
    
    updateTotalMetrics(totalMetrics, response.metrics);

    // Send initial response to client
    res.status(202).json({
      message: "Ebook generation continued",
      ebookId: ebook._id,
      status: "processing",
      progress: {
        processed: currentPage,
        total: totalPages,
        percent: Math.round((currentPage / totalPages) * 100)
      }
    });
    
    // Continue processing in background
    processPagesInBackground(file, ebook, currentPage, totalPages, BATCH_SIZE);
    
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