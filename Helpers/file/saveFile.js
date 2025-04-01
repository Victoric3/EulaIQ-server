const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const axios = require('axios');
const { basename } = require('path');

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

const getBlobName = (fileUrl) => {
  const urlObj = new URL(fileUrl);
  return decodeURIComponent(basename(urlObj.pathname)); // Extracts only the file name
};


const accountName = process.env.ACCOUNT_NAME;
const accountKey = process.env.ACCOUNT_KEY;
const containerName = process.env.CONTAINER_FILE_NAME;

// Create SAS token function
const generateSasToken = async (blobName) => {
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  // Generate SAS token (valid for 1 hour)
  const expiryDate = new Date();
  expiryDate.setHours(expiryDate.getHours() + 1);

  const sasToken = await blobClient.generateSasUrl({
    permissions: "r", // Read access
    expiresOn: expiryDate,
  });

  console.log("sasToken: ", sasToken)

  return sasToken.split("?")[1]; // Return only the SAS query string
};


const fetchSavedFile = async (fileUrl) => {
  try {

    console.log("fileUrl: ", fileUrl);
    const blobName = getBlobName(fileUrl); // Extract blob name from URL

    const sasToken = await generateSasToken(blobName); // Get a new SAS token

    console.log("sasToken: ", sasToken);
    console.log("blobName: ", blobName);
    
    
    // Append SAS token to the URL
    const sasUrl = `${fileUrl}?${sasToken}`;
    console.log("sasUrl: ", sasUrl);

    // Make a GET request to the blob URL with SAS token
    const response = await axios.get(sasUrl, { responseType: "arraybuffer" });

    // Retrieve relevant headers and file data
    const contentType = response.headers["content-type"];
    const contentLength = response.headers["content-length"];

    // Extract original file name from blob name
    const dashIndex = blobName.indexOf("-");
    const originalName = dashIndex !== -1 ? blobName.slice(dashIndex + 1) : blobName;

    return {
      status: "success",
      file: {
        buffer: response.data,
        contentType,
        contentLength,
        originalname: originalName,
      },
      message: "File retrieved successfully",
    };
  } catch (error) {
    console.error("Error fetching file from Azure:", error);
    throw new Error(`Failed to fetch file: ${error.message}`);
  }
};

const deleteFileFromAzure = async (fileUrl) => {
  try {
    if (!fileUrl) {
      return { status: "warning", message: "No file URL provided" };
    }

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

    // Get blob name from URL
    const blobName = getBlobName(fileUrl);

    // Get blob client and delete the blob
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.delete();

    return { status: "success", message: "File deleted successfully from Azure" };
  } catch (error) {
    console.error('Error deleting file from Azure:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

module.exports = { 
  saveFileAndAddLinkToEbook, 
  uploadImagesToAzure, 
  fetchSavedFile,
  deleteFileFromAzure
};

// const fetchSavedFile = async (fileUrl) => {
//   try {
//     console.log("fileUrl: ", fileUrl);
//     // Make a GET request to the blob URL
//     const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });

//     // Retrieve relevant headers and file data
//     const contentType = response.headers['content-type'];
//     const contentLength = response.headers['content-length'];

//     // Decode the URL and extract the blob name
//     const urlObj = new URL(fileUrl);
//     const blobName = basename(urlObj.pathname); // e.g., "49bed3f5-1db7-400a-b7b2-fd5f13fad83f-COS 304-Summary b.pdf"
    
//     // Assuming the blob name is in the format "uuid-originalFileName",
//     // find the first dash and extract the original file name.
//     const dashIndex = blobName.indexOf('-');
//     const originalName = dashIndex !== -1 ? blobName.slice(dashIndex + 1) : blobName;

//     return {
//       status: "success",
//       file: {
//         buffer: response.data,
//         contentType,
//         contentLength,
//         originalname: originalName,
//       },
//       message: "File retrieved successfully"
//     };
//   } catch (error) {
//     console.error('Error fetching file from Azure:', error);
//     throw new Error(`Failed to fetch file: ${error.message}`);
//   }
// };



// const path = require('path');
// const axios = require('axios');
// const {
// BlobServiceClient,
// generateBlobSASQueryParameters,
// BlobSASPermissions
// } = require('@azure/storage-blob');

// const fetchSavedFile = async (fileUrl) => {
// try {
// const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
// if (!connectionString) {
// throw new Error('Azure Storage connection string not found in environment');
// }


// console.log("fileUrl: ", fileUrl);  

// // 1) Parse container name and blob name from the URL  
// const urlObj = new URL(fileUrl);  
// // urlObj.pathname is typically "/containerName/blobName"  
// // so the first segment after '/' is the containerName,   
// // and the rest is the blobName (there could be subfolders in the blob name).  
// const pathSegments = urlObj.pathname.split('/');  
// // The first element of pathSegments is "" (empty), so skip that.  
// const containerName = pathSegments[1];  
// const blobName = pathSegments.slice(2).join('/');  

// // 2) Create a BlobServiceClient from the connection string  
// const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);  
// const containerClient = blobServiceClient.getContainerClient(containerName);  
// const blobClient = containerClient.getBlobClient(blobName);  

// // 3) Generate SAS token for read permission (valid for 1 hour here)  
// const expiryDate = new Date();  
// expiryDate.setHours(expiryDate.getHours() + 1);  // adjust as needed  

// const sasToken = generateBlobSASQueryParameters(  
//   {  
//     containerName,  
//     blobName,  
//     expiresOn: expiryDate,  
//     permissions: BlobSASPermissions.parse("r"), // read  
//   },  
//   blobServiceClient.credential  
// ).toString();  

// // Combine the base URL with the SAS token  
// const sasUrl = `${blobClient.url}?${sasToken}`;  

// // 4) Fetch the file content with axios (arraybuffer for binary content)  
// const response = await axios.get(sasUrl, { responseType: 'arraybuffer' });  

// // Retrieve relevant headers and file data  
// const contentType = response.headers['content-type'];  
// const contentLength = response.headers['content-length'];  

// // Reconstruct an original name from the blob name if needed  
// // (Your original logic to strip off the UUID prefix, etc.)  
// const baseName = path.basename(blobName);  
// const dashIndex = baseName.indexOf('-');  
// const originalName = dashIndex !== -1 ? baseName.slice(dashIndex + 1) : baseName;  

// return {  
//   status: "success",  
//   file: {  
//     buffer: response.data,  
//     contentType,  
//     contentLength,  
//     originalname: originalName  
//   },  
//   message: "File retrieved successfully"  
// };  
// } catch (error) {
// console.error('Error fetching file from Azure:', error);
// throw new Error(Failed to fetch file: ${error.message});
// }
// };