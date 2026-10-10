# HireFlow — App Icon & Brand Mark

## Current app icon — "A: the logo's own mark" (chosen 2026-10-11)

The owner, 2026-10-10: "I'm not really loving this HireFlow app icon ... Logo
is fine. The app icon and the favicon, we need to [change]." Of four options
(https://claude.ai/artifact/8bREyawrQQqTqrggg94dtL) he chose **A**: the very
mark beside the name in the app (`src/cockpit/components/Wordmark.tsx`): a
**dark jade tile `#0C2A21`** with the **bright jade rising line `#3FCE97`**
(applications come in flat; the good ones rise). The app, the browser tab and
the phone now match.

- **One drawing makes every size:** `node scripts/make-app-icons.mjs` (then the
  two Pillow lines at its foot for `favicon.ico` and the in-app copy). The
  line is the logo's path on a 64 grid, stroke 7.
- **Rounded** (as a tab or launcher shows it): `favicon.svg`, `favicon-16/32`,
  `favicon.ico`, `icon-192/512`, `favicon.png`.
- **Full-bleed square** (the platform rounds it): `branding/app-icon-master.png`
  (1024), `apple-touch-icon.png`, `app-icon.png`, `src/assets/app-icon-new.png`.
- **Maskable** (Android): `maskable-512.png`, the line at 72% so it stays in
  the safe circle.
- Icon links use `?v=6` (`index.html`, `public/landing.html`,
  `public/site.webmanifest`); bump them whenever the icon changes. The
  manifest's install name is "HireFlow" (it was "Zulu Support Team").

The previous icon, "Direction 4" (an ivory tile with the jade Ava orb, chosen
for home-screen prominence), is retired with it: it did not match the logo and
read as a dot at tab size. Its render is kept at
`branding/direction-4-original-render.png` for the record only.

## Backup direction (do not delete) — "Direction 5: Brass flow ribbon"

Kept at [`branding/backup-icon-flow.png`](branding/backup-icon-flow.png) per owner request. Not used anywhere yet; the owner may switch to it later. If adopted, rebuild it full-bleed and run the regen steps above.

## ⛔ DO NOT REVIVE (removed on 2026-06-30)

The previous icon was the **Ava orb on a dark near-black jade tile**. It and all its variants were intentionally removed — the owner found it too dark / not spottable on a home screen. **Do not bring any of these back:**

- `public/app-icon-v2.png`, `public/app-icon-v3.png` — old AI variants (deleted)
- `public/hireflow-foreground.png` — old Android adaptive foreground (deleted)
- `public/play-store-feature-graphic.png` — old store graphic on the dark-orb branding (deleted; regenerate fresh from the new icon if a Play listing is ever needed)
- `src/pages/OrbIconCapture.tsx` + the `/preview/orb-icon` route — the dev tool that generated the old dark-tile orb icon (deleted)

**Update (2026-09-16): the orb is now retired in the product UI too.** There is no more `AvaOrb` component, and the `src/assets/ava-*.png` cartoon/orb renders and `src/assets/hireflow-logo.png` (the old neon wordmark, used only by the now-retired `/marketing-demo` page) have been deleted as unused. Ava's in-app mark today is **`AvaSeal`** (`src/components/ava/AvaSeal.tsx`) — a small code-drawn wax seal (jade disc, brass ring) used at badge scale (roughly 12–32px) next to her name or on work she produced. It is not a hero graphic; nothing in the product renders Ava at large scale anymore.

On 2026-09-16 the owner kept the launcher icon as it was ("Direction 4"). On 2026-10-11 he replaced it with icon **A**, the logo's own mark (top of this page). Neither the old dark-tile orb nor the ivory-tile orb is to be brought back.
