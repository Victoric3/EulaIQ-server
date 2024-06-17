const JSON5 = require("json5");

function extractAndParseJSON(text) {
  // Remove bad control characters (e.g., backspace, form feed, etc.)
  const sanitizedText = text.replace(/[\u0000-\u0019]+/g, "");

  // Regex to find JSON within triple backticks
  const jsonRegex = /```json\s*([\s\S]*?)\s*```/;

  let match = jsonRegex.exec(sanitizedText);
  let parsedObject = null;

  if (match && match[1]) {
    // Found JSON within triple backticks
    const jsonString = match[1].trim();
    try {
      parsedObject = JSON5.parse(jsonString);
      console.log("Successfully parsed JSON:", parsedObject);
    } catch (parseError) {
      console.error("Failed to parse JSON chunk:", parseError);
      // Log the problematic JSON string for debugging
      console.error("Problematic JSON string:", jsonString);
    }
  } else {
    // No triple backticks found, attempt to parse the sanitized text directly
    try {
      parsedObject = JSON5.parse(sanitizedText);
      console.log("Successfully parsed JSON:", parsedObject);
    } catch (error) {
      console.error("Failed to parse JSON:", error);
      // Log the sanitized text for debugging
      console.error("Sanitized text:", sanitizedText);
    }
  }

  return parsedObject;
}



function extractTextFromOCR(ocrResult) {
  if (!ocrResult.readResult || !ocrResult.readResult.blocks) {
    return ""; // Return an empty string if no readResult or blocks are found
  }

  let extractedText = ocrResult.readResult.blocks
    .flatMap((block) =>
      block.lines
        ? block.lines.flatMap((line) =>
            line.words ? line.words.map((word) => word.text) : []
          )
        : []
    )
    .join(" ");

  return extractedText;
}

module.exports = { extractAndParseJSON, extractTextFromOCR };
