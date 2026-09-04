const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

// Word resumes are the most common thing people actually have on hand. They
// were refused with "please upload a PDF or image" — a wall, not a rule. The
// backend text extractor (supabase/functions/_shared/resume.ts) reads PDFs and
// plain text and returns null for anything else, so a Word file is stored and
// shown to the employer while Ava's read falls back to the typed answers.
const SUPPORTED_WORD_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const WORD_EXTENSIONS = [".doc", ".docx"];
const SUPPORTED_RESUME_EXTENSIONS = [".pdf", ...IMAGE_EXTENSIONS, ...WORD_EXTENSIONS];

/** `accept` attribute for a resume file input — kept next to the list it mirrors. */
export const RESUME_FILE_ACCEPT = [
  ...SUPPORTED_RESUME_EXTENSIONS,
  "application/pdf",
  ...SUPPORTED_WORD_MIME_TYPES,
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

/** Human-readable list of what a resume upload may be. */
export const RESUME_FORMATS_LABEL = "PDF, Word, or image";

export function isImageMimeType(mimeType: string | null | undefined) {
  return !!mimeType && SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}

export function isWordMimeType(mimeType: string | null | undefined) {
  return !!mimeType && SUPPORTED_WORD_MIME_TYPES.includes(mimeType.toLowerCase());
}

export function isSupportedResumeMimeType(mimeType: string | null | undefined) {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase();
  return normalized === "application/pdf" || isImageMimeType(normalized) || isWordMimeType(normalized);
}

function hasExtension(name: string | null | undefined, extensions: string[]) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

export function isSupportedResumeFile(file: File | null | undefined) {
  if (!file) return false;
  if (isSupportedResumeMimeType(file.type)) return true;
  // Some browsers/OSes report an empty or generic type for .doc/.docx
  // ("application/octet-stream"); trust a known extension in that case.
  return (!file.type || file.type === "application/octet-stream") && hasExtension(file.name, WORD_EXTENSIONS);
}

/** True when the file is a Word document (by type, or by extension when the type is missing). */
export function isWordResumeFile(file: File | null | undefined) {
  if (!file) return false;
  return isWordMimeType(file.type) || hasExtension(file.name, WORD_EXTENSIONS);
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
  return IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

export function isWordResumeUrl(url: string | null | undefined) {
  if (!url) return false;
  const pathname = getPathname(url);
  return WORD_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

export function isSupportedResumeUrl(url: string | null | undefined) {
  if (!url) return false;
  const pathname = getPathname(url);
  const isResumeStoragePath =
    pathname.includes("/resumes/") ||
    (!/^https?:\/\//i.test(url) && !url.startsWith("blob:") && !url.startsWith("data:"));
  return isResumeStoragePath && SUPPORTED_RESUME_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

export function getResumeAssetLabel(url: string | null | undefined) {
  if (isPdfResumeUrl(url)) return "PDF document";
  if (isImageResumeUrl(url)) return "Image file";
  if (isWordResumeUrl(url)) return "Word document";
  return "Uploaded resume";
}
