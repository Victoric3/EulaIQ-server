const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require("path");

const saveFileAndAddLinkToEbook = async (file, ebook) => {
  try {
    // Get connection string from environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.CONTAINER_FILE_NAME;

    if (!connectionString || !containerName) {
      throw new Error('Azure Storage credentials not configured properly');
    }

    // Create BlobServiceClient using the connection string
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Create container if it doesn't exist
    await containerClient.createIfNotExists({
      access: 'blob'
    });

    // Generate unique blob name
    const blobName = `${uuidv4()}-${file.originalname}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload file
    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: file.mimetype
      }
    };

    await blockBlobClient.uploadData(file.buffer, uploadOptions);

    // Get blob URL
    const blobUrl = blockBlobClient.url;

    // Update ebook with file link
    ebook.fileUrl = blobUrl;
    await ebook.save();

    return {status: "success", blobUrl, message: "successfully uploaded ebook"};
  } catch (error) {
    console.error('Error uploading file to Azure:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

const uploadImagesToAzure = async (tempFilePaths) => {
  try {
    // Get connection string from environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerImageName = process.env.CONTAINER_IMAGE_NAME;

    if (!connectionString || !containerImageName) {
      throw new Error('Azure Storage credentials not configured properly');
    }

    // Create BlobServiceClient using the connection string
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // Get container client for images
    const containerClient = blobServiceClient.getContainerClient(containerImageName);

    // Create container if it doesn't exist
    await containerClient.createIfNotExists({
      access: 'blob'
    });

    // Upload image files
    const imageUrls = [];
    for (const tempFilePath of tempFilePaths) {
      const imageBuffer = fs.readFileSync(tempFilePath);
      const blobImageName = `${uuidv4()}-${path.basename(tempFilePath)}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobImageName);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: 'image/png'
        }
      };
      await blockBlobClient.uploadData(imageBuffer, uploadOptions);

      // Get blob URL for the image
      const blobImageUrl = blockBlobClient.url;
      imageUrls.push(blobImageUrl);
    }

    return { status: "success", imageUrls, message: "successfully uploaded images" };
  } catch (error) {
    console.error('Error uploading images to Azure:', error);
    throw new Error(`Failed to upload images: ${error.message}`);
  }
};

module.exports = { saveFileAndAddLinkToEbook, uploadImagesToAzure };
