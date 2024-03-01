// uploadMiddleware.js
const { imageUpload } = require("./imageUpload");
const deleteImageFile = require("./deleteImageFile");
const axios = require('axios');
const FormData = require('form-data');
const multer = require("multer");


const handleImageUpload = async (req, res, next) => {
  const apiKey = 'ffd36b269b0ca78afc1308c7bc256530'
  try {
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
const handleImageandFileUpload = async (req, res, next) => {
  const apiKey = process.env.IMAGE_UPLOAD_API_KEY
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });
  try {
    // Upload the image to Google Drive
    upload.fields([{ name: 'csvFile', maxCount: 1 }, { name: 'image', maxCount: 1 }])(req, res, async function (err) {
     
      const imageFile = req.files['image'][0];

      // Check if there is a file in the request
       if (!imageFile) {
        // No file provided, continue to the next middleware
        return next();
      }

      if (err) {
        return next(err);
      }

      // Get the file buffer
      const fileBuffer = imageFile?.buffer;

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

// Function to delete locally uploaded files
const deleteImageFiles = (req) => {
  const imageFiles = req.files['images'];

  if (imageFiles) {
    imageFiles.forEach((file) => {
      deleteImageFile(file.path);
    });
  }
};


const handleMultipleImageUpload = async (req, res, next) => {
  const apiKey = 'ffd36b269b0ca78afc1308c7bc256530';
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  try {
    upload.array('images', 3)(req, res, async function (err) {
      const imageFiles = req.files['images'];

      // Check if there are files in the request
      if (!imageFiles || imageFiles.length === 0) {
        // No files provided, continue to the next middleware
        return next();
      }

      if (err) {
        return next(err);
      }

      // Process each uploaded image
      const imageUrls = await Promise.all(
        imageFiles.map(async (imageFile) => {
          // Get the file buffer
          const fileBuffer = imageFile.buffer;

          // Encode the file buffer as base64
          const base64Image = fileBuffer.toString('base64');

          const form = new FormData();

          form.append('key', apiKey);
          form.append('image', base64Image);

          // Make a POST request to ImgBB API for each image
          const response = await axios.post('https://api.imgbb.com/1/upload', form, {
            headers: {
              ...form.getHeaders(),
            },
          });

          // Extract the URL from the ImgBB API response
          return response.data.data.url;
        })
      );

      // Attach the imageUrls to the request object for later use in the route handler
      req.imageUrls = imageUrls;

      // Continue to the next middleware
      next();
    });
  } catch (error) {
    // Handle errors, delete the locally uploaded files, and pass the error to the next middleware
    deleteImageFiles(req);
    next(error);
  }
};



module.exports = {handleImageUpload, handleImageandFileUpload, handleMultipleImageUpload}
