import React from "react";

/**
 * Parses inline markdown (bold, italic) within a single text segment.
 * Converts **bold** → <strong> and _italic_ → <em>.
 */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold** or _italic_ (non-greedy)
  const regex = /(\*\*(.+?)\*\*)|(_(.+?)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold
      nodes.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[4]) {
      // Italic
      nodes.push(<em key={`i-${match.index}`}>{match[4]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/**
 * Renders a plain-text string with basic markdown formatting as React elements.
 * Supports: **bold**, _italic_, and • bullet lines.
 */
export function renderFormattedText(text: string | null | undefined): React.ReactNode {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <span className="whitespace-pre-wrap">
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
            {i < lines.length - 1 && !isBullet && "\n"}
            {i < lines.length - 1 && isBullet && "\n"}
          </React.Fragment>
        );
      })}
    </span>
  );
}
