const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

const SUPPORTED_RESUME_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"];

export function isImageMimeType(mimeType: string | null | undefined) {
  return !!mimeType && SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}

export function isSupportedResumeMimeType(mimeType: string | null | undefined) {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase();
  return normalized === "application/pdf" || isImageMimeType(normalized);
}

export function isSupportedResumeFile(file: File | null | undefined) {
  if (!file) return false;
  return isSupportedResumeMimeType(file.type);
}

function getPathname(value: string) {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return value.toLowerCase().split("?")[0];
  }
}

export function isPdfResumeUrl(url: string | null | undefined) {
  if (!url) return false;
  return getPathname(url).endsWith(".pdf");
}

export function isImageResumeUrl(url: string | null | undefined) {
  if (!url) return false;
  const pathname = getPathname(url);
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((extension) => pathname.endsWith(extension));
}

export function isSupportedResumeUrl(url: string | null | undefined) {
  if (!url) return false;
  const pathname = getPathname(url);
  return pathname.includes("/resumes/") && SUPPORTED_RESUME_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

export function getResumeAssetLabel(url: string | null | undefined) {
  if (isPdfResumeUrl(url)) return "PDF document";
  if (isImageResumeUrl(url)) return "Image file";
  return "Uploaded resume";
}
