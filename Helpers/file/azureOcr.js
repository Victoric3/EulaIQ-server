const axios = require('axios');

function extractTextFromOcrResult(ocrResult) {
    if (ocrResult.status !== 'succeeded') {
      throw new Error('OCR processing did not succeed.');
    }
  
    const fullText = ocrResult.analyzeResult.readResults
      .map((page) =>
        page.lines.map((line) => line.words.map((word) => word.text).join(' ')).join('\n')
      )
      .join('\n\n');
  
    return fullText;
  }

async function azureOcr(imageBuffer) {
  const endpoint = process.env.OCR_ENDPOINT; // e.g., 'https://<your-resource-name>.cognitiveservices.azure.com/'
  const subscriptionKey = process.env.OCR_SUBSCRIPTION_KEY;

  // Save buffer to a temporary file
  const tempFilePath = await saveBufferToFile(imageBuffer, 'tempImage.jpg');

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
  } finally {
    // Clean up the temporary file
    await deleteFile(tempFilePath);
  }
}

  
  async function processImages(pageImages, currentPage) {
    const ocrPromises = pageImages
      .slice(currentPage, currentPage + 3)
      .map((image) => advanceOcr(image));
  
    const ocrResults = await Promise.all(ocrPromises);
  
    const extractedTexts = ocrResults.map((result) =>
      extractTextFromOcrResult(result)
    );
  
    return extractedTexts;
  }
  
module.exports = { azureOcr, extractTextFromOcrResult, processImages };