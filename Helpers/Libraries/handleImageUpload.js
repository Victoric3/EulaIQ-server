// uploadMiddleware.js
const { imageUpload } = require("./imageUpload");
const deleteImageFile = require("./deleteImageFile");
const axios = require('axios');
const FormData = require('form-data');

const handleImageUpload = async (req, res, next) => {
  const apiKey = 'ffd36b269b0ca78afc1308c7bc256530'
  try {
    // Assuming you have a specific folder ID in Google Drive where you want to upload the file
    // const folderUrl = 'https://drive.google.com/drive/folders/17roP7M-JNww2tAmTFInda9rUnCBhOQm_?usp=sharing'
    // const folderId = folderUrl.match(/[-\w]{25,}/);

    // // Check if a valid folder ID is obtained
    // if (!folderId) {
    //   return next(new Error('Invalid folder URL'));
    // }

    
    
    // Upload the image to Google Drive
    imageUpload(req, res, async function (err) {

       // Check if there is a file in the request
       if (!req.file) {
        // No file provided, continue to the next middleware
        return next();
      }

      if (err) {
        return next(err);
      }

      // Get the file buffer
      const fileBuffer = req.file.buffer;

      // Encode the file buffer as base64
      const base64Image = fileBuffer?.toString('base64');

      const form = new FormData();

      form.append('key', apiKey);
      form.append('image', base64Image);
      // Make a POST request to ImgBB API
      const response = await axios.post('https://api.imgbb.com/1/upload', form, {
        headers: { 
          ...form.getHeaders() 
        }
      });

    // Extract the URL from the ImgBB API response
    const imageUrl = response.data.data.url;


      
      // Attach the fileLink to the request object for later use in the route handler
      req.fileLink = imageUrl;
      
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
