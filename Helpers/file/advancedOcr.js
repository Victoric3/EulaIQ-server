const { azureOpenai } = require("../Libraries/azureOpenai");
const { processImages } = require("./azureOcr");
const { extractAndParseJSON } = require("../input/escapeStrinedJson");

async function performOCR(currentPage, ebook, tempFilePaths, totalPages) {
  try {
    console.log("Starting memory-optimized OCR processing...");
    let startTime = Date.now();
    
    // Process one image at a time to reduce memory usage
    let pendingContent = ebook.pendingContent || "";
    let pendingSectionInfo = ebook.pendingSectionInfo || null;
    let allSections = [];
    let allTitles = [];
    
    for (let i = 0; i < tempFilePaths.length; i++) {
      const pageNumber = currentPage + i + 1;
      console.log(`Processing page ${pageNumber}/${totalPages}`);
      
      // Process single image
      const extractedText = await processImages([tempFilePaths[i]]);
      if (!extractedText || !extractedText[0]) {
        console.warn(`No text extracted from page ${pageNumber}`);
        continue;
      }
      
      const result = await processPage(
        pageNumber,
        extractedText[0].extractedTexts,
        tempFilePaths[i],
        pendingSectionInfo
      );
      
      // Handle section continuity
      if (i === 0 && result.sectionInfo.continuesPreviousSection && pendingContent) {
        result.text = pendingContent + result.text;
      }
      
      // Extract complete sections
      const { completeSections, incompleteFinal } = extractCompleteSections(result);
      
      // Immediately save complete sections to database
      if (completeSections.length > 0) {
        // Add to ebook and save immediately to prevent memory buildup
        for (const section of completeSections) {
          ebook.sections.push(section);
        }
        await ebook.save();
        
        // Track for metrics
        allSections.push(...completeSections);
        
        // Clear reference to help GC
        completeSections.length = 0;
      }
      
      // Update pending content for next iteration
      if (incompleteFinal) {
        pendingContent = incompleteFinal.content;
        pendingSectionInfo = incompleteFinal.sectionInfo;
      } else {
        pendingContent = "";
        pendingSectionInfo = null;
      }
      
      // Collect titles
      allTitles = [...allTitles, ...result.contentTitles];
      
      // Clear result object to help GC
      result.text = null;
      result.sections = null;
    }
    
    // Update content titles and pending content
    updateTableOfContents(ebook, allTitles);
    ebook.pendingContent = pendingContent;
    ebook.pendingSectionInfo = pendingSectionInfo;
    ebook.contentCount = totalPages;
    
    // Final save
    await ebook.save();
    
    // Clear large arrays
    allTitles = null;
    
    return { 
      status: "success", 
      message: `Processed with memory optimization`,
      metrics: {
        sectionsAdded: allSections.length,
        titlesAdded: allTitles ? allTitles.length : 0,
        pendingContent: pendingContent ? true : false,
        processingTime: Date.now() - startTime
      }
    };
  } catch (error) {
    console.error('Memory-optimized processing failed:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

// Dedicated page processor
async function processPage(pageNumber, extractedText, imagePath, previousSectionInfo) {
  const query = `  
[OCR ENHANCEMENT WITH SECTION STRUCTURING]

**OCR Input (Raw Text, Page ${pageNumber}):**
${extractedText}

**Previous Section Info:**
${previousSectionInfo ? JSON.stringify(previousSectionInfo) : "None"}

**Your Critical Tasks:**

1. FIX CONTENT FORMATTING:
   - Correct OCR errors and improve formatting
   - Maintain all technical terminology exactly as written

2. IDENTIFY TRUE CONTENT SECTIONS:
   - Each section MUST have a meaningful title from the actual content
   - DO NOT use generic phrases or metadata as titles, including:
     * Headers/footers (e.g., "Compiled by...", "Prepared by...")
     * Page numbers, dates, or document IDs
     * Watermarks, logos, or publication information
   - DO NOT create sections without clear subject-matter titles
   - Mark section boundaries with <section-break> tags BETWEEN sections only
   - NEVER use <section-break> at the beginning or end of the document
   - NEVER create empty sections or double section breaks

3. DETECT TITLE HIERARCHY:
   - Head: Main topics with distinct subject matter (e.g., "Treatment Options", "Disease Pathophysiology")
   - Sub: Subtopics that elaborate on a head topic
   - USE ONLY ACTUAL CONTENT HEADINGS from the document, not descriptive placeholders

**Output Format:**
{
  "text": "<p>Properly formatted HTML content with section breaks BETWEEN sections</p>",
  "contentTitles": [
    {"title": "Exact Section Title", "type": "head|sub", "page": ${pageNumber}}
  ],
  "sectionInfo": {
    "continuesPreviousSection": true|false, 
    "endsWithIncompleteSection": true|false
  }
}`;

  const systemInstruction = `
  You are an AI document processor specializing in academic and technical content structuring.
  
  CRITICAL REQUIREMENTS:
  1. Use <section-break> ONLY between true content sections, never at beginning/end
  2. Never create sections without meaningful titles that relate to the actual subject matter
  3. FILTER OUT metadata, headers/footers, publication info, or phrases like "compiled by..."
  4. Identify REAL content structure based on the actual subject hierarchy
  5. Every section MUST correspond to an actual content heading in the document
  6. Avoid creating sections from decorative text, page markers, or non-content elements
  `;

  try {
    const response = await azureOpenai(
      query,
      systemInstruction,
      'gpt-4o',
      [imagePath]
    );

    const result = extractAndParseJSON(response);

    return result;

  } catch (error) {
    console.error(`Page ${pageNumber} failed:`, error);
    throw new Error(`Page ${pageNumber} processing failed: ${error.message}`);
  }
}

function extractCompleteSections(pageResult) {
  // Clean up malformed section breaks
  const cleanedText = pageResult.text
    .replace(/<section-break>\s*<section-break>/g, '<section-break>') // Remove double breaks
    .replace(/^\s*<section-break>\s*/g, '') // Remove break at start
    .replace(/\s*<section-break>\s*$/g, ''); // Remove break at end
  
  // Split by section breaks
  const sectionTexts = cleanedText.split('<section-break>')
    .map(text => text.trim())
    .filter(text => text.length > 0);
  
  const completeSections = [];
  let incompleteFinal = null;
  
  // Process each section
  sectionTexts.forEach((sectionText, index) => {
    const isLast = index === sectionTexts.length - 1;
    const isComplete = !isLast || !pageResult.sectionInfo.endsWithIncompleteSection;
    
    // Find the best title for this section
    const sectionTitle = findSectionTitle(sectionText, pageResult.contentTitles);
    
    // Skip untitled sections unless they're continuations
    if (!sectionTitle && !(index === 0 && pageResult.sectionInfo.continuesPreviousSection)) {
      console.log("Skipping section without title");
      return;
    }
    
    // Create section object with explicit type matching Story schema
    const section = {
      content: sectionText,
      title: sectionTitle?.title || null,
      type: sectionTitle?.type || 'head', // Default to 'head' if no type specified
      estimatedDuration: estimateContentDuration(sectionText),
      complete: isComplete
    };
    
    // Validate section type
    if (section.type && !['head', 'sub'].includes(section.type)) {
      console.warn(`Invalid section type "${section.type}" for title "${section.title}", defaulting to "head"`);
      section.type = 'head';
    }

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

function updateTableOfContents(ebook, newTitles) {
  // Initialize if needed
  if (!ebook.contentTitles) {
    ebook.contentTitles = [];
  }
  
  // Filter out problematic titles before processing
  const filteredTitles = newTitles.filter(title => {
    // Skip placeholder/metadata titles
    const lowerTitle = title.title.toLowerCase();
    if (lowerTitle.includes("compiled by") || 
        lowerTitle.includes("prepared by") ||
        lowerTitle.includes("copyright") ||
        lowerTitle.includes("all rights reserved") ||
        lowerTitle.match(/page \d+/) ||
        title.title.trim().length < 3) {
      console.log(`Filtered out placeholder title: "${title.title}"`);
      return false;
    }
    return true;
  });
  
  // Add new titles without duplicates
  for (const title of filteredTitles) {
    // Check if this title already exists
    const exists = ebook.contentTitles.some(t => t.title === title.title);
    if (!exists) {
      ebook.contentTitles.push({
        title: title.title,
        type: title.type,
        page: title.page
      });
    }
  }
  
  console.log(`Content titles updated: ${filteredTitles.length} new titles added`);
}

function estimateContentDuration(text) {
  // Average speaking rate: ~150 words per minute
  // Average reading rate: ~250 words per minute
  const wordCount = text.split(/\s+/).length;
  const estimatedMinutes = Math.ceil(wordCount / 150); // For spoken content
  
  // Cap at reasonable podcast segment length
  return Math.min(Math.max(estimatedMinutes, 3), 12);
}

/**
 * Finds the most appropriate title for a given section text from available contentTitles
 * @param {string} sectionText - The text content of the section
 * @param {Array} contentTitles - Array of title objects with title, type and page properties
 * @returns {Object|null} - The matching title object or null if no match found
 */
function findSectionTitle(sectionText, contentTitles) {
  if (!contentTitles || !contentTitles.length || !sectionText) {
    return null;
  }
  
  // First few paragraphs are most likely to contain the title
  const firstParagraphs = sectionText.split('</p>').slice(0, 3).join('</p>');
  
  // Try to find exact match first (highest priority)
  for (const titleObj of contentTitles) {
    if (firstParagraphs.includes(titleObj.title)) {
      return titleObj;
    }
  }
  
  // If no exact match, try case-insensitive match
  for (const titleObj of contentTitles) {
    if (firstParagraphs.toLowerCase().includes(titleObj.title.toLowerCase())) {
      return titleObj;
    }
  }
  
  // Still no match, check if any title is at least partially included
  // (useful for cases where title might be slightly different due to OCR errors)
  for (const titleObj of contentTitles) {
    const titleWords = titleObj.title.toLowerCase().split(/\s+/);
    // If title has multiple words, check if most words are present
    if (titleWords.length > 1) {
      const matchCount = titleWords.filter(word => 
        word.length > 3 && firstParagraphs.toLowerCase().includes(word)
      ).length;
      
      // If more than 70% of significant words match, return this title
      if (matchCount >= Math.ceil(titleWords.length * 0.7)) {
        return titleObj;
      }
    }
  }
  
  // No appropriate match found
  return null;
}

module.exports = { 
  performOCR,
  extractCompleteSections,
  updateTableOfContents,
  findSectionTitle,
  estimateContentDuration
};