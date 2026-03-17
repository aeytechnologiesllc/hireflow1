

## Replace Markdown RichTextarea with TipTap WYSIWYG Editor

### Problem
The current `RichTextarea` is a plain `<textarea>` that inserts markdown characters (`**`, `_`, `• `). Users see raw markdown symbols instead of live formatting. Bold and italic appear broken because the textarea cannot render rich text.

### Approach
Replace the markdown-based `RichTextarea` with a proper WYSIWYG editor using TipTap. TipTap renders a contenteditable div where bold/italic/lists display instantly — no markdown symbols visible.

### Data format change
- **Current**: plain text with markdown markers (`**bold**`, `_italic_`, `• bullets`)
- **New**: HTML strings (`<strong>bold</strong>`, `<em>italic</em>`, `<ul><li>bullets</li></ul>`)
- The `onChange` callback will emit HTML instead of markdown text
- Existing jobs with markdown content will still display (the `renderFormattedText` utility handles those; we'll also add HTML rendering support)

### Files to change

**1. `src/components/ui/rich-textarea.tsx`** — Full rewrite
- Replace textarea + manual markdown logic with TipTap editor
- Keep same props interface: `value: string`, `onChange: (value: string) => void`
- Use `@tiptap/react` + `@tiptap/starter-kit`
- Toolbar with Bold, Italic, BulletList buttons that call `editor.chain().focus().toggleBold().run()` etc.
- Active state highlighting (green glow when bold/italic is active)
- Dark theme styling matching existing UI — same border, focus ring, rounded corners
- Emit `editor.getHTML()` on content change

**2. `src/lib/formatText.tsx`** — Update renderer
- Add HTML detection: if content starts with `<` tags, render via `dangerouslySetInnerHTML` (sanitized)
- Keep existing markdown parsing as fallback for older content

**3. `src/components/JobDetailsDialog.tsx`** — Already uses `renderFormattedText`, no changes needed
**4. `src/pages/CreateJob.tsx`** — Already uses `RichTextarea` component and `renderFormattedText` in review step, no changes needed beyond the component swap

### TipTap editor component structure
```
<div class="rounded-md border ...">
  <EditorContent editor={editor} class="px-3 py-2 min-h-[150px] prose prose-invert" />
  <div class="border-t flex gap-0.5 px-2 py-1">
    <BoldButton active={editor.isActive('bold')} />
    <ItalicButton active={editor.isActive('italic')} />
    <BulletListButton active={editor.isActive('bulletList')} />
  </div>
</div>
```

### Dependencies
- `@tiptap/react` — React bindings
- `@tiptap/starter-kit` — Bold, italic, lists, etc. bundled
- `@tiptap/pm` — ProseMirror peer dependency

### What this achieves
- Bold/italic/lists work instantly with visual feedback (true WYSIWYG)
- No markdown symbols ever visible to users
- Same dark theme, green focus ring, toolbar placement
- Backwards compatible — old markdown content still renders via fallback
- Same component API so CreateJob.tsx needs zero logic changes

