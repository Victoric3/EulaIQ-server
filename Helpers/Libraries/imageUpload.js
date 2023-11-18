const CustomError = require("../error/CustomError");
const multer = require("multer");
const path = require("path");
const { google } = require('googleapis');
const fs = require('fs');
const credentials = require('./kingsheart-cbt.json');

const auth = new google.auth.GoogleAuth({
  keyFile: path.resolve(__dirname, './kingsheart-cbt.json'),
  scopes: 'https://www.googleapis.com/auth/drive.file',
});

const drive = google.drive({ version: 'v3', auth });

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const rootDir = path.dirname(require.main.filename);

    if (file.fieldname === "image") {
      cb(null, path.join(rootDir, "/public/userPhotos"));
    } else {
      cb(null, path.join(rootDir, "/public/storyImages"));
    }
  },

  filename: function(req, file, cb) {
    if (file.fieldname === "image") {
      const extension = file.mimetype.split("/")[1];
      req.savedUserPhoto = "photo_user_" + req.user.id + "." + extension;
      cb(null, req.savedUserPhoto);
    } else {
      req.savedStoryImage = "image_" + new Date().toISOString().replace(/:/g, '-') + file.originalname;
      cb(null, req.savedStoryImage);
    }
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new CustomError("Please provide a valid image file", 400), null);
  }

  cb(null, true);
};

const imageUpload = multer({ storage, fileFilter }).single('image');

const uploadToDrive = async (file, mimeType, folderId) => {
  const media = {
    mimeType,
    body: fs.createReadStream(file.path),
  };

  const driveResponse = await drive.files.create({
    requestBody: {
      name: file.filename,
      parents: [folderId],
    },
    media,
  });

  const fileLink = `https://drive.google.com/uc?id=${driveResponse.data.id}`;
  return fileLink
  fs.unlinkSync(file.path); // Clean up: Delete the temporarily uploaded file
};

module.exports = { imageUpload, uploadToDrive };
