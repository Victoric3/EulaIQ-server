// uploadMiddleware.js
const { imageUpload, uploadToDrive } = require("./imageUpload");
const deleteImageFile = require("./deleteImageFile");

const handleImageUpload = async (req, res, next) => {
  try {
    // Assuming you have a specific folder ID in Google Drive where you want to upload the file
    const folderUrl = 'https://drive.google.com/drive/folders/17roP7M-JNww2tAmTFInda9rUnCBhOQm_?usp=sharing'
    const folderId = folderUrl.match(/[-\w]{25,}/);

    // Check if a valid folder ID is obtained
    if (!folderId) {
      return next(new Error('Invalid folder URL'));
    }

    // Check if there is a file in the request
    if (!req.file) {
      // No file provided, continue to the next middleware
      return next();
    }

    // Upload the image to Google Drive
    await imageUpload(req, res, async function (err) {
      if (err) {
        return next(err);
      }

      // Specify the mimeType based on your file type
      const mimeType = 'image/jpeg';

      // Upload the image to Google Drive using the uploadToDrive function
      const fileLink = await uploadToDrive(req.file, mimeType, folderId[0]);
      // Attach the fileLink to the request object for later use in the route handler
      req.fileLink = fileLink;

      // Delete the locally uploaded file
      deleteImageFile(req);

      // Continue to the next middleware
      next();
    });
  } catch (error) {
    // Handle errors, delete the locally uploaded file, and pass the error to the next middleware
    deleteImageFile(req);
    next(error);
  }
};

module.exports = handleImageUpload;
