const axios = require('axios');
const fs = require('fs-extra');

function extractTextFromOcrResult(ocrResult, currentPage) {
    if (ocrResult.status !== 'succeeded') {
      throw new Error('OCR processing did not succeed.');
    }
  
    const fullText = ocrResult.analyzeResult.readResults
      .map((page) =>
        page.lines.map((line) => line.words.map((word) => word.text).join(' ')).join('\n')
      )
      .join('\n\n');
  
    return {page: currentPage, extractedTexts: fullText};
  }

async function azureOcr(tempFilePath) {
  const endpoint = process.env.OCR_ENDPOINT;
  const subscriptionKey = process.env.OCR_SUBSCRIPTION_KEY;
  console.log("endpoint: ", endpoint);
  console.log("subscriptionKey: ", subscriptionKey);

  try {
    const imageData = await fs.readFile(tempFilePath);

    const response = await axios.post(
      `${endpoint}/vision/v3.2/read/analyze`,
      imageData,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': subscriptionKey,
          'Content-Type': 'application/octet-stream',
        },
      }
    );

    const operationLocation = response.headers['operation-location'];

    // Polling for the result
    let result;
    while (true) {
      const resultResponse = await axios.get(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': subscriptionKey,
        },
      });

      result = resultResponse.data;

      if (result.status === 'succeeded') {
        break;
      } else if (result.status === 'failed') {
        throw new Error('OCR processing failed.');
      }

      // Wait for a short period before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return result;
  } catch (error) {
    console.error('Error during OCR processing:', error);
    throw error;
  }
}

  
  async function processImages(tempFilePaths) {
    try{

      const ocrPromises = tempFilePaths.map((tempFilePath) => azureOcr(tempFilePath));
      
      const ocrResults = await Promise.all(ocrPromises);
      
      const extractedTexts = ocrResults.map((result, index) =>
        extractTextFromOcrResult(result, index)
    );
    console.log("extractedTexts: ", extractedTexts);
    
    return extractedTexts;
  } catch (error) {
    console.error('Error processing images:', error);
    throw error;
  };
  }
  
module.exports = { azureOcr, extractTextFromOcrResult, processImages };