

## Two fixes in one

### Fix 1: Build errors — RichTextarea missing `id` and `style` props

The `RichTextareaProps` interface only declares `value`, `onChange`, `placeholder`, `className`, `rows`, and `disabled`. But `CreateJob.tsx` passes `id` and `style` props in 4 places, causing TS errors.

**File: `src/components/ui/rich-textarea.tsx`**
- Add `id?: string` and `style?: React.CSSProperties` to `RichTextareaProps`
- Pass `id` to the wrapper div and apply `style` to it

### Fix 2: Show Google Sign-In in native app as compact icon button

Currently the `Auth.tsx` page hides Google Sign-In entirely when `inWebView` is true. Instead:

**File: `src/pages/Auth.tsx`**
- Remove the `!inWebView &&` guard entirely
- When `inWebView` is true, render a compact icon-only Google button (small circle with G logo, no text) instead of the full-width "Continue with Google" button
- Hide the "or continue with email" divider in WebView (already hidden on mobile via `hidden sm:block`)
- This keeps the layout tight on mobile/native while still offering Google sign-in

The compact button will be ~40px icon button with the Google G logo, placed above the tab switcher with minimal margin.

