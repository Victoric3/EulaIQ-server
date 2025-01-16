const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');

const saveFileAndAddLinkToEbook = async (file, ebook) => {
  try {
    // Get connection string from environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.CONTAINER_NAME;

    if (!connectionString || !containerName) {
      throw new Error('Azure Storage credentials not configured');
    }

    // Create BlobServiceClient
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create container if it doesn't exist
    await containerClient.createIfNotExists({
      access: 'blob' // Allow public access to blobs
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

    return blobUrl;

  } catch (error) {
    console.error('Error uploading file to Azure:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

module.exports = { saveFileAndAddLinkToEbook };