const { azureOpenai } = require("../Libraries/azureOpenai");
const { processImages } = require("./azureOcr");
const { extractAndParseJSON } = require("../input/escapeStrinedJson");

async function performOCR(currentPage, ebook, tempFilePaths, totalPages) {
  try {
    console.log("Starting parallel OCR processing...");
    let startTime = Date.now();
    const extractedTexts = await processImages(tempFilePaths);
    const previousContentTitles = ebook.contentTitles;

    // Configure parallel processing
    const pagePromises = Array.from({ length: extractedTexts.length}).map((_, i) => {
      const pageNumber = currentPage + i + 1;
      return processPage(
        pageNumber,
        extractedTexts[i].extractedTexts,
        tempFilePaths[i],
        previousContentTitles
      );
    });

    // Execute all pages concurrently with timeout
    const pageResults = await Promise.all(
      pagePromises.map(p => 
        Promise.race([
          p,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Page processing timeout')), 120000)
          )
        ])
      )
    );

    // Merge results
    const merged = pageResults.reduce((acc, result) => ({
      text: acc.text + result.text,
      contentTitles: [...acc.contentTitles, ...result.contentTitles]
    }), { text: "", contentTitles: [] });

    // Deduplicate titles
    const uniqueTitles = Array.from(new Map(
      merged.contentTitles.map(t => [t.title + t.page, t])
    ).values());

    // Update ebook
    ebook.content.push(merged.text);
    ebook.contentTitles.push(...uniqueTitles);
    ebook.contentCount = totalPages;

    await ebook.save();

    return { 
      status: "success", 
      message: `Pages processed successfully`,
      metrics: {
        characters: merged.text.length,
        titlesAdded: uniqueTitles.length,
        processingTime: Date.now() - startTime
      }
    };

  } catch (error) {
    console.error('Parallel processing failed:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

// Dedicated page processor
async function processPage(pageNumber, extractedText, imagePath) {
  const query = `  
[OCR ENHANCEMENT - PAGE ${pageNumber}]
**OCR Input (Raw/Uncorrected):**
${extractedText}

**Your Task:**
1. CONTENT IMPROVEMENT:
- Act as expert proofreader for OCR text
- Fix ALL spelling mistakes (e.g. "Guld" → "GUID", "Allocaton" → "Allocation")
- Add missing words ONLY when context clearly indicates omission 
  (e.g. "BIOS is [...] basic operators" → "BIOS is [...] basic operations")
- Correct misplaced line breaks while keeping paragraph structure
- Maintain ALL technical terms and original content structure

2. TITLE IDENTIFICATION:
- Identify EXPLICIT headings/chapters/subtitles
- Use verbatim text from CORRECTED content
- Page numbers must match actual source

**Required Output Format:**
{
  "text": "<p>Corrected HTML text with <br> tags</p>",
  "contentTitles": [
    {"title": "Exact Heading Text", "type": "head|sub|chapter", "page": ${pageNumber}}
  ]
}

**Examples of Required Corrections:**
1. OCR: "cooperture organization" → Corrected: "cooperative organization"
2. OCR: "boot-up times are faster; windows 8 boots in 8 seconds" → Keep intact
3. OCR: "Allocaton Unit Size" → Corrected: "Allocation Unit Size"

**Strict Rules:**
- DO NOT invent content not present in OCR
- DO NOT change correct technical terms
- DO NOT use markdown in JSON response
- DO NOT add headings not explicitly shown
- DO NOT guess page numbers for titles

**Response MUST be valid JSON:**
NO markdown code blocks, NO trailing commas
`;

  const systemInstruction = `
  You are an OCR enhancement specialist with deep technical proofreading expertise. 
  Balance these priorities:
  1. Faithfully preserve original content structure
  2. Correct ALL OCR errors using contextual understanding
  3. Maintain technical accuracy above all
  `;

  try {
    const response = await azureOpenai(
      query,
      systemInstruction,
      'gpt-4o',
      [imagePath]
    );

    const result = extractAndParseJSON(response);
    
    // Validate page number consistency
    if (result.contentTitles.some(t => t.page !== pageNumber)) {
      throw new Error('Page number mismatch in titles');

    }

    return result;

  } catch (error) {
    console.error(`Page ${pageNumber} failed:`, error);
    throw new Error(`Page ${pageNumber} processing failed: ${error.message}`);
  }
}

module.exports = { performOCR };