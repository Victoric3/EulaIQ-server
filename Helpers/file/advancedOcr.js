const { ImageAnalysisClient } = require("@azure-rest/ai-vision-image-analysis");
const createClient = require("@azure-rest/ai-vision-image-analysis").default;
const { AzureKeyCredential } = require("@azure/core-auth");
const axios = require("axios");
const FormData = require("form-data");
const OpenAI = require("openai");

require("dotenv").config();

const endpoint = process.env.OCR_ENDPOINT;
const key = process.env.OCR_SUBSCRIPTION_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const blobStorageConnection = process.env.BLOB_STORAGE_CONNECTION;

const openai = new OpenAI({
  apiKey: openaiApiKey
});

const credential = new AzureKeyCredential(key);
const client = createClient(endpoint, credential);

const features = ["Read"];

// Function to upload image to blob storage
async function uploadToBlob(imageBuffer, filename) {
  const { BlobServiceClient } = require("@azure/storage-blob");
  const blobServiceClient = BlobServiceClient.fromConnectionString(blobStorageConnection);
  const containerClient = blobServiceClient.getContainerClient("resource-images");
  
  const blobName = `${Date.now()}-${filename}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  await blockBlobClient.upload(imageBuffer, imageBuffer.length);
  return blockBlobClient.url;
}

// Function to detect and process images within the content
async function processContentImages(imageBuffer) {
  try {
    // Use Azure Computer Vision to detect images within the content
    const visionResult = await client.path("/imageanalysis:analyze").post({
      body: imageBuffer,
      queryParameters: {
        features: ["Objects", "Tags"],
      },
      contentType: "application/octet-stream",
    });

    const detectedObjects = visionResult.body.objects || [];
    const images = [];

    // Process each detected image region
    for (const obj of detectedObjects) {
      if (obj.confidence > 0.7) {  // Only process high-confidence detections
        const { x, y, w, h } = obj.rectangle;
        
        // Crop the image buffer to the detected region
        // Note: You'll need to implement actual image cropping logic here
        const croppedBuffer = await cropImage(imageBuffer, x, y, w, h);
        
        // Upload cropped image to blob storage
        const imageUrl = await uploadToBlob(croppedBuffer, `image-${Date.now()}`);
        
        images.push({
          url: imageUrl,
          position: { x, y, w, h },
          tag: obj.tags?.[0] || "image"
        });
      }
    }

    return images;
  } catch (error) {
    console.error("Error processing content images:", error);
    throw error;
  }
}

async function generateRichText(ocrResult, images) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: `You are an expert in converting OCR text and images into well-structured rich text. 
          Follow these rules:
          1. Maintain the exact structure and hierarchy of the original material
          2. Use proper HTML5 semantic elements and unique IDs for chapters and sections
          3. Preserve the exact position of images, diagrams, and tables
          4. Convert diagrams and tables to responsive HTML/CSS
          5. Add appropriate styling and emphasis
          6. Ensure sections are properly nested under their respective chapters
          7. Group contextually related content within the same section`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Convert this OCR result into rich text while maintaining structure and formatting:"
            },
            {
              type: "text",
              text: JSON.stringify(ocrResult)
            },
            {
              type: "text",
              text: "These images were detected and should be inserted at their original positions:"
            },
            {
              type: "text",
              text: JSON.stringify(images)
            }
          ]
        }
      ],
      max_tokens: 4096
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Error generating rich text:", error);
    throw error;
  }
}

const performOCR = async (imageBuffer, res) => {
  try {
    // 1. Run native OCR with Azure
    const result = await client.path("/imageanalysis:analyze").post({
      body: imageBuffer,
      queryParameters: {
        features: features,
      },
      contentType: "application/octet-stream",
    });

    const ocrResult = result.body;

    // 2. Process and extract images from the content
    const contentImages = await processContentImages(imageBuffer);

    // 3. Generate rich text with GPT-4V
    const richText = await generateRichText(ocrResult, contentImages);

    // 4. Post-process the rich text to ensure proper structure
    const processedRichText = postProcessRichText(richText);

    return {
      richText: processedRichText,
      images: contentImages
    };

  } catch (error) {
    console.error("Error in OCR processing:", error);
    if (res) {
      res.status(500).json({
        error: error.message
      });
    }
    throw error;
  }
};

// Helper function to post-process and validate rich text structure
function postProcessRichText(richText) {
  // Add any necessary post-processing logic here
  // For example:
  // - Validate HTML structure
  // - Ensure all sections have proper IDs
  // - Check image placements
  // - Validate responsive tables and diagrams
  return richText;
}

// Helper function to crop image buffer (implement based on your image processing library)
async function cropImage(imageBuffer, x, y, w, h) {
  // Implement image cropping logic here
  // You might want to use libraries like Sharp or Jimp
  return imageBuffer; // Placeholder return
}

module.exports = { performOCR };