const { PDFDocument } = require("pdf-lib");
const { createCanvas } = require("canvas");

const renderPageToImage = async (page) => {
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");
  
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
  
    await page.render(renderContext).promise;
    const imageBuffer = canvas.toBuffer();
    
    return imageBuffer;
  };
const pdfToImage = async (pdfFile) => {
    try{
        let imageBuffers = []
        const uint8Array = new Uint8Array(pdfFile);
        const pdfDoc = await PDFDocument.load(uint8Array);
        const pdfJsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdf = await pdfJsLib.getDocument({ data: uint8Array }).promise;
        const pages = pdfDoc.getPages();

        for (let i = 0; i < pages.length; i++) {
            const page = await pdf.getPage(i + 1);
            const imageBuffer = await renderPageToImage(page);
            imageBuffers.push({
                imageBuffer: imageBuffer,
                page: i
            })
            
        }
        
        return imageBuffers
    }catch(error){
        console.log(error.message);
    }
    }
    
    module.exports = { pdfToImage }