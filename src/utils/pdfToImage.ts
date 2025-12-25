import { pdfjs } from "react-pdf";

// Ensure worker is configured (react-pdf requires this for reliable parsing)
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

/**
 * Converts the first page of a PDF to a base64-encoded PNG image.
 * Used as a fallback when text extraction fails (designed PDFs, scanned documents).
 * @param url - The URL of the PDF file
 * @returns Base64-encoded image data (without data URI prefix) or null if conversion fails
 */
export async function convertPdfToImage(url: string): Promise<string | null> {
  try {
    console.log("[pdfToImage] Starting PDF to image conversion for:", url);
    
    const doc = await pdfjs.getDocument({ url }).promise;
    const page = await doc.getPage(1); // Get first page
    
    // Scale for good quality while keeping reasonable size
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // Create canvas
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    
    if (!context) {
      console.error("[pdfToImage] Failed to get canvas context");
      return null;
    }
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    }).promise;
    
    // Convert to base64 PNG (without the data URI prefix)
    const dataUrl = canvas.toDataURL("image/png");
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    
    console.log("[pdfToImage] Successfully converted PDF to image, size:", base64Data.length);
    
    return base64Data;
  } catch (error) {
    console.error("[pdfToImage] Failed to convert PDF to image:", error);
    return null;
  }
}

/**
 * Converts multiple pages of a PDF to base64-encoded PNG images.
 * @param url - The URL of the PDF file
 * @param maxPages - Maximum number of pages to convert (default: 3)
 * @returns Array of base64-encoded image data
 */
export async function convertPdfPagesToImages(
  url: string, 
  maxPages: number = 3
): Promise<string[]> {
  try {
    console.log("[pdfToImage] Converting multiple pages for:", url);
    
    const doc = await pdfjs.getDocument({ url }).promise;
    const numPages = Math.min(doc.numPages, maxPages);
    const images: string[] = [];
    
    const scale = 1.5; // Slightly lower scale for multiple pages
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      
      if (!context) continue;
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport,
        canvas,
      }).promise;
      
      const dataUrl = canvas.toDataURL("image/png");
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      images.push(base64Data);
    }
    
    console.log("[pdfToImage] Converted", images.length, "pages to images");
    return images;
  } catch (error) {
    console.error("[pdfToImage] Failed to convert PDF pages:", error);
    return [];
  }
}
