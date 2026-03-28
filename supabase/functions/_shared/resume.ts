import { extractText } from "https://esm.sh/unpdf@0.12.1";

export const RESUME_KEYWORDS = ["resume", "cv", "curriculum vitae", "curriculum", "résumé"];

export interface ResumeVisualInput {
  base64: string;
  mimeType: string;
  page?: number;
  source: string;
  url?: string;
}

export function isFileLikeUrl(url: string) {
  if (!url || typeof url !== "string") return false;
  const lowerUrl = url.toLowerCase();
  return ["/storage/v1/object/", "/resumes/", "/documents/", ".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".gif"].some((pattern) =>
    lowerUrl.includes(pattern),
  );
}

export function isResumeQuestion(questionText: string) {
  if (!questionText || typeof questionText !== "string") return false;
  const lowerQuestion = questionText.toLowerCase();
  return RESUME_KEYWORDS.some((keyword) => lowerQuestion.includes(keyword));
}

export function isImageLikeUrl(url: string | null | undefined) {
  if (!url) return false;
  return /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(url);
}

export function isPdfLikeUrl(url: string | null | undefined) {
  if (!url) return false;
  return /\.pdf(?:$|\?)/i.test(url);
}

export function detectResumeUrl(
  resumeUrlField: string | null | undefined,
  parsedNotes: Record<string, any> | null | undefined,
): string | null {
  if (resumeUrlField && typeof resumeUrlField === "string" && resumeUrlField.trim()) {
    return resumeUrlField.trim();
  }

  const answers = parsedNotes?.applicationAnswers;
  if (!answers || !Array.isArray(answers)) {
    return null;
  }

  for (const answer of answers) {
    if (isFileLikeUrl(answer.answer) && isResumeQuestion(answer.question)) {
      return answer.answer;
    }
  }

  return null;
}

export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)/);
  if (!match) return null;
  return { bucket: match[1], path: decodeURIComponent(match[2]) };
}

async function fetchWithSignedFallback(url: string, adminClient?: any): Promise<Response | null> {
  const directResponse = await fetch(url);
  if (directResponse.ok) {
    return directResponse;
  }

  if (!adminClient) {
    return null;
  }

  const storageInfo = parseStorageUrl(url);
  if (!storageInfo) {
    return null;
  }

  const { data: signedData, error } = await adminClient.storage
    .from(storageInfo.bucket)
    .createSignedUrl(storageInfo.path, 120);

  if (error || !signedData?.signedUrl) {
    return null;
  }

  const signedResponse = await fetch(signedData.signedUrl);
  if (!signedResponse.ok) {
    return null;
  }

  return signedResponse;
}

function decodeText(arrayBuffer: ArrayBuffer) {
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(arrayBuffer));
}

function cleanExtractedText(text: string) {
  return text.replace(/\u0000/g, "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function fetchResumeText(resumeUrl: string, adminClient?: any): Promise<string | null> {
  try {
    const response = await fetchWithSignedFallback(resumeUrl, adminClient);
    if (!response) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const arrayBuffer = await response.arrayBuffer();

    if (contentType.includes("pdf") || isPdfLikeUrl(resumeUrl)) {
      try {
        const { text } = await extractText(new Uint8Array(arrayBuffer));
        const normalized = cleanExtractedText(Array.isArray(text) ? text.join("\n") : String(text));
        return normalized.length > 60 ? normalized.slice(0, 14000) : null;
      } catch (pdfError) {
        console.warn("[resume] unpdf extraction failed, attempting fallback text parse", pdfError);
        const rawText = decodeText(arrayBuffer);
        const fallbackMatches = rawText.match(/\(([^)]+)\)/g);
        if (!fallbackMatches || fallbackMatches.length < 10) {
          return null;
        }
        const fallbackText = cleanExtractedText(
          fallbackMatches
            .map((match) => match.slice(1, -1))
            .filter((chunk) => chunk.length > 2 && !/^[\d\s.]+$/.test(chunk))
            .join(" "),
        );
        return fallbackText.length > 100 ? fallbackText.slice(0, 10000) : null;
      }
    }

    if (contentType.startsWith("text/")) {
      const text = cleanExtractedText(decodeText(arrayBuffer));
      return text.length > 60 ? text.slice(0, 10000) : null;
    }

    return null;
  } catch (error) {
    console.error("[resume] Failed to fetch resume text", error);
    return null;
  }
}

async function fetchVisualInputFromUrl(
  url: string,
  source: string,
  adminClient?: any,
  page?: number,
): Promise<ResumeVisualInput | null> {
  try {
    const response = await fetchWithSignedFallback(url, adminClient);
    if (!response) {
      return null;
    }

    const contentType = response.headers.get("content-type") || (isImageLikeUrl(url) ? "image/png" : "");
    if (!contentType.includes("image")) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return {
      base64: btoa(binary),
      mimeType: contentType,
      page,
      source,
      url,
    };
  } catch (error) {
    console.error("[resume] Failed to fetch resume visual input", { url, source, error });
    return null;
  }
}

export async function fetchResumeVisualInputs(params: {
  resumeUrl?: string | null;
  parsedNotes?: Record<string, any> | null;
  adminClient?: any;
  maxImages?: number;
}): Promise<ResumeVisualInput[]> {
  const { resumeUrl, parsedNotes, adminClient, maxImages = 3 } = params;
  const imageUrls = new Set<string>();
  const orderedUrls: Array<{ url: string; source: string; page?: number }> = [];

  const pushUrl = (url: string | null | undefined, source: string, page?: number) => {
    if (!url || imageUrls.has(url)) return;
    imageUrls.add(url);
    orderedUrls.push({ url, source, page });
  };

  if (Array.isArray(parsedNotes?.resumeImageUrls)) {
    parsedNotes.resumeImageUrls.slice(0, maxImages).forEach((url: string, index: number) => {
      pushUrl(url, "converted_resume_page", index + 1);
    });
  }

  if (parsedNotes?.fileUploads && typeof parsedNotes.fileUploads === "object") {
    const answers = Array.isArray(parsedNotes.applicationAnswers) ? parsedNotes.applicationAnswers : [];
    for (const [questionId, upload] of Object.entries(parsedNotes.fileUploads)) {
      const matchingAnswer = answers.find((answer: any) => answer.questionId === questionId || answer.id === questionId);
      const questionText = matchingAnswer?.question || "";
      if (!isResumeQuestion(questionText)) continue;

      const imageList = Array.isArray((upload as any)?.imageUrls) ? (upload as any).imageUrls : [];
      imageList.slice(0, maxImages).forEach((url: string, index: number) => {
        pushUrl(url, "resume_question_upload", index + 1);
      });
    }
  }

  if (resumeUrl && isImageLikeUrl(resumeUrl)) {
    pushUrl(resumeUrl, "direct_resume_image", 1);
  }

  const visuals: ResumeVisualInput[] = [];
  for (const item of orderedUrls.slice(0, maxImages)) {
    const visual = await fetchVisualInputFromUrl(item.url, item.source, adminClient, item.page);
    if (visual) {
      visuals.push(visual);
    }
  }

  return visuals;
}
