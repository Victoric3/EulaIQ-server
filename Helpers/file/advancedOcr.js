const { azureOpenai } = require("../Libraries/azureOpenai");
const { processImages } = require("./azureOcr");
const { uploadImagesToAzure } = require("./saveFile");

async function performOCR(currentPage, ebook, tempFilePaths) {
  try {
    console.log("started performing ocr.....");

    // Extract text from current page and next 2 pages
    const extractedTexts = await processImages(tempFilePaths);

    // Process combined text with GPT-4o mini
    const previousContentTitles = ebook.contentTitles;

    const query = `    
    Here are the Ocr Results for the current page and the next 2 pages:
    1. ${extractedTexts[0].extractedTexts}(pagenumber: ${currentPage})
    2. ${extractedTexts[1].extractedTexts}(pagenumber: ${currentPage + 1})
    3. ${extractedTexts[2].extractedTexts}(pagenumber: ${currentPage + 2})

    Here are the previous content titles for context:
    ${previousContentTitles}

    Please extract the text and structure it in the following format:
    {
      text: "extracted text | a rich text(html)",
      contentTitles: [
        { title: "title1", type: "head", page: ${currentPage} },
        { title: "title2", type: "sub", page: ${currentPage} },
        ...
      ]
    }

    the text is the structured text extracted from the images and the contentTitles are the titles extracted from the text
    head is the main title and sub is the subtitle while page is the page number of the page the title was extracted from
    `;

    const systemInstruction = `
    You are an advanced optical character processor. You will receive images of pages from a book. Your task is to review the OCR output and provide structured data.
    `;

    const { imageUrls } = await uploadImagesToAzure(tempFilePaths);
    const gptResponse = await azureOpenai(query, systemInstruction, 'gpt-4o', images = imageUrls);
    // Structure the output
    const { text, contentTitles } = gptResponse;

    console.log("gptResponse: ", gptResponse);

    // Add text to ebook content array
    ebook.content.push(text);

    // Add content titles to ebook contentTitles array
    contentTitles.forEach(title => {
      ebook.contentTitles.push({
        title: title.title,
        type: title.type,
        page: title.page + currentPage
      });
    });

    return { status: "success", message: 'OCR and processing successful', ebook };
  } catch (error) {
    throw new Error('Error processing PDF pages', error);
  }
}

module.exports = { performOCR };