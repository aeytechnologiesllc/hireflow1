import * as React from "react";
import { Bold, Italic, List } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RichTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value?: string;
  onChange?: (value: string) => void;
}

const RichTextarea = React.forwardRef<HTMLTextAreaElement, RichTextareaProps>(
  ({ className, value = "", onChange, onFocus, onBlur, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
    const [focused, setFocused] = React.useState(false);

    const showToolbar = focused || (value && value.length > 0);

    const applyFormat = (type: "bold" | "italic" | "bullet") => {
      const el = textareaRef.current;
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = value;

      let newText = text;
      let newCursorPos = end;

      if (type === "bold") {
        if (start === end) {
          // No selection — insert placeholder
          newText = text.slice(0, start) + "**bold text**" + text.slice(end);
          newCursorPos = start + 2;
        } else {
          const selected = text.slice(start, end);
          // Toggle: if already wrapped, unwrap
          if (text.slice(start - 2, start) === "**" && text.slice(end, end + 2) === "**") {
            newText = text.slice(0, start - 2) + selected + text.slice(end + 2);
            newCursorPos = end - 2;
          } else {
            newText = text.slice(0, start) + "**" + selected + "**" + text.slice(end);
            newCursorPos = end + 4;
          }
        }
      } else if (type === "italic") {
        if (start === end) {
          newText = text.slice(0, start) + "_italic text_" + text.slice(end);
          newCursorPos = start + 1;
        } else {
          const selected = text.slice(start, end);
          if (text[start - 1] === "_" && text[end] === "_") {
            newText = text.slice(0, start - 1) + selected + text.slice(end + 1);
            newCursorPos = end - 1;
          } else {
            newText = text.slice(0, start) + "_" + selected + "_" + text.slice(end);
            newCursorPos = end + 2;
          }
        }
      } else if (type === "bullet") {
        // Find the start of the current line
        const beforeCursor = text.slice(0, start);
        const lineStart = beforeCursor.lastIndexOf("\n") + 1;
        const afterSelection = text.slice(end);
        const lineEnd = afterSelection.indexOf("\n");
        const blockEnd = lineEnd === -1 ? text.length : end + lineEnd;

        const block = text.slice(lineStart, blockEnd);
        const lines = block.split("\n");

        const allBulleted = lines.every((l) => l.trimStart().startsWith("• "));

        const newLines = lines.map((l) => {
          if (allBulleted) {
            return l.replace(/^(\s*)• /, "$1");
          }
          return l.trimStart().startsWith("• ") ? l : "• " + l;
        });

        newText = text.slice(0, lineStart) + newLines.join("\n") + text.slice(blockEnd);
        newCursorPos = lineStart + newLines.join("\n").length;
      }

      onChange?.(newText);

      // Restore focus & cursor after React re-render
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(newCursorPos, newCursorPos);
      });
    };

    return (
      <div
        className={cn(
          "rounded-md border border-input bg-background ring-offset-background transition-colors",
          focused && "ring-2 ring-ring ring-offset-2",
          className
        )}
      >
        <textarea
          ref={textareaRef}
          className="flex w-full bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            // Delay to allow toolbar clicks to fire
            setTimeout(() => setFocused(false), 150);
            onBlur?.(e);
          }}
          {...props}
        />
        {showToolbar && (
          <div className="flex items-center gap-0.5 px-2 py-1 border-t border-border/50">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("bold")}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Bold"
            >
              <Bold className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("italic")}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("bullet")}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Bullet list"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }
);

RichTextarea.displayName = "RichTextarea";

export { RichTextarea };
