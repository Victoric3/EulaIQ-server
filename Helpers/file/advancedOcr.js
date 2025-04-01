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
    let bookDescription = null;
    
    for (let i = 0; i < tempFilePaths.length; i++) {
      const pageNumber = currentPage + i + 1;
      console.log(`Processing page ${pageNumber}/${totalPages}`);
      
      // Process single image
      const extractedText = await processImages([tempFilePaths[i]]);
      if (!extractedText || !extractedText[0]) {
        console.warn(`No text extracted from page ${pageNumber}`);
        continue;
      }
      
      // Special case for first page - request book description
      const isFirstPage = pageNumber === 1;
      
      const result = await processPage(
        pageNumber,
        extractedText[0].extractedTexts,
        tempFilePaths[i],
        pendingSectionInfo,
        isFirstPage // Pass flag to indicate first page
      );

      console.log("result: ", result);
      
      // If first page and description was generated, save it
      if (isFirstPage && result.bookDescription) {
        bookDescription = result.bookDescription;
        console.log("Generated book description:", bookDescription);
        
        // Update ebook description if not already set or if default
        if (!ebook.description || ebook.description.length < 60) {
          ebook.description = bookDescription;
          await ebook.save();
          console.log("Book description saved to ebook record");
        }
      }
      
      // Add to start of performOCR function, after result is received:
      console.log(`Page ${pageNumber} result structure check:`, {
        hasMetadata: !!result.metadata,
        hasSections: Array.isArray(result.sections),
        sectionsCount: result.sections?.length || 0
      });

      // Add a safety check to make property paths more resilient:
      if (!result.metadata) {
        // Create default metadata if completely missing
        result.metadata = {
          continuesPreviousSection: false,
          endsWithIncompleteSection: false,
          page: pageNumber
        };
      }
      
      // Handle section continuity
      if (i === 0 && result.metadata?.continuesPreviousSection && pendingContent) {
        // Since we now get structured sections instead of raw text,
        // we need to modify the first section's content instead of result.text
        if (result.sections && result.sections.length > 0) {
          result.sections[0].content = pendingContent + result.sections[0].content;
        }
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
async function processPage(pageNumber, extractedText, imagePath, previousSectionInfo, requestDescription = false) {
  // Modify the prompt when requesting description
  const descriptionRequest = requestDescription ? `
**Additional Task (FIRST PAGE ONLY)**:
Generate a concise description of this document (150-200 words) that:
- Summarizes the main topic and purpose of the document
- Mentions the intended audience and key subject areas
- Provides context about the document's significance
- Is informative and educational in tone
- Is at least 100 words in length
` : '';

  const query = `  
[OCR ENHANCEMENT WITH STRUCTURED JSON OUTPUT]

**OCR Input (Raw Text, Page ${pageNumber}):**
${extractedText}

**Previous Section Info:**
${previousSectionInfo ? JSON.stringify(previousSectionInfo) : "None"}

${descriptionRequest}

**Your Critical Tasks:**

1. ENHANCE TEXT QUALITY:
   - Correct OCR errors while preserving technical terminology
   - Maintain proper paragraph structure and logical flow
   - Preserve tables, lists, and formatting

2. RECONSTRUCT MISSING CONTENT:
   - EXAMINE THE IMAGE CAREFULLY for tables, charts, and diagrams
   - If the OCR text is missing tables visible in the image, RECREATE THEM completely
   - If tables are malformed or broken in the OCR text, fix them using the image
   - Do not omit ANY visible content from the image

3. CREATE STRUCTURED SECTIONS:
   - Identify meaningful content divisions with clear titles
   - Each section must have exactly ONE corresponding title from the document
   - Distinguish between main topics ("head") and subtopics ("sub")
   - Use actual headings from the document, not descriptive placeholders

4. FORMAT WITH HTML:
   - Use <h1>/<h2> tags for headings
   - Use <p> tags for paragraphs
   - Use <table>, <tr>, <td>, <th> tags for ALL tables
   - Use <strong>, <em> tags for emphasis
   - Content should be properly nested and valid HTML
   - Include captions for tables using <caption> tags

**Visual Content Processing Instructions:**
When you see a table in the image:
1. Create proper HTML tables with <table>, <tr>, <td>, and <th> tags
2. Include ALL columns and rows visible in the image
3. Preserve column headers and row labels exactly as they appear
4. Maintain data alignment (left, center, right) as in the original
5. Include table captions if present

When you see non-textual images (diagrams, illustrations, photos):
1. DESCRIBE THE IMAGE in educational, detailed terms
2. Focus on medical/scientific relevance to the surrounding content
3. Include 3-5 sentences with key details visible in the image
4. Wrap descriptions in
<div class="figure-reference" data-page="4">
  <p class="figure-description">This image shows two artistic representations of Aristotle...</p>
</div>
5. Place the description at the exact position the image appears in the content

For example, if you see a heart diagram:
<div class="figure-reference" data-page="${pageNumber}">
  <p class="figure-description">
This anatomical illustration shows the human heart with labeled chambers. The four chambers (right atrium, right ventricle, left atrium, and left ventricle) are clearly distinguished by color. Major blood vessels including the aorta, superior vena cava, and pulmonary arteries are labeled. The image demonstrates blood flow through the heart with directional arrows indicating oxygenated and deoxygenated blood pathways.
</p>
</div>

CREATE FLUTTER-COMPATIBLE TABLES:
  * Use simple <table width="100%"> structure
  * Ensure consistent column count in all rows
  * Use only basic <tr>, <th>, and <td> elements
  * Avoid rowspan, colspan, and complex nesting
  * Do not use custom CSS styles or attributes

**Output Format - VALID JSON:**
{
  "sections": [
    {
      "title": "Section Title",
      "content": "<h2>Section Title</h2><p>Section content with proper HTML</p>",
      "type": "head|sub",
      "complete": true
    },
    {
      "title": "Another Section",
      "content": "<h2>Another Section</h2><p>More content...</p>",
      "type": "head|sub",
      "complete": true
    }
  ],${requestDescription ? `
  "bookDescription": "A comprehensive description of the document covering its main topics, intended audience, and significance...",` : ''}
  "metadata": {
    "continuesPreviousSection": true|false,
    "endsWithIncompleteSection": true|false
  }
}
   CRITICAL OUTPUT REQUIREMENTS:
1. DO NOT REPEAT PREVIOUS CONTENT: NEVER include content from "Previous Section Info" - this will be merged programmatically
2. ONE-TO-ONE MAPPING: Each section MUST have exactly ONE title from the document
3. COMPLETE CONTENT: Include ALL content visible in the current image
4. PROPER HTML: Use appropriate tags (<h1>/<h2>, <p>, <table>, etc.)
5. SECTION INTEGRITY: Each section must be meaningful and substantial
6. JSON VALIDITY: Output must be valid, parseable JSON

NOTE: For continuing sections, start from where the previous section ended. The system will handle the merging automatically.`;

  const systemInstruction = `
  You are an AI document processor specializing in structured content extraction with expertise in tables and diagrams.
  
  CRITICAL REQUIREMENTS:
  1. Output valid JSON with properly formatted sections
  2. Extract meaningful section titles from the actual document
  3. Exclude headers, footers, page numbers, and metadata
  4. Maintain all technical terminology exactly as written
  5. Preserve and reconstruct all tables, diagrams, and structured content visible in the image
  6. Fill in any content that OCR missed by carefully examining the image
  7. Include ALL content in the output - nothing should be lost
  
  When you receive a document image with tables or diagrams:
  - ALWAYS check if the OCR text accurately captured all tabular content
  - If tables are missing or malformed, reconstruct them completely using HTML tags
  - Follow proper accessibility standards for table HTML markup

    When you receive a document image containing non-textual elements:
  - For illustrations, photos, and non-textual diagrams: create detailed textual descriptions
  - Wrap image descriptions in <image data-page="$pageNumber"></image> tags
  - Make descriptions educational and contextually relevant to the subject matter
  `;

  try {
    const response = await azureOpenai(
      query,
      systemInstruction,
      'gpt-4o',
      [imagePath]
    );

    const result = extractAndParseJSON(response);
    
    // Add page number to metadata
    if (result && result.metadata) {
      result.metadata.page = pageNumber;
    }
    
    return result;

  } catch (error) {
    console.error(`Page ${pageNumber} failed:`, error);
    throw new Error(`Page ${pageNumber} processing failed: ${error.message}`);
  }
}

function extractCompleteSections(pageResult) {
  if (!pageResult || !pageResult.sections || !Array.isArray(pageResult.sections)) {
    console.warn('Invalid page result format - missing sections array');
    return { completeSections: [], incompleteFinal: null };
  }

  const completeSections = [];
  let incompleteFinal = null;
  
  // Process each section
  pageResult.sections.forEach((section, index) => {
    const isLast = index === pageResult.sections.length - 1;
    
    // Last section might be incomplete if the page result indicates so
    const isComplete = !isLast || !pageResult.metadata.endsWithIncompleteSection;
    
    // Create a proper section object with schema fields
    const processedSection = {
      content: section.content,
      title: section.title,
      type: section.type === 'sub' ? 'sub' : 'head', // Default to 'head' if not 'sub'
      estimatedDuration: estimateContentDuration(section.content),
      complete: isComplete
    };
    
    // Add to proper collection based on completeness
    if (isComplete) {
      completeSections.push(processedSection);
    } else {
      incompleteFinal = {
        content: section.content,
        sectionInfo: {
          ...pageResult.metadata,  // Correct property name
          incompleteSection: processedSection
        }
      };
    }
  });
  
  // Extract content titles from sections for backward compatibility
  pageResult.contentTitles = pageResult.sections.map((section, index) => ({
    title: section.title,
    type: section.type,
    page: pageResult.metadata?.page || 0
  }));
  
  return { completeSections, incompleteFinal };
}

function updateTableOfContents(ebook, newTitles) {
  if (!ebook.contentTitles) {
    ebook.contentTitles = [];
  }
  
  // Filter out problematic titles before processing
  const filteredTitles = newTitles.filter(title => {
    if (!title || !title.title) return false;
    
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
  
  // Add new titles without duplicates using normalized comparison
  for (const title of filteredTitles) {
    const normalizedTitle = title.title.toLowerCase().trim();
    const exists = ebook.contentTitles.some(t => 
      t.title.toLowerCase().trim() === normalizedTitle
    );
    
    if (!exists) {
      ebook.contentTitles.push({
        title: title.title,
        type: title.type,
        page: title.page
      });
    }
  }
  
  console.log(`Content titles updated: ${filteredTitles.length} filtered titles processed`);
}

function estimateContentDuration(text) {
  // Average speaking rate: ~150 words per minute
  // Average reading rate: ~250 words per minute
  const wordCount = text.split(/\s+/).length;
  const estimatedMinutes = Math.ceil(wordCount / 150); // For spoken content
  
  // Cap at reasonable podcast segment length
  return Math.min(Math.max(estimatedMinutes, 3), 12);
}


module.exports = { 
  performOCR,
  extractCompleteSections,
  updateTableOfContents,
  estimateContentDuration
};