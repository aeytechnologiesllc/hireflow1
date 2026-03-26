/**
 * Image compression utility for client-side image optimization
 * Uses Canvas API to resize and recompress images
 */

interface CompressionOptions {
  maxSizeMB?: number;
  maxWidth?: number;
  quality?: number;
}

/**
 * Compress an image file to reduce its size
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns A promise that resolves to the compressed file
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const { maxSizeMB = 8, maxWidth = 2560, quality = 0.85 } = options;
  
  // Only compress images
  if (!file.type.startsWith("image/")) {
    return file;
  }
  
  // If file is already small enough, return as-is
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size <= maxSizeBytes) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to blob with compression
      // Use JPEG for best compression (except for PNGs with transparency)
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const finalQuality = outputType === "image/png" ? undefined : quality;
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }
          
          // Generate new filename with correct extension
          const ext = outputType === "image/jpeg" ? "jpg" : "png";
          const baseName = file.name.replace(/\.[^.]+$/, "");
          const newFileName = `${baseName}_compressed.${ext}`;
          
          const compressedFile = new File([blob], newFileName, {
            type: outputType,
            lastModified: Date.now(),
          });
          
          resolve(compressedFile);
        },
        outputType,
        finalQuality
      );
    };

    img.onerror = () => {
      reject(new Error("Failed to load image for compression"));
    };

    // Create object URL and load image
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    
    // Clean up object URL after image loads
    img.onload = function(this: HTMLImageElement) {
      URL.revokeObjectURL(objectUrl);
      
      // Calculate new dimensions maintaining aspect ratio
      let width = this.width;
      let height = this.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw image on canvas
      ctx.drawImage(this, 0, 0, width, height);
      
      // Convert to blob with compression
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const finalQuality = outputType === "image/png" ? undefined : quality;
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }
          
          const ext = outputType === "image/jpeg" ? "jpg" : "png";
          const baseName = file.name.replace(/\.[^.]+$/, "");
          const newFileName = `${baseName}_compressed.${ext}`;
          
          const compressedFile = new File([blob], newFileName, {
            type: outputType,
            lastModified: Date.now(),
          });
          
          resolve(compressedFile);
        },
        outputType,
        finalQuality
      );
    };
  });
}

/**
 * Check if a file needs compression
 */
export function needsCompression(file: File, maxSizeMB: number = 8): boolean {
  return file.type.startsWith("image/") && file.size > maxSizeMB * 1024 * 1024;
}
