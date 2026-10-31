# HireFlow — App Icon & Brand Mark

## The logo — "D: the green seal" (chosen 2026-10-31)

The owner chose option **D, the green seal**, of four ways to take the mark
forward (the bright line as it was, an ivory line on the tile, a paper tile,
the seal). The logo is **Ava's green wax seal from the front page, with the
rising line pressed into it**: the moment the product is about, Ava sealing
the applicants worth a call. The rising line stays (applications come in
flat; the good ones rise); it is pressed into the wax now instead of drawn on
a tile.

**The drawing** (a 64-unit box; the approved sheet's symbol `mD`):

- the wax rim, irregular as real wax sets: `#0A4A35`
- the wax: a disc of radius 26.5, `#13734F`
- the inner disc, radius 19.5, `#11694C`, with a light ring (`#3DB088` at
  50%, offset down-right) and a dark ring (`#06331F` at 55%, offset up-left):
  the seal's pressed edge
- the rising line pressed in: `M21.5 39.5 L27 26.5 L32.5 35.3 L42.5 23.5`,
  `#063A27`, 3.8 wide, round, with a soft highlight under it (the same line,
  `#49C094` at 50%, offset 0.8, 1)
- a small gloss, `#7FE0B8` at 25%, top left

**Under 40 px it is drawn simpler**, so the line still reads (at 16 to 34 px
the full drawing's rings and 3.8-unit line blur into the wax): the same rim,
wax and inner disc (radius 20.5), no rings, no gloss, and the line larger and
thicker, `M18.4 41.9 L25.5 25 L32.7 36.4 L45.7 21.1`, 7 wide, with its
highlight (`#49C094` at 75%, offset 1.4, 1.8). The favicon, every bar (the
app's, the front page's, the blog's) and `SealMark` under 40 px use it.

**Where it is** (one drawing, written out in each place; guard
`one-logo-mark` in scripts/guards/phase-3-launch-locks.mjs holds every one):

| Surface | What it shows |
|---|---|
| The app's wordmark, `src/cockpit/components/Wordmark.tsx` (`SealMark`) | the seal at the given size, then "HireFlow" in the display face; no tile |
| Every loading screen, `src/components/BrandLoader.tsx` | the seal (64 px) pressed once (scale 1.4 to 0.95 to 1, opacity in, 0.6 s), then still; "HireFlow"; a thin line sliding while the page loads (the loader's one allowed loop, `no-endless-animations`); the message. Sage by Day, the Night ground at Night (theme tokens); reduced motion: the seal and the line, still |
| The start screen, `index.html` `#hf-boot` | the seal, 56 px, on the Day sage ground (Night only for a saved Night), fading in once |
| The front page's bar, `public/landing.html` (top and pinned) | the seal (34, 30, 26 px), then the name. The green stamp buttons keep their own small line-in-a-ring mark (the button's ornament, not the logo) |
| The blog's bar, `scripts/build-blog.mjs` (`MARK`) | the seal, as the front page's bar |
| The share pictures, `scripts/make-share-images.mjs` | the seal (52 px) beside the name |
| The app icon (`icon-192`, `icon-512`, `apple-touch-icon`, `app-icon`, `maskable-512`, `branding/app-icon-master.png`, `src/assets/app-icon-new.png`) | the seal on a paper square `#F3EEE2`, 50 units of 64; rounded (`rx` 14) for 192 and 512, full-bleed where the platform rounds it; maskable: the seal at 44 units, inside Android's safe circle (the inner 80%) |
| The favicon (`favicon.svg`, `favicon-16`, `favicon-32`, `favicon.ico` 16/32/48) | the seal alone on nothing, in the small drawing; `favicon.png` (512) is the full seal alone |

- **One script makes every size:** `node scripts/make-app-icons.mjs`, then the
  two Pillow lines at its foot for `favicon.ico` and the in-app copy.
  `scripts/app_icons.test.mjs` opens the committed PNGs and checks their
  pixels (paper, wax, disc, the pressed line, clear corners; none of a
  retired mark's colours).
- Icon links use `?v=9` (`index.html`, `public/landing.html`,
  `public/site.webmanifest`, the blog's head in `scripts/build-blog.mjs`, the
  push notification's icon and badge in `public/hireflow-sw.js` and the sample
  in `PushPrompt.tsx`); bump them all whenever the icon changes, with
  `ICON_VERSION` in the `one-logo-mark` guard.
- `theme-color`, the Windows tile colour and the manifest's `theme_color` stay
  the deep green `#0C2A21` (a brand colour, no longer a logo tile); the
  manifest's `background_color` (the installed app's splash) is Day's sage
  ground `#DEE3D5`.
- The approved drawing is the sheet `marks.html` the owner chose from
  (symbols `mD`, the seal, and `mDi`, the app icon); the front page's own
  seals (`sealSVG` in `public/landing.html`) are the same idea, each pressed a
  little differently.
- Not to be confused with **`AvaSeal`** (`src/components/ava/AvaSeal.tsx`),
  Ava's own badge in the product (a disc with a ring and an "A", at 12 to 32
  px beside work she did): that is Ava's mark, the green seal is HireFlow's.

## History (the marks before the seal; never the logo again)

### The jade line on the deep green tile, 2026-10-11 to 2026-10-31

**2026-10-30: the mark is green again.** The owner: "I thought we'd keep it
in the green." The rising line is the **bright jade `#3FCE97` on the deep
green tile `#0C2A21`**, the mark of 2026-10-11 (every icon file came out
byte for byte as it was before 2026-10-25). One logo everywhere: the app's
`Wordmark.tsx` (with a faint jade hairline so the tile holds on the Night
ground), the loader (`BrandLoader.tsx`), the start screen in `index.html`,
every icon size, the front page's bar, both share pictures
(`scripts/make-share-images.mjs`) and the blog (`scripts/build-blog.mjs`).
`theme-color`, the Windows tile colour and the manifest's `theme_color` are
the tile's `#0C2A21`; the manifest's `background_color` (the installed app's
splash) is Day's ground `#DEE3D5`, since the app opens in Day. Icon links are
`?v=8`. The same day the owner locked the new green for the app itself (jade,
with the thin journey line and a jade "good"), after a day of Warm gold, and
that evening chose **Sage paper** for its Day: light sage grounds (`#DEE3D5`,
a deeper sage sidebar `#CFD7C4`), warm paper cards (`#F5F1E6`) and the front
page's green ink (`#1D3329`) as the text. The app opens in Day for everyone;
Night (warm ink, unchanged) is one click on the moon. The mark sits on both
grounds as it is. Brass stays the accent (Ava's seal,
the score, anything that costs money); it is no longer the logo. Guard
`one-logo-mark` (scripts/guards/phase-3-launch-locks.mjs) holds the mark's
colours in every one of those places and every icon link on the current
`?v=`. It is the rising line, never the retired orb: "DO NOT REVIVE" below
still stands.

**2026-10-25 to 2026-10-30 (retired):** the colour the owner locked on
2026-10-24 (ink and ivory, brass accent; docs/LAUNCH-PLAN.md, Phase 3) had
recoloured the mark: the same rising line, brass `#E0B96A` on an ink tile
`#14120E`, icon links `?v=7`. The history below is kept as it was.

The owner, 2026-10-10: "I'm not really loving this HireFlow app icon ... Logo
is fine. The app icon and the favicon, we need to [change]." Of four options
(https://claude.ai/artifact/8bREyawrQQqTqrggg94dtL) they chose **A**: the very
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
- Icon links use `?v=8` (`index.html`, `public/landing.html`,
  `public/site.webmanifest`, the blog's head in `scripts/build-blog.mjs`, the
  push notification's icon and badge in `public/hireflow-sw.js` and the sample
  in `PushPrompt.tsx`); bump them all whenever the icon changes (and
  `ICON_VERSION` in the `one-logo-mark` guard). The manifest's install name is
  "HireFlow" (it was "Zulu Support Team").

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

On 2026-09-16 the owner kept the launcher icon as it was ("Direction 4"). On 2026-10-11 he replaced it with icon **A**, the logo's own mark (History, above), and on 2026-10-31 with the green seal (top of this page). Neither the old dark-tile orb nor the ivory-tile orb is to be brought back.
