const { BlobServiceClient } = require('@azure/storage-blob');

const fetchFileFromBlob = async (fileUrl) => {
  try {
    // Get Azure credentials
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.CONTAINER_NAME;

    if (!connectionString || !containerName) {
      throw new Error('Azure Storage credentials not configured');
    }

    // Create blob client
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Extract blob name from URL
    const blobName = fileUrl.split('/').pop();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Download blob
    const downloadResponse = await blockBlobClient.download(0);
    
    // Convert to buffer
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Return file-like object matching upload format
    return {
      buffer,
      name: blobName,
      mimetype: 'application/pdf',
      originalname: blobName.split('-').slice(1).join('-') // Remove UUID prefix
    };

  } catch (error) {
    console.error('Error fetching PDF from blob:', error);
    throw new Error(`Failed to fetch PDF: ${error.message}`);
  }
};

module.exports = { fetchFileFromBlob };