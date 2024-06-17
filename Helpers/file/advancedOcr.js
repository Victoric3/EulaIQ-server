const { ImageAnalysisClient } = require("@azure-rest/ai-vision-image-analysis");
const createClient = require("@azure-rest/ai-vision-image-analysis").default;
const { AzureKeyCredential } = require("@azure/core-auth");

// Load the .env file if it exists
require("dotenv").config();

const endpoint = process.env.OCR_ENDPOINT;
const key = process.env.OCR_SUBSCRIPTION_KEY;

const credential = new AzureKeyCredential(key);
const client = createClient(endpoint, credential);

const features = ["Read"];

const performOCR = async (imageBuffer) => {
  try {
    const result = await client.path("/imageanalysis:analyze").post({
      body: imageBuffer,
      queryParameters: {
        features: features,
      },
      contentType: "application/octet-stream",
    });

    const ocrResult = result.body;
    return ocrResult;
  } catch (error) {
    res.status(500).json({
      error: error,
    });
  }
};

module.exports = { performOCR };
