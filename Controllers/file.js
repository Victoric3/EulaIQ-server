const { extractPdfContent } = require("../Helpers/file/extractPdf");
const { convertDocxToPdf } = require("../Helpers/file/docxtopdf");
const { convertPptxToPdfBuffer } = require("../Helpers/file/pptxToPdf");
const { saveFileAndAddLinkToEbook, fetchSavedFile } = require("../Helpers/file/saveFile");
const { createEbook, getEbookById } = require("./ebook");
const path = require("path");

const handleTextExtraction = async (file, currentPage = 0, ebook, batchSize = 1) => {
  try {
    // All files are already converted to PDF at this point
    // console.log(`Processing PDF file from page ${currentPage} with batch size ${batchSize}`);
    
    // Extract content using PDF processor
    const response = await extractPdfContent(file.buffer, ebook, currentPage, batchSize);
    
    return response;
  } catch (error) {
    // console.error(`Error handling text extraction for file ${file.originalname}:`, error);
    throw new Error(`Error handling text extraction: ${error.message || error}`);
  }
};

// Update handlegenerateEbook to initialize status tracking
const handlegenerateEbook = async (req, res) => {
  try {
    let file = req.file;
    const originalFile = { ...file };
    // console.log("Original file: ", file.originalname);
    
    // Check file type and convert if needed
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // Convert DOCX to PDF before uploading
    if (fileExtension === '.docx') {
      try {
        const pdfFile = await convertDocxToPdf(file.buffer, file.originalname);
        file = {
          ...file,
          originalname: `${path.basename(file.originalname, '.docx')}.pdf`,
          mimetype: 'application/pdf',
          buffer: pdfFile.buffer,
          size: pdfFile.buffer.length
        };
        // console.log('DOCX successfully converted to PDF');
      } catch (convError) {
        // console.error('Error converting DOCX to PDF:', convError);
        throw new Error(`Failed to convert DOCX to PDF: ${convError.message}`);
      }
    }
    
    // Convert PPTX to PDF before uploading
    else if (fileExtension === '.pptx') {
      try {
        // Assuming convertPptxToPdfBuffer is implemented elsewhere
        const pdfBuffer = await convertPptxToPdfBuffer(`temp_${Date.now()}_${file.originalname}`, file.buffer);
        file = {
          ...file,
          originalname: `${path.basename(file.originalname, '.pptx')}.pdf`,
          mimetype: 'application/pdf',
          buffer: pdfBuffer,
          size: pdfBuffer.length
        };
      } catch (convError) {
        // console.error('Error converting PPTX to PDF:', convError);
        throw new Error(`Failed to convert PPTX to PDF: ${convError.message}`);
      }
    }
    
    // Create ebook record with initial status
    const ebook = await createEbook(req, file);
    
    // Initialize processing status
    await ebook.updateProcessingStatus('initializing', 'Creating ebook record');
    await ebook.logProgress(`Started processing ${originalFile.originalname}`);
    
    // Save file (now always a PDF)
    const saveFileResponse = await saveFileAndAddLinkToEbook(file, ebook);
    await ebook.logProgress('File saved to storage');
    
    // Return response immediately after file is saved
    res.status(202).json({
      message: "Ebook generation started in background",
      ebookId: ebook._id,
      status: "processing",
      ebook: {
        id: ebook._id,
        title: ebook.title,
        fileUrl: ebook.fileUrl,
        status: ebook.status,
        image: ebook.image,
        slug: ebook.slug,
      },
      file: {
        originalName: originalFile.originalname,
        convertedName: file.originalname,
        size: file.size,
        fileUrl: saveFileResponse.fileUrl || ebook.fileUrl
      }
    });
    
    // Start background processing
    startBackgroundProcessing(file, ebook).catch(async (error) => {
      // console.error(`Background processing failed to start: ${error.message}`);
      await ebook.updateProcessingStatus('failed', 'Failed to start processing');
      await ebook.logProgress(`Failed to start processing: ${error.message}`, 'error');
    });
    
  } catch (error) {
    // console.error("Error generating ebook:", error);
    res.status(500).json({errorMessage: `Error generating ebook: ${error.message || error}`});
  }
};

// Add this function for background processing with detailed status tracking
async function startBackgroundProcessing(file, ebook) {
  try {
    await ebook.updateProcessingStatus('processing_pdf', 'Analyzing document structure');
    
    // Begin incremental processing with lower batch size
    const BATCH_SIZE = 1;
    let currentPage = ebook.currentPage ?? 0;
    
    // Get initial metadata like total page count
    const response = await processPageBatch(file, ebook, currentPage, BATCH_SIZE);
    currentPage += BATCH_SIZE;
    
    // Update ebook with initial metadata
    ebook.contentCount = response.totalPages;
    ebook.currentPage = currentPage;
    ebook.processingProgress = {
      pagesProcessed: currentPage,
      totalPages: response.totalPages
    };
    await ebook.save();
    await ebook.logProgress(`Document has ${response.totalPages} total pages`);
    
    // Continue processing remaining pages
    await processPagesInBackground(file, ebook, currentPage, response.totalPages, BATCH_SIZE);
    
  } catch (error) {
    // console.error(`Background processing initialization failed: ${error.message}`);
    ebook.status = "error";
    ebook.processingError = error.message;
    await ebook.updateProcessingStatus('failed', 'Initialization failed');
    await ebook.logProgress(`Initialization failed: ${error.message}`, 'error');
    await ebook.save();
  }
}

// Update processPagesInBackground with detailed tracking
async function processPagesInBackground(file, ebook, startPage, totalPages, batchSize) {
  try {
    let currentPage = startPage;
    
    while (currentPage < totalPages) {
      // Update processing status with current page information
      await ebook.updateProcessingStatus(
        'processing_pdf', 
        `Processing page ${currentPage+1} of ${totalPages}`,
        currentPage
      );
      
      try {
        // Process just one file buffer at a time
        await processPageBatch(file, ebook, currentPage, batchSize);
        currentPage += batchSize;
        await ebook.logProgress(`Processed page ${currentPage} of ${totalPages}`);
      } catch (error) {
        // Log the error but continue with next page
        // console.error(`Error processing page ${currentPage}: ${error.message}`);
        await ebook.logProgress(`Error processing page ${currentPage}: ${error.message}`, 'error');
        
        // Store failed page for potential retry
        ebook.processingDetails = ebook.processingDetails || {};
        ebook.processingDetails.failedPages = ebook.processingDetails.failedPages || [];
        ebook.processingDetails.failedPages.push(currentPage);
        
        // Continue with next page
        currentPage += batchSize;
      }
      
      // Update progress
      ebook.processingProgress.pagesProcessed = currentPage;
      await ebook.save();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
    
    // Final processing stage
    await ebook.updateProcessingStatus('organizing_sections', 'Finalizing document structure');
    
    // Update ebook status when complete
    ebook.status = "complete";
    await ebook.updateProcessingStatus('complete', 'Processing completed');
    await ebook.save();
    
    await ebook.logProgress(`Completed processing ${totalPages} pages for ebook: ${ebook._id}`);
  } catch (error) {
    // console.error(`Background processing failed: ${error.message}`);
    ebook.status = "error";
    ebook.processingError = error.message;
    await ebook.updateProcessingStatus('failed', `Processing failed: ${error.message}`);
    await ebook.logProgress(`Processing failed: ${error.message}`, 'error');
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
    // console.error(`Error handling text extraction for file ${file?.originalname || 'unknown'}:`, error);
    throw new Error(`Error handling text extraction for file ${file?.originalname || 'unknown'}: ${error.message || error}`);
  }
}

// Enhance handleContinueEbookGeneration to add proper logging and handle previous failures

const handleContinueEbookGeneration = async (req, res) => {
  try {
    const { ebookId } = req.params;
    
    // Get existing ebook
    const ebook = await getEbookById(ebookId);
    if (!ebook) {
      throw new Error('Ebook not found');
    }

    // Reset error status for retry
    if (ebook.status === 'error') {
      ebook.status = 'processing';
      ebook.processingError = null;
      await ebook.logProgress('Retrying processing after previous failure');
    }

    // Fetch saved file
    const { file } = await fetchSavedFile(ebook.fileUrl);
    
    // Use the same batch size for consistency
    const BATCH_SIZE = 1;
    
    // Calculate starting point and remaining pages
    const processedPages = ebook.processingProgress?.pagesProcessed || 0;
    const totalPages = ebook.contentCount;
    
    // If we have no content count yet, need to start from scratch
    if (!totalPages) {
      await ebook.logProgress('No page count found, restarting from beginning');
      return await startBackgroundProcessing(file, ebook);
    }
    
    if (processedPages >= totalPages) {
      return res.status(200).json({
        message: 'Ebook generation already complete',
        metrics: {
          totalPages,
          processedPages
        }
      });
    }

    // Log that we're continuing processing
    await ebook.logProgress(`Continuing processing from page ${processedPages+1} of ${totalPages}`);
    await ebook.updateProcessingStatus('processing_pdf', `Resuming from page ${processedPages+1}`);

    // Process first page to get metrics and updated page count
    let response = await processPageBatch(file, ebook, processedPages, BATCH_SIZE);
    let currentPage = processedPages + BATCH_SIZE;
    
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
    // console.error("Error continuing ebook generation:", error);
    
    // Try to update ebook status even if there's an error
    try {
      const ebook = await getEbookById(req.params.ebookId);
      if (ebook) {
        ebook.status = "error";
        ebook.processingError = error.message;
        await ebook.updateProcessingStatus('failed', 'Continuation failed');
        await ebook.logProgress(`Continuation failed: ${error.message}`, 'error');
        await ebook.save();
      }
    } catch (logError) {
      // console.error("Failed to log error to ebook:", logError);
    }
    
    res.status(500).json({
      errorMessage: `Error continuing ebook generation: ${error.message}`,
    });
  }
};

// Get detailed processing status
const getEbookProcessingStatus = async (req, res) => {
  try {
    const { ebookId } = req.params;
    
    const ebook = await getEbookById(ebookId);
    if (!ebook) {
      return res.status(404).json({
        status: 'failed',
        message: 'Ebook not found'
      });
    }
    
    // Return detailed status information for the mobile app
    res.status(200).json({
      status: 'success',
      data: {
        id: ebook._id,
        title: ebook.title,
        status: ebook.status,
        processingStatus: ebook.processingStatus,
        progress: {
          current: ebook.processingProgress?.pagesProcessed || 0,
          total: ebook.processingProgress?.totalPages || 0,
          percent: ebook.processingProgress?.totalPages ? 
            Math.round((ebook.processingProgress.pagesProcessed / ebook.processingProgress.totalPages) * 100) : 0
        },
        currentStep: ebook.processingDetails?.currentStep,
        timeInfo: {
          startedAt: ebook.processingDetails?.startTime,
          lastUpdated: ebook.processingDetails?.lastUpdated,
          estimatedTimeRemaining: ebook.processingDetails?.estimatedTimeRemaining // in seconds
        },
        hasErrors: ebook.processingDetails?.failedPages?.length > 0,
        failedPages: ebook.processingDetails?.failedPages || []
      }
    });
  } catch (error) {
    // console.error(`Error fetching ebook status: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: `Error fetching status: ${error.message}`
    });
  }
};

// Get processing logs for debugging
const getEbookProcessingLogs = async (req, res) => {
  try {
    const { ebookId } = req.params;
    // console.log("ebookId: ", ebookId);
    const ebook = await getEbookById(ebookId);
    if (!ebook) {
      return res.status(404).json({
        status: 'failed',
        message: 'Ebook not found'
      });
    }
    
    // Return log entries for the mobile app
    res.status(200).json({
      status: 'success',
      data: {
        logs: ebook.processingDetails?.processingLog || []
      }
    });
  } catch (error) {
    // console.error(`Error fetching ebook logs: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: `Error fetching logs: ${error.message}`
    });
  }
};

const fetchFileForClient = async (req, res) => {
  try {
    const { fileUrl } = req.query;
    // console.log("fileUrl: ", fileUrl);
    
    // Validate that fileUrl is provided
    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: "File URL is required"
      });
    }
    
    // Use the fetchSavedFile function to retrieve the file
    const fileResponse = await fetchSavedFile(fileUrl);
    
    res.setHeader('Content-Disposition', `attachment; filename=${fileResponse.file.originalname}`);
    res.setHeader('Content-Type', fileResponse.file.contentType);
    res.setHeader('Content-Length', fileResponse.file.contentLength);
    return res.send(Buffer.from(fileResponse.file.buffer));
  
  } catch (error) {
    // console.error("Error retrieving file:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve file",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Update exports
module.exports = {
  extractPdfContent,
  handleTextExtraction,
  handlegenerateEbook,
  handleContinueEbookGeneration,
  getEbookProcessingStatus,
  getEbookProcessingLogs,
  fetchFileForClient 
};