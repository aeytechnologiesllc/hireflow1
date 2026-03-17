

## Fix: Natively Detection Breaking Desktop + Restore Google Sign-In

### Problem
`window.natively` is set by the Natively JS SDK on **all platforms** (including desktop browsers), so:
1. `Index.tsx` always redirects to `/auth` — desktop users never see the landing page
2. `Auth.tsx` `isWebView()` returns `true` on desktop — hides Google sign-in button

### Fix
Tighten both detection checks to use the **User-Agent string** injected only by the native shell (`"Natively/"`), removing reliance on `window.natively`:

**`src/pages/Index.tsx`** (line 160):
```typescript
// Before:
const isNatively = !!(window as any).natively || navigator.userAgent.includes('Natively');

// After:
const isNatively = /Natively\//.test(navigator.userAgent);
```

**`src/pages/Auth.tsx`** (lines 16-20):
```typescript
const isWebView = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Natively\//.test(ua)) return true;
  if (/wv/i.test(ua)) return true;
  if (/Android/.test(ua) && /Version\/[\d.]+/.test(ua) && !/Chrome\/[\d.]+ Mobile Safari/i.test(ua)) return true;
  return false;
};
```

### What this preserves
- **Natively app**: UA contains `"Natively/"` → still redirects past landing page, still hides Google (per Google's WebView policy)
- **Desktop browser**: UA does NOT contain `"Natively/"` → landing page shows normally, Google sign-in visible
- **Mobile browser** (Safari/Chrome): Same as desktop — landing page + Google sign-in work

### Files
- `src/pages/Index.tsx` — 1 line change
- `src/pages/Auth.tsx` — replace `isWebView` function (~5 lines)

