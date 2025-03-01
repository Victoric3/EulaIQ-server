const Papa = require("papaparse");
const fs = require("fs-extra");
const { extractPdfContent } = require("./extractPdf");
const path = require('path');

/**
 * Extract content from JSON file with consistent interface
 * @param {Buffer} buffer - File buffer
 * @param {Object} ebook - Ebook document to update
 * @param {Number} currentPage - Starting position in JSON
 * @param {Number} batchSize - Number of chunks to process
 * @returns {Object} - Response with status, metrics, and page counts
 */
const extractJsonContent = async (buffer, ebook, currentPage = 0, batchSize = 1) => {
  try {
    const jsonContent = JSON.parse(buffer.toString("utf-8"));
    const entries = Object.entries(jsonContent);
    
    // Calculate total "pages" and batch limits
    const ENTRIES_PER_PAGE = 20;
    const totalPages = Math.ceil(entries.length / ENTRIES_PER_PAGE);
    
    // Calculate start and end indices for this batch
    const startIdx = currentPage * ENTRIES_PER_PAGE;
    const endIdx = Math.min(startIdx + (batchSize * ENTRIES_PER_PAGE), entries.length);
    const batchEntries = entries.slice(startIdx, endIdx);
    
    if (batchEntries.length === 0) {
      return {
        status: "success",
        message: "No content in this batch",
        metrics: { sectionsAdded: 0, titlesAdded: 0 },
        totalPages: totalPages,
        newPageCount: 0
      };
    }
    
    // Create HTML-like content from JSON entries
    const processedContent = batchEntries.map(([key, value]) => {
      const textValue = typeof value === "object" ? JSON.stringify(value, null, 2) : value;
      return `<h3>${key}</h3>\n<p>${textValue}</p>`;
    }).join('\n\n');
    
    // Add section breaks between major entries
    const textWithBreaks = processedContent.replace(/<\/p>\n\n<h3>/g, '</p>\n\n<section-break>\n\n<h3>');

    // Create a result object similar to what OCR would produce
    const result = {
      text: textWithBreaks,
      contentTitles: batchEntries.map(([key], idx) => ({
        title: key,
        type: 'head',
        page: currentPage + Math.floor(idx / ENTRIES_PER_PAGE)
      })),
      sectionInfo: {
        continuesPreviousSection: currentPage > 0,
        endsWithIncompleteSection: endIdx < entries.length,
        currentTopicHierarchy: ["JSON Content"]
      }
    };
    
    // Process through the same section extraction pipeline as PDF content
    const startTime = Date.now();
    const { completeSections, incompleteFinal } = extractCompleteSections(result);
    
    // Add sections to ebook
    if (completeSections.length > 0) {
      for (const section of completeSections) {
        ebook.sections.push(section);
      }
      await ebook.save();
    }
    
    // Update pending content
    if (incompleteFinal) {
      ebook.pendingContent = incompleteFinal.content;
      ebook.pendingSectionInfo = incompleteFinal.sectionInfo;
    }
    
    // Update TOC
    updateTableOfContents(ebook, result.contentTitles);
    await ebook.save();
    
    const processingTime = Date.now() - startTime;
    
    return {
      status: "success",
      message: "JSON content processed",
      metrics: {
        sectionsAdded: completeSections.length,
        titlesAdded: result.contentTitles.length,
        pendingContent: incompleteFinal ? true : false,
        processingTime
      },
      totalPages: totalPages,
      newPageCount: Math.ceil((endIdx - startIdx) / ENTRIES_PER_PAGE)
    };
  } catch (error) {
    console.error("Error extracting JSON content:", error);
    throw error;
  }
};

/**
 * Extract content from TXT file with consistent interface
 * @param {Buffer} buffer - File buffer
 * @param {Object} ebook - Ebook document to update
 * @param {Number} currentPage - Starting position
 * @param {Number} batchSize - Number of chunks to process
 * @returns {Object} - Response with status, metrics, and page counts
 */
const extractTxtContent = async (buffer, ebook, currentPage = 0, batchSize = 1) => {
  try {
    const text = buffer.toString("utf-8");
    
    // Detect paragraphs by line breaks or multiple spaces
    const paragraphs = text
      .split(/\n\s*\n|\r\n\s*\r\n|\r\s*\r/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    // Calculate "pages" based on paragraph count
    const PARAGRAPHS_PER_PAGE = 10;
    const totalPages = Math.ceil(paragraphs.length / PARAGRAPHS_PER_PAGE);
    
    // Calculate batch range
    const startIdx = currentPage * PARAGRAPHS_PER_PAGE;
    const endIdx = Math.min(startIdx + (batchSize * PARAGRAPHS_PER_PAGE), paragraphs.length);
    const batchParagraphs = paragraphs.slice(startIdx, endIdx);
    
    if (batchParagraphs.length === 0) {
      return {
        status: "success",
        message: "No content in this batch",
        metrics: { sectionsAdded: 0, titlesAdded: 0 },
        totalPages: totalPages,
        newPageCount: 0
      };
    }
    
    // Format text content with HTML tags and potential section breaks
    const processedContent = batchParagraphs.map((paragraph, idx) => {
      // Detect if paragraph might be a heading (short, ends with no period)
      const isHeading = paragraph.length < 100 && !paragraph.endsWith('.');
      
      if (isHeading) {
        return `<h2>${paragraph}</h2>`;
      } else {
        return `<p>${paragraph}</p>`;
      }
    }).join('\n\n');
    
    // Try to detect logical section breaks (after headings)
    const textWithBreaks = processedContent.replace(/(<\/h2>)\s*\n\n/g, '$1\n\n<section-break>\n\n');
    
    // Create a result object similar to OCR output
    const result = {
      text: textWithBreaks,
      contentTitles: [], // Extract potential titles from content
      sectionInfo: {
        continuesPreviousSection: currentPage > 0,
        endsWithIncompleteSection: endIdx < paragraphs.length,
        currentTopicHierarchy: ["Text Document"]
      }
    };
    
    // Extract potential titles from headings
    const headingMatch = textWithBreaks.match(/<h[1-6]>(.*?)<\/h[1-6]>/g);
    if (headingMatch) {
      headingMatch.forEach(match => {
        const title = match.replace(/<\/?h[1-6]>/g, '');
        result.contentTitles.push({
          title: title,
          type: 'head',
          page: currentPage
        });
      });
    }
    
    // Process through the same section extraction pipeline
    const startTime = Date.now();
    const { completeSections, incompleteFinal } = extractCompleteSections(result);
    
    // Add sections to ebook
    if (completeSections.length > 0) {
      for (const section of completeSections) {
        ebook.sections.push(section);
      }
      await ebook.save();
    }
    
    // Update pending content
    if (incompleteFinal) {
      ebook.pendingContent = incompleteFinal.content;
      ebook.pendingSectionInfo = incompleteFinal.sectionInfo;
    }
    
    // Update TOC
    updateTableOfContents(ebook, result.contentTitles);
    await ebook.save();
    
    const processingTime = Date.now() - startTime;
    
    return {
      status: "success",
      message: "Text content processed",
      metrics: {
        sectionsAdded: completeSections.length,
        titlesAdded: result.contentTitles.length,
        pendingContent: incompleteFinal ? true : false,
        processingTime
      },
      totalPages: totalPages,
      newPageCount: Math.ceil((endIdx - startIdx) / PARAGRAPHS_PER_PAGE)
    };
  } catch (error) {
    console.error("Error extracting TXT content:", error);
    throw error;
  }
};

/**
 * Extract content from HTML file with consistent interface
 * @param {Buffer} buffer - File buffer
 * @param {Object} ebook - Ebook document to update
 * @param {Number} currentPage - Starting position
 * @param {Number} batchSize - Number of chunks to process
 * @returns {Object} - Response with status, metrics, and page counts
 */
const extractHtmlContent = async (buffer, ebook, currentPage = 0, batchSize = 1) => {
  try {
    const htmlContent = buffer.toString("utf-8");
    
    // HTML is already structured, so we can use it directly
    // We just need to break it into manageable chunks
    const chunks = [];
    let currentChunk = '';
    let inTag = false;
    let contentLength = 0;
    const CHUNK_SIZE = 5000; // Characters per chunk
    
    // Split HTML content into chunks while preserving tag integrity
    for (let i = 0; i < htmlContent.length; i++) {
      const char = htmlContent[i];
      currentChunk += char;
      
      if (char === '<') inTag = true;
      if (char === '>') inTag = false;
      
      if (!inTag) contentLength++;
      
      // Create a new chunk when reaching size limit and not in middle of a tag
      if (contentLength >= CHUNK_SIZE && !inTag && char === '>') {
        chunks.push(currentChunk);
        currentChunk = '';
        contentLength = 0;
      }
    }
    
    // Add the last chunk if there's any content left
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    // Calculate total "pages" and batch limits
    const totalPages = chunks.length;
    const startIdx = currentPage;
    const endIdx = Math.min(startIdx + batchSize, totalPages);
    const batchChunks = chunks.slice(startIdx, endIdx);
    
    if (batchChunks.length === 0) {
      return {
        status: "success",
        message: "No content in this batch",
        metrics: { sectionsAdded: 0, titlesAdded: 0 },
        totalPages: totalPages,
        newPageCount: 0
      };
    }
    
    // Join chunks and add section breaks between them
    const processedContent = batchChunks.join('<section-break>\n\n');
    
    // Extract headings for TOC
    const headings = [];
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    while ((match = headingRegex.exec(processedContent)) !== null) {
      const level = parseInt(match[1]);
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      
      // Determine heading type based on level
      let type = 'head';
      if (level === 1) type = 'chapter';
      else if (level > 3) type = 'sub';
      
      headings.push({
        title: title,
        type: type,
        page: currentPage
      });
    }
    
    // Create a result object similar to OCR output
    const result = {
      text: processedContent,
      contentTitles: headings,
      sectionInfo: {
        continuesPreviousSection: currentPage > 0,
        endsWithIncompleteSection: endIdx < chunks.length,
        currentTopicHierarchy: ["HTML Document"]
      }
    };
    
    // Process through the same section extraction pipeline
    const startTime = Date.now();
    const { completeSections, incompleteFinal } = extractCompleteSections(result);
    
    // Add sections to ebook
    if (completeSections.length > 0) {
      for (const section of completeSections) {
        ebook.sections.push(section);
      }
      await ebook.save();
    }
    
    // Update pending content
    if (incompleteFinal) {
      ebook.pendingContent = incompleteFinal.content;
      ebook.pendingSectionInfo = incompleteFinal.sectionInfo;
    }
    
    // Update TOC
    updateTableOfContents(ebook, result.contentTitles);
    await ebook.save();
    
    const processingTime = Date.now() - startTime;
    
    return {
      status: "success",
      message: "HTML content processed",
      metrics: {
        sectionsAdded: completeSections.length,
        titlesAdded: result.contentTitles.length,
        pendingContent: incompleteFinal ? true : false,
        processingTime
      },
      totalPages: totalPages,
      newPageCount: endIdx - startIdx
    };
  } catch (error) {
    console.error("Error extracting HTML content:", error);
    throw error;
  }
};

/**
 * Extract content from CSV file with consistent interface
 * @param {Buffer} buffer - File buffer
 * @param {Object} ebook - Ebook document to update
 * @param {Number} currentPage - Starting position
 * @param {Number} batchSize - Number of chunks to process
 * @returns {Object} - Response with status, metrics, and page counts
 */
const extractCsvContent = async (buffer, ebook, currentPage = 0, batchSize = 1) => {
  try {
    const csvString = buffer.toString("utf-8");
    const parsedData = Papa.parse(csvString, { header: true });
    
    if (!parsedData.data || parsedData.data.length === 0) {
      return {
        status: "success",
        message: "No content found in CSV",
        metrics: { sectionsAdded: 0, titlesAdded: 0 },
        totalPages: 0,
        newPageCount: 0
      };
    }
    
    const rows = parsedData.data;
    const headers = parsedData.meta.fields || [];
    
    // Calculate total "pages" and batch limits
    const ROWS_PER_PAGE = 50;
    const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
    const startIdx = currentPage * ROWS_PER_PAGE;
    const endIdx = Math.min(startIdx + (batchSize * ROWS_PER_PAGE), rows.length);
    const batchRows = rows.slice(startIdx, endIdx);
    
    if (batchRows.length === 0) {
      return {
        status: "success",
        message: "No content in this batch",
        metrics: { sectionsAdded: 0, titlesAdded: 0 },
        totalPages: totalPages,
        newPageCount: 0
      };
    }
    
    // Create HTML table representation
    let html = `<h1>CSV Data</h1>\n<table>\n<thead>\n<tr>\n`;
    
    // Add headers
    headers.forEach(header => {
      html += `<th>${header}</th>\n`;
    });
    html += `</tr>\n</thead>\n<tbody>\n`;
    
    // Add rows
    batchRows.forEach(row => {
      html += `<tr>\n`;
      headers.forEach(header => {
        html += `<td>${row[header] || ''}</td>\n`;
      });
      html += `</tr>\n`;
    });
    
    html += `</tbody>\n</table>`;
    
    // Create a result object similar to OCR output
    const result = {
      text: html,
      contentTitles: [{
        title: 'CSV Data',
        type: 'chapter',
        page: currentPage
      }],
      sectionInfo: {
        continuesPreviousSection: currentPage > 0,
        endsWithIncompleteSection: endIdx < rows.length,
        currentTopicHierarchy: ["CSV Document"]
      }
    };
    
    // Process through the same section extraction pipeline
    const startTime = Date.now();
    const { completeSections, incompleteFinal } = extractCompleteSections(result);
    
    // Add sections to ebook
    if (completeSections.length > 0) {
      for (const section of completeSections) {
        ebook.sections.push(section);
      }
      await ebook.save();
    }
    
    // Update pending content
    if (incompleteFinal) {
      ebook.pendingContent = incompleteFinal.content;
      ebook.pendingSectionInfo = incompleteFinal.sectionInfo;
    }
    
    // Update TOC
    updateTableOfContents(ebook, result.contentTitles);
    await ebook.save();
    
    const processingTime = Date.now() - startTime;
    
    return {
      status: "success",
      message: "CSV content processed",
      metrics: {
        sectionsAdded: completeSections.length,
        titlesAdded: result.contentTitles.length,
        pendingContent: incompleteFinal ? true : false,
        processingTime
      },
      totalPages: totalPages,
      newPageCount: Math.ceil((endIdx - startIdx) / ROWS_PER_PAGE)
    };
  } catch (error) {
    console.error("Error extracting CSV content:", error);
    throw error;
  }
};

/**
 * Extract content from PPTX file with consistent interface by converting to PDF first
 * @param {Object} file - File object with buffer
 * @param {Object} ebook - Ebook document to update
 * @param {Number} currentPage - Starting position
 * @param {Number} batchSize - Number of chunks to process
 * @returns {Object} - Response with status, metrics, and page counts
 */
const extractPptxContent = async (file, ebook, currentPage = 0, batchSize = 1) => {
  // Create a temporary file to store the PPTX
  const tempFilePath = `temp_${Date.now()}_${path.basename(file.originalname)}`;
  
  try {
    // Write buffer to temp file
    await fs.writeFile(tempFilePath, file.buffer);
    
    // Convert PPTX to PDF
    const pdfBuffer = await convertPptxToPdfBuffer(tempFilePath);
    
    // Use the standard PDF extraction pipeline
    const result = await extractPdfContent(pdfBuffer, ebook, currentPage, batchSize);
    
    return result;
  } catch (error) {
    console.error("Error extracting PPTX content:", error);
    throw error;
  } finally {
    // Clean up temp file
    try {
      if (await fs.pathExists(tempFilePath)) {
        await fs.unlink(tempFilePath);
      }
    } catch (cleanupError) {
      console.warn(`Failed to delete temp file ${tempFilePath}:`, cleanupError);
    }
  }
};

// Helper function for section processing (imported from advancedOcr)
function extractCompleteSections(pageResult) {
  // Split content by <section-break> tags
  const sectionTexts = pageResult.text.split('<section-break>');
  const completeSections = [];
  let incompleteFinal = null;
  
  // Process each section
  sectionTexts.forEach((sectionText, index) => {
    // Skip empty sections
    if (!sectionText.trim()) return;
    
    // Last section might be incomplete
    const isLast = index === sectionTexts.length - 1;
    const isComplete = !isLast || !pageResult.sectionInfo.endsWithIncompleteSection;
    
    // Find appropriate title for this section from content titles
    const sectionTitle = findSectionTitle(sectionText, pageResult.contentTitles);
    
    // Create section object
    const section = {
      content: sectionText,
      title: sectionTitle?.title || null,
      type: sectionTitle?.type || null,
      estimatedDuration: estimateContentDuration(sectionText),
      complete: isComplete
    };
    
    if (isComplete) {
      completeSections.push(section);
    } else {
      incompleteFinal = {
        content: sectionText,
        sectionInfo: {
          ...pageResult.sectionInfo,
          incompleteSection: section
        }
      };
    }
  });
  
  return { completeSections, incompleteFinal };
}

// Import required helper functions from advancedOcr
const { updateTableOfContents, findSectionTitle, estimateContentDuration } = require('./advancedOcr');

module.exports = {
  extractCsvContent,
  extractHtmlContent,
  extractJsonContent,
  extractPptxContent,
  extractTxtContent,
};
