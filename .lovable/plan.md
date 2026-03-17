

## Fix Rich Formatting Toolbar — Full Gap Analysis

### Gap 1: No-selection inserts phantom text (the reported bug)
When clicking Bold/Italic with no text selected, it inserts `**bold text**` or `_italic text_` — literal placeholder strings. **Fix**: insert only the markers (`****` / `__`) and place cursor between them.

### Gap 2: Markdown is never rendered anywhere (critical)
This is the bigger problem. Job descriptions are displayed using `whitespace-pre-wrap` with no markdown parsing — in `JobDetailsDialog.tsx`, `GuestJobCreator.tsx`, `CreateJob.tsx` review step, `ApplicantDetails.tsx`, etc. So even when bold/italic *is* applied correctly, users will see raw `**text**` and `_text_` on job listings. Bullets work because `• ` renders visually as-is.

**Fix**: Create a small `renderFormattedText()` utility that converts `**bold**` → `<strong>`, `_italic_` → `<em>`, and `• ` lines into proper elements. Use it in all display locations.

### Gap 3: Cursor position off after wrapping selection with bold
When wrapping selected text in `**`, `newCursorPos = end + 4` places the cursor 4 chars after original end — but only 2 chars were added before the selection end. The cursor lands 2 chars past the closing `**`. Should be `end + 2` to land right after the closing markers. Same issue exists for italic (`end + 2` should be `end + 1`). Minor but causes selection to jump.

### Implementation

**File 1: `src/components/ui/rich-textarea.tsx`**
- Bold no-selection: insert `****`, cursor at `start + 2`
- Italic no-selection: insert `__`, cursor at `start + 1`  
- Fix cursor positions for wrap-selection cases

**File 2: `src/lib/formatText.tsx`** (new)
- Simple function: `renderFormattedText(text: string): React.ReactNode`
- Splits by lines, handles `• ` bullets, replaces `**...**` with `<strong>`, `_..._` with `<em>`
- Returns array of React elements

**Files 3-5: Display locations** — replace raw `{text}` with `{renderFormattedText(text)}` in:
- `src/components/JobDetailsDialog.tsx` (description, requirements, responsibilities)
- `src/pages/CreateJob.tsx` (review step preview)
- `src/components/JobApplicationDialog.tsx` or wherever candidates see job details

### What this achieves
- Bold/Italic buttons work intuitively (no phantom text)
- Formatted text actually renders as bold/italic everywhere it's displayed
- Bullet points continue working as before
- No heavy dependencies — pure string-to-React-element conversion

