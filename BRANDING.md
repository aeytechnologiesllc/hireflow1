# HireFlow — App Icon & Brand Mark

## Current app icon (LOCKED) — "Direction 4: Ivory tile + jade orb"

The HireFlow app icon is a **warm ivory/cream tile** with the **deep-jade dotted-mesh Ava orb** centered, plus a single thin **brass arc**. It was chosen for prominence — a light tile stands out on a busy iPhone/Android home screen where almost every other icon is dark or saturated — while keeping the Ava orb as the brand mark and staying inside the Deep Jade + brass palette.

- **Master (source of truth):** [`branding/app-icon-master.png`](branding/app-icon-master.png) — 1024×1024, **full-bleed** (cream bleeds to all four edges, no rounded corners, no margin). Platforms apply their own corner mask, so the master MUST stay a plain square.
- **Original concept render:** `branding/direction-4-original-render.png` (the squircle concept the master was rebuilt from).

## Where it's wired (every surface)

| Asset | Size | Path | Referenced by |
|-------|------|------|---------------|
| favicon (multi) | 16/32/48 | `public/favicon.ico` | `index.html` |
| favicon png | 16, 32 | `public/favicon-16.png`, `public/favicon-32.png` | `index.html` |
| inline logo | 512 | `public/favicon.png` | `src/pages/Terms.tsx`, `src/pages/Privacy.tsx` |
| Apple touch | 180 | `public/apple-touch-icon.png` | `index.html` |
| PWA any | 192, 512 | `public/icon-192.png`, `public/icon-512.png` | `public/site.webmanifest` |
| PWA maskable | 512 | `public/maskable-512.png` | `public/site.webmanifest` (Android adaptive) |
| general/store | 512 | `public/app-icon.png` | general use / store listing |
| in-app logo | 512 | `src/assets/app-icon-new.png` | `src/components/AppSidebar.tsx`, `src/pages/CandidateAuth.tsx` (CSS-rounded in the UI) |

PWA manifest: `public/site.webmanifest` (linked from `index.html`). `theme_color`/`background_color` = `#0a0f0d` (Deep Jade near-black, matches the app).

Icon links in `index.html` use a `?v=4` cache-bust — **bump to v5+ whenever you change the icon** so browsers/installed PWAs refresh.

## How to regenerate every asset from the master

All sizes are derived from `branding/app-icon-master.png` (no AI needed to re-export):

```python
from PIL import Image
m = Image.open('branding/app-icon-master.png').convert('RGB')
for size, name in [(16,'favicon-16.png'),(32,'favicon-32.png'),(180,'apple-touch-icon.png'),
                   (192,'icon-192.png'),(512,'icon-512.png'),(512,'maskable-512.png'),
                   (512,'app-icon.png'),(512,'favicon.png')]:
    m.resize((size,size), Image.LANCZOS).save('public/'+name)
Image.open('branding/app-icon-master.png').convert('RGBA').save('public/favicon.ico', sizes=[(16,16),(32,32),(48,48)])
m.resize((512,512), Image.LANCZOS).save('src/assets/app-icon-new.png')
```

Then bump the `?v=` query in `index.html` + `site.webmanifest`.

## Backup direction (do not delete) — "Direction 5: Brass flow ribbon"

Kept at [`branding/backup-icon-flow.png`](branding/backup-icon-flow.png) per owner request. Not used anywhere yet; the owner may switch to it later. If adopted, rebuild it full-bleed and run the regen steps above.

## ⛔ DO NOT REVIVE (removed on 2026-06-30)

The previous icon was the **Ava orb on a dark near-black jade tile**. It and all its variants were intentionally removed — the owner found it too dark / not spottable on a home screen. **Do not bring any of these back:**

- `public/app-icon-v2.png`, `public/app-icon-v3.png` — old AI variants (deleted)
- `public/hireflow-foreground.png` — old Android adaptive foreground (deleted)
- `public/play-store-feature-graphic.png` — old store graphic on the dark-orb branding (deleted; regenerate fresh from the new icon if a Play listing is ever needed)
- `src/pages/OrbIconCapture.tsx` + the `/preview/orb-icon` route — the dev tool that generated the old dark-tile orb icon (deleted)

The Ava orb itself is still the brand mark and is still used **inside** the app (the live three.js `AvaOrb` component, `src/assets/ava-*.png`, `src/assets/hireflow-logo.png`) — that's separate from the launcher/app icon and stays. Only the dark-tile **launcher icon** was replaced.
