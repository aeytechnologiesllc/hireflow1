import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;

export interface CompressionProgress {
  progress: number; // 0-100
  stage: "loading" | "compressing" | "finalizing";
  message: string;
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
}

export class CompressionNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompressionNotSupportedError";
  }
}

// Check if SharedArrayBuffer is available (required for FFmpeg.wasm)
export const isCompressionSupported = (): boolean => {
  return typeof SharedArrayBuffer !== "undefined" && typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
};

const loadFFmpeg = async (onProgress: (progress: CompressionProgress) => void): Promise<FFmpeg> => {
  // Check for SharedArrayBuffer support first
  if (!isCompressionSupported()) {
    throw new CompressionNotSupportedError(
      "Video compression requires cross-origin isolation. Please try recording directly or upload a smaller file."
    );
  }

  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  onProgress({ progress: 5, stage: "loading", message: "Loading compression engine..." });

  // Load FFmpeg with CORS-enabled URLs and timeout
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  
  const loadTimeout = 30000; // 30 second timeout
  
  const loadPromise = ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new CompressionNotSupportedError(
        "Compression engine took too long to load. Please try recording directly or upload a smaller file."
      ));
    }, loadTimeout);
  });

  await Promise.race([loadPromise, timeoutPromise]);

  onProgress({ progress: 15, stage: "loading", message: "Compression engine ready" });

  return ffmpeg;
};

export const compressVideo = async (
  file: File,
  onProgress: (progress: CompressionProgress) => void,
  abortSignal?: AbortSignal
): Promise<CompressionResult> => {
  const originalSize = file.size;

  // Load FFmpeg (with support check and timeout)
  const ff = await loadFFmpeg(onProgress);

  if (abortSignal?.aborted) {
    throw new Error("Compression cancelled");
  }

  // Set up progress handler
  ff.on("progress", ({ progress }) => {
    // Progress goes from 0 to 1
    const percent = Math.min(15 + progress * 80, 95);
    onProgress({
      progress: percent,
      stage: "compressing",
      message: `Compressing video... ${Math.round(percent)}%`,
    });
  });

  onProgress({ progress: 18, stage: "compressing", message: "Reading video file..." });

  // Write input file to FFmpeg filesystem
  const inputName = "input" + getExtension(file.name);
  const outputName = "output.mp4";

  await ff.writeFile(inputName, await fetchFile(file));

  if (abortSignal?.aborted) {
    throw new Error("Compression cancelled");
  }

  onProgress({ progress: 20, stage: "compressing", message: "Starting compression..." });

  // Compress video to 720p H.264 with CRF 28
  // -vf scale=-2:720 = scale to 720p height, width auto-calculated to maintain aspect ratio
  // -c:v libx264 = use H.264 codec
  // -crf 28 = quality level (18-28 is good, 28 = smaller file)
  // -preset fast = encoding speed/quality tradeoff
  // -c:a aac -b:a 128k = AAC audio at 128kbps
  // -movflags +faststart = optimize for web streaming
  await ff.exec([
    "-i", inputName,
    "-vf", "scale=-2:720",
    "-c:v", "libx264",
    "-crf", "28",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    outputName,
  ]);

  if (abortSignal?.aborted) {
    throw new Error("Compression cancelled");
  }

  onProgress({ progress: 95, stage: "finalizing", message: "Finalizing..." });

  // Read compressed file
  const data = await ff.readFile(outputName);
  
  // Validate output exists and has content
  if (!data || (typeof data !== 'string' && (data as Uint8Array).length === 0)) {
    throw new Error("Compression failed: output file is empty or missing");
  }

  // Create blob - ensure we have a proper Uint8Array copy for Blob compatibility
  const uint8Data = typeof data === 'string' 
    ? new TextEncoder().encode(data) 
    : new Uint8Array(data as Uint8Array);
  const blob = new Blob([uint8Data], { type: "video/mp4" });

  // Validate compression produced reasonable result
  const compressionRatio = blob.size / originalSize;
  if (compressionRatio < 0.01) {
    // Less than 1% of original is suspicious - likely corruption
    throw new Error("Compression produced an unusually small file. The output may be corrupted. Please try recording directly.");
  }
  
  if (compressionRatio > 0.95) {
    // More than 95% means compression didn't help much
    console.info(`Low compression achieved: ${(compressionRatio * 100).toFixed(1)}% of original`);
  }

  // Cleanup
  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onProgress({ progress: 100, stage: "finalizing", message: "Compression complete!" });

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
  };
};

const getExtension = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return ".mp4";
  return "." + ext;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export const shouldCompress = (file: File): boolean => {
  // Compress if file is larger than 50MB
  return file.size > 50 * 1024 * 1024;
};
