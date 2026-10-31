// Makes every HireFlow icon from one drawing (BRANDING.md). Run: node scripts/make-app-icons.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The logo since 2026-10-31 (the owner chose "D, the green seal"): Ava's green
// wax seal with the rising line pressed into it, the same seal as the front
// page's and as SealMark in src/cockpit/components/Wordmark.tsx. The app icon
// is the seal on a paper square; the favicon is the seal alone. (Before: the
// bright jade line on the deep green tile, 2026-10-11 to 2026-10-31, with five
// days of brass on ink.) Icon links are ?v=9 (index.html, public/landing.html,
// public/site.webmanifest, the blog, the push notifications and PushPrompt);
// bump them whenever the icon changes, with ICON_VERSION in the one-logo-mark
// guard.
const PAPER = "#F3EEE2";
const RIM = "M32 3.2c4.6.3 7 2.5 11.4 3.6 4 1.1 7.8 1.4 10.4 4.6 2.8 3.3 2.5 7.1 4 11.2 1.4 3.9 3.8 6.7 3.3 11-.5 4.3-3.3 6.8-4.8 10.7-1.6 4-1.6 7.9-4.7 10.7-3.1 2.8-7.1 2.6-11.2 4-3.9 1.3-6.7 3.4-11 3-4.3-.5-6.7-3.1-10.6-4.8-3.9-1.6-7.8-1.9-10.4-5-2.6-3.1-2.3-7-3.7-10.9-1.4-3.9-3.7-6.8-3.1-11.2.6-4.2 3.6-6.5 5.3-10.2 1.7-3.9 2-7.8 5.3-10.4 3.3-2.6 7.1-2.2 11-3.4C25.6 5.1 27.6 3 32 3.2Z";
const LINE = "M21.5 39.5 L27 26.5 L32.5 35.3 L42.5 23.5";
// For 16 to 48 px: the same seal with no rings and a larger, thicker line, so
// the line still reads in a browser tab.
const LINE_SMALL = "M18.4 41.9 L25.5 25 L32.7 36.4 L45.7 21.1";
const sealFull =
  `<path d="${RIM}" fill="#0A4A35"/><circle cx="32" cy="32" r="26.5" fill="#13734F"/><circle cx="32" cy="32" r="19.5" fill="#11694C"/>` +
  `<circle cx="32.6" cy="32.9" r="19.5" fill="none" stroke="#3DB088" stroke-opacity=".5" stroke-width="1.6"/>` +
  `<circle cx="31.4" cy="31.2" r="19.5" fill="none" stroke="#06331F" stroke-opacity=".55" stroke-width="1.6"/>` +
  `<path d="${LINE}" transform="translate(.8 1)" fill="none" stroke="#49C094" stroke-opacity=".5" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${LINE}" fill="none" stroke="#063A27" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<ellipse cx="21" cy="17" rx="6" ry="3" fill="#7FE0B8" opacity=".25" transform="rotate(-35 21 17)"/>`;
const sealSmall =
  `<path d="${RIM}" fill="#0A4A35"/><circle cx="32" cy="32" r="26.5" fill="#13734F"/><circle cx="32" cy="32" r="20.5" fill="#11694C"/>` +
  `<path d="${LINE_SMALL}" transform="translate(1.4 1.8)" fill="none" stroke="#49C094" stroke-opacity=".75" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${LINE_SMALL}" fill="none" stroke="#063A27" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
/** The seal at `box` units wide, centred on the 64 grid. */
const placed = (seal, box) => (box === 64 ? seal : `<g transform="translate(${32 - box / 2} ${32 - box / 2}) scale(${box / 64})">${seal}</g>`);
// The app icon: the seal on the paper square, as the owner approved it (the
// seal 50 units of 64). Rounded where the icon is shown as it is; full-bleed
// where the platform rounds it. Maskable: the seal at 44 units, well inside
// Android's safe circle (the inner 80%).
const appIcon = ({ rounded, box = 50 }) => svg(`<rect width="64" height="64"${rounded ? ' rx="14"' : ""} fill="${PAPER}"/>${placed(sealFull, box)}`);
// The favicon: the seal alone, on nothing.
const favicon = ({ small }) => svg(small ? sealSmall : sealFull);

// The svg favicon itself (a tab draws it at 16 or 32 px: the small seal).
writeFileSync(`${ROOT}/public/favicon.svg`, favicon({ small: true }).replace("<svg ", '<svg role="img" aria-label="HireFlow" ') + "\n");

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(markup, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
const jobs = [
  [appIcon({ rounded: false }), 1024, `${ROOT}/branding/app-icon-master.png`],
  [favicon({ small: true }), 16, `${ROOT}/public/favicon-16.png`],
  [favicon({ small: true }), 32, `${ROOT}/public/favicon-32.png`],
  [favicon({ small: true }), 48, `${ROOT}/branding/.favicon-48.png`],
  [appIcon({ rounded: false }), 180, `${ROOT}/public/apple-touch-icon.png`],
  [appIcon({ rounded: true }), 192, `${ROOT}/public/icon-192.png`],
  [appIcon({ rounded: true }), 512, `${ROOT}/public/icon-512.png`],
  [appIcon({ rounded: false, box: 44 }), 512, `${ROOT}/public/maskable-512.png`],
  [appIcon({ rounded: false }), 512, `${ROOT}/public/app-icon.png`],
  [favicon({ small: false }), 512, `${ROOT}/public/favicon.png`],
];
for (const [markup, size, out] of jobs) await png(markup, size, out);
await browser.close();
console.log("rendered", jobs.length);
// favicon.ico (16/32/48) and the in-app copy are made with Python's Pillow:
//   python3 -c "from PIL import Image; i=[Image.open(p).convert('RGBA') for p in ['public/favicon-16.png','public/favicon-32.png','branding/.favicon-48.png']]; i[2].save('public/favicon.ico', sizes=[(16,16),(32,32),(48,48)], append_images=i[:2])"
//   cp public/app-icon.png src/assets/app-icon-new.png && rm branding/.favicon-48.png
