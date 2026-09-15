import React from "react";
import DOMPurify, { type Config } from "dompurify";

/**
 * Detects if a string contains HTML tags (from TipTap WYSIWYG editor).
 */
function isHTML(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * Allow-list config for TipTap-authored job/company/message content. A
 * coworker who opens /jobs/edit/:id renders whatever HTML is stored for a
 * job, so this has to be safe against a malicious editor, not just a
 * malicious viewer — no script/style/iframe/object/form, no event handlers,
 * no javascript:/data: URLs. Keeps every element TipTap's default toolbar
 * can produce.
 */
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4",
    "blockquote", "a", "code", "pre", "hr", "span",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  ADD_ATTR: ["target", "rel"],
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Sanitizes TipTap HTML for display: strips scripts/styles/forms/iframes and
 * any on* handler or javascript:/data: URL, keeps normal rich-text
 * formatting, and forces every surviving link to open safely.
 */
function sanitizeJobHtml(html: string): string {
  const clean = String(DOMPurify.sanitize(html, SANITIZE_CONFIG));
  const container = document.createElement("div");
  container.innerHTML = clean;
  container.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  return container.innerHTML;
}

/**
 * Parses inline markdown (bold, italic) within a single text segment.
 * Converts **bold** → <strong> and _italic_ → <em>.
 * Legacy fallback for old markdown content.
 */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(_(.+?)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      nodes.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[4]) {
      nodes.push(<em key={`i-${match.index}`}>{match[4]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/**
 * Renders formatted text as React elements.
 * - HTML content (from TipTap): rendered via dangerouslySetInnerHTML with prose styling
 * - Legacy markdown content: parsed into React elements
 */
export function renderFormattedText(text: string | null | undefined): React.ReactNode {
  if (!text) return null;

  // HTML content from TipTap editor
  if (isHTML(text)) {
    return (
      <div
        className="prose prose-sm max-w-none break-words [overflow-wrap:anywhere] prose-strong:text-inherit prose-em:text-inherit prose-p:text-inherit prose-li:text-inherit prose-p:my-0.5 prose-ul:my-1 prose-ol:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:break-words [&_li]:break-words [&_*]:[overflow-wrap:anywhere]"
        dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(text) }}
      />
    );
  }

  // Legacy markdown fallback
  const lines = text.split("\n");

  return (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {lines.map((line, i) => {
        const isBullet = line.trimStart().startsWith("• ");

        const content = isBullet ? (
          <span className="flex gap-1.5" key={i}>
            <span className="shrink-0">•</span>
            <span>{parseInline(line.trimStart().slice(2))}</span>
          </span>
        ) : (
          <React.Fragment key={i}>{parseInline(line)}</React.Fragment>
        );

        return (
          <React.Fragment key={i}>
            {content}
            {i < lines.length - 1 && "\n"}
          </React.Fragment>
        );
      })}
    </span>
  );
}
