import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { plainTextToEditorHtml } from "@/lib/avaDraftFormatting";

export interface RichTextareaProps {
  value?: string;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}

const RichTextarea = React.forwardRef<HTMLDivElement, RichTextareaProps>(
  ({ className, value = "", onChange, onFocus, onBlur, placeholder, rows = 6, disabled, id, style, autoFocus }, ref) => {
    const isUpdatingRef = React.useRef(false);

    const editor = useEditor({
      extensions: [StarterKit],
      content: plainTextToEditorHtml(value || ""),
      editable: !disabled,
      editorProps: {
        attributes: {
          class: cn(
            "w-full bg-transparent px-3 py-2 text-sm focus:outline-none",
            "prose prose-sm max-w-none",
            "prose-strong:text-foreground prose-em:text-foreground prose-p:text-foreground prose-li:text-foreground",
            "prose-ul:my-1 prose-ol:my-1 prose-p:my-0.5 prose-li:my-0",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
            "break-words [overflow-wrap:anywhere]",
            "[&_p]:break-words [&_li]:break-words [&_*]:[overflow-wrap:anywhere]",
            disabled && "cursor-not-allowed opacity-50"
          ),
          style: `min-height: ${rows * 1.5}rem`,
          "data-placeholder": placeholder || "",
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (isUpdatingRef.current) return;
        const html = ed.getHTML();
        // TipTap returns <p></p> for empty content
        const cleaned = html === "<p></p>" ? "" : html;
        onChange?.(cleaned);
      },
    });

    // Sync external value changes into editor
    React.useEffect(() => {
      if (!editor) return;
      const currentHTML = editor.getHTML();
      const normalizedCurrent = currentHTML === "<p></p>" ? "" : currentHTML;
      const nextContent = plainTextToEditorHtml(value || "");
      if (nextContent !== normalizedCurrent) {
        isUpdatingRef.current = true;
        editor.commands.setContent(nextContent);
        isUpdatingRef.current = false;
      }
    }, [value, editor]);

    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!editor) return;
      const setFocusedOn = () => setFocused(true);
      const setFocusedOff = () => setFocused(false);
      const handleFocus = () => {
        onFocus?.();
        setFocusedOn();
      };
      const handleBlur = () => {
        onBlur?.();
        setFocusedOff();
      };
      editor.on("focus", handleFocus);
      editor.on("blur", handleBlur);
      return () => {
        editor.off("focus", handleFocus);
        editor.off("blur", handleBlur);
      };
    }, [editor, onBlur, onFocus]);

    React.useEffect(() => {
      if (!editor || !autoFocus || disabled) return;
      const frame = window.requestAnimationFrame(() => {
        editor.commands.focus("end");
      });
      return () => window.cancelAnimationFrame(frame);
    }, [autoFocus, disabled, editor]);

    if (!editor) return null;

    return (
      <div
        ref={ref}
        id={id}
        style={style}
        className={cn(
          "rounded-md border border-input bg-background ring-offset-background transition-colors",
          focused && "ring-2 ring-ring ring-offset-2",
          className
        )}
      >
        <EditorContent editor={editor} />

        {/* Empty state placeholder */}
        <style>{`
          .tiptap p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            float: left;
            color: hsl(var(--muted-foreground));
            pointer-events: none;
            height: 0;
          }
        `}</style>

        <div className="flex items-center gap-0.5 px-2 py-1 border-t border-border/50">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              "h-6 w-6 inline-flex items-center justify-center rounded transition-colors",
              editor.isActive("bold")
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "h-6 w-6 inline-flex items-center justify-center rounded transition-colors",
              editor.isActive("italic")
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-6 w-6 inline-flex items-center justify-center rounded transition-colors",
              editor.isActive("bulletList")
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title="Bullet list"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }
);

RichTextarea.displayName = "RichTextarea";

export { RichTextarea };
