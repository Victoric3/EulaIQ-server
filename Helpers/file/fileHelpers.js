const fs = require('fs-extra');
const path = require('path');

async function saveBufferToFile(buffer, filename) {
  const filePath = path.join(__dirname, filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
    }
  }
  

module.exports = { saveBufferToFile, deleteFile };