const fs = require('fs');
const { createCanvas } = require('canvas');

/**
 * Renders a PDF page to an image buffer.
 * @param {Object} page - The PDF page to render.
 * @returns {Buffer} - The image buffer of the rendered page.
 */
const renderPageToImage = async (page) => {
    // Ensure the page object is valid
    if (!page) {
      throw new Error('Invalid page object.');
    }
  
    // Define the viewport with the desired scale
    const scale = 2.0; // Adjust the scale as needed
    const viewport = page.getViewport({ scale });
  
    // Create a canvas with the dimensions of the viewport
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
  
    // Prepare the render context
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
  
    // Render the page
    await page.render(renderContext).promise;
  
    // Convert the canvas to an image buffer
    return canvas.toBuffer();
  };
  

const pdfToImage = async (pdfFile, currentPage = 0) => {
    try{
        if (!Buffer.isBuffer(pdfFile)) {
            throw new Error('Input is not a valid buffer.');
          }

        let imageBuffers = []
        const uint8Array = new Uint8Array(pdfFile);
        const pdfJsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdf = await pdfJsLib.getDocument({ data: uint8Array }).promise;
        for (let i = 0; i < currentPage + 3; i++) {
            const page = await pdf.getPage(i + 1);
            const imageBuffer = await renderPageToImage(page);
            imageBuffers.push({
                imageBuffer: imageBuffer,
                page: i
            })
            
        }

        console.log("imageBuffers: ", imageBuffers);
        
        return imageBuffers
    }catch(error){
        console.log(error.message);
        console.log(error);
    }
    }
    
    module.exports = { pdfToImage }