const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;

export function isHtmlContent(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToPlainText(value: string): string {
  if (!value) {
    return "";
  }

  if (!isHtmlContent(value)) {
    return value;
  }

  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/(li|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r\n/g, "\n"),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeTextBlock(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? htmlToPlainText(item).trim() : ""))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "string") {
    return htmlToPlainText(value);
  }

  return "";
}

export function normalizeCommaSeparatedText(value: unknown): string {
  const source = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? htmlToPlainText(item).trim() : "")).filter(Boolean).join(", ")
    : typeof value === "string"
      ? htmlToPlainText(value)
      : "";

  return source
    .replace(/\n+/g, ", ")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function ensureBulletLines(value: string): string {
  const normalized = normalizeTextBlock(value)
    .replace(/\s*•\s*/g, "\n• ")
    .replace(/(?:^|\n)\s*[-*]\s+/g, "\n• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("• ") ? line : `• ${line.replace(/^[•*-]\s*/, "")}`))
    .join("\n");
}

function splitIntoSentences(value: string): string[] {
  return (value.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [])
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function ensureParagraphs(value: string): string {
  const normalized = normalizeTextBlock(value).trim();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("\n\n")) {
    return normalized.replace(/\n{3,}/g, "\n\n");
  }

  if (normalized.includes("\n")) {
    return normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  if (normalized.length < 260) {
    return normalized;
  }

  const sentences = splitIntoSentences(normalized);
  if (sentences.length < 4) {
    return normalized;
  }

  const targetParagraphs = sentences.length >= 7 ? 3 : 2;
  const paragraphs: string[] = [];
  let cursor = 0;

  for (let index = 0; index < targetParagraphs && cursor < sentences.length; index += 1) {
    const remainingSentences = sentences.length - cursor;
    const remainingParagraphs = targetParagraphs - index;
    const takeCount = Math.max(2, Math.ceil(remainingSentences / remainingParagraphs));
    paragraphs.push(sentences.slice(cursor, cursor + takeCount).join(" "));
    cursor += takeCount;
  }

  if (cursor < sentences.length) {
    const tail = sentences.slice(cursor).join(" ");
    paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${tail}`.trim();
  }

  return paragraphs.join("\n\n");
}

export function normalizeGeneratedDraftText(
  field: "description" | "responsibilities" | "requirements" | "skills_required" | "benefits",
  value: unknown,
): string {
  if (field === "description") {
    return ensureParagraphs(String(value || ""));
  }

  if (field === "responsibilities" || field === "requirements") {
    return ensureBulletLines(String(value || ""));
  }

  if (field === "skills_required" || field === "benefits") {
    return normalizeCommaSeparatedText(value);
  }

  return normalizeTextBlock(value);
}

export function plainTextToEditorHtml(value: string): string {
  if (!value) {
    return "";
  }

  if (isHtmlContent(value)) {
    return value;
  }

  const normalized = normalizeTextBlock(value)
    .replace(/\s*•\s*/g, "\n• ")
    .replace(/(?:^|\n)\s*[-*]\s+/g, "\n• ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length > 0 && lines.every((line) => line.startsWith("• "))) {
        return `<ul>${lines
          .map((line) => `<li>${escapeHtml(line.slice(2).trim())}</li>`)
          .join("")}</ul>`;
      }

      return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
    })
    .join("");
}
