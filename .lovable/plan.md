

## Add Subtle Rich-Text Formatting Toolbar to Job Creation Fields

### Approach
Create a reusable `RichTextarea` component that wraps the existing `Textarea` with a slim, unobtrusive formatting toolbar. The toolbar appears at the bottom of the textarea (inside the border) and offers **Bold**, **Italic**, and **Bullet List** toggles. These operate on the selected text using simple text manipulation (wrapping with `**`, `_`, or prepending `• `), keeping the data as plain/markdown text — no heavy WYSIWYG editor needed.

### Design
- Toolbar sits **inside the textarea container** at the bottom, flush with the border — small icon buttons (`h-6 w-6`), muted color, with a faint top separator
- Only shows on focus or when the textarea has content (so it's truly "not in the way")
- Icons: `Bold`, `Italic`, `List` from lucide-react
- Subtle hover highlight, active state when formatting is applied to selection

### Component: `src/components/ui/rich-textarea.tsx`
- Wraps a `<textarea>` inside a styled container
- Tracks selection start/end to apply formatting to selected text
- Bold: wraps selection in `**...**`
- Italic: wraps selection in `_..._`
- Bullet: prepends `• ` to each selected line (or current line)
- Props mirror `TextareaProps` + `onChange` passes the modified value up

### File: `src/pages/CreateJob.tsx`
Replace `<Textarea>` with `<RichTextarea>` for these 4 fields:
- Description (line 1246)
- Responsibilities (line 1273)
- Requirements (line 1300)
- Benefits (line 1563)

Import the new component and swap — no other logic changes needed since the value stays as a string.

