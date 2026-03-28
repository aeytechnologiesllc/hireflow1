import React from "react";

/**
 * Detects if a string contains HTML tags (from TipTap WYSIWYG editor).
 */
function isHTML(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
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
        dangerouslySetInnerHTML={{ __html: text }}
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
