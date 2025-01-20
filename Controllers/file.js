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
const { retry } = require("../Helpers/file/retryFunc");
// const { remove } = require("../Models/comment");

const handleTextExtraction = async (file, ebookId = null, currentPage = 0, ebook = null) => {
  try {
    const fileExtension = path.extname(file.originalname).toLowerCase();

    // If ebookId is null, create ebook using story model, and set ebookId to the id of the created ebook
    if (!ebookId) {
      // Assuming createEbook is a function that creates an ebook and returns its id
      ebookId = await createEbook(file);
    }

    // If ebook is null, get ebook, save file and add link to ebook
    if (!ebook) {
      ebook = await getEbookById(ebookId);
      await saveFileAndAddLinkToEbook(file, ebook);
    }

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

    if (!ebookId) {
      throw new Error(`Failed to extract content from file: ${file.originalname}`);
    }

    return response;
  } catch (error) {
    console.error(`Error handling text extraction for file ${file.originalname}:`, error);
    throw new Error(`Error handling text extraction for file ${file.originalname}: ${error.message || error}`);
  }
};

// const handleTextProcessing = async (file, ebookId = null) => {

//   // -----------------currently for ReferenceError will be removed later----------------
//   //confirm pdf file name with out extension is the same as the ebook name, if not or if there's no pdf fetch the pdf from azure blob
//   // if (ebook && ebook.fileUrl !== pdfFile.name.split(".")[0]) {
//     //   pdfFile = await fetchFileFromBlob(ebook.fileUrl);
//     // }
//     // -----------------currently for ReferenceError will be removed later----------------

//     try {
//     console.log("Started extracting file text");

//     if (file) {
//       ebookId = await retry(() => handleTextExtraction(file, ebookId), 3, res);
//     }

//     return {
//       ebookId,
//     };
//   } catch (error) {
//     console.error("Error during text processing:", error);

//     if (res && res.io) {
//       res.io.emit("text-processing-error", {
//         message: "Error during text processing",
//         error: error.message,
//       });
//     }

//     throw error;
//   }
// };

const handlegenerateEbook = async (req, res) => {
  try {
    const file = req.file;
    const ebookId = await createEbook(req, file);
    console.log("ebookId", ebookId);
    const ebook = await getEbookById(ebookId);
    let response;
    Promise.all([
      response = await handleTextExtraction(file, ebookId, 0, ebook),
      await saveFileAndAddLinkToEbook(file, ebook),
    ]);
    console.log("response", response);
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


      //for refrence, incase i need to describe at some other point in the code
      // const query = describe(firstTextChunk, module, moduleDescription, type);
  
      // const extractedDescription = await retry(
      //   async () => {
      //     const description = await azureOpenai(
      //       query,
      //       `you are an ${type} resource describer, return a text describing the ${type} collection to serve as an introduction to it, use very simple language`,
      //       "gpt-4o"
      //     );
      //     return extractAndParseJSON(description);
      //   },
      //   3,
      //   res
      // );