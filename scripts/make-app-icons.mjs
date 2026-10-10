// Makes every HireFlow icon from one drawing (BRANDING.md). Run: node scripts/make-app-icons.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Icon A (chosen 2026-10-11): the logo's own mark. Dark jade tile, bright jade rising line.
const TILE = "#0C2A21", LINE = "#3FCE97";
const line = (scale = 1) => {
  // The logo's line on a 64 grid, centred; scale < 1 for the maskable safe zone.
  const c = 32, pts = [[13, 46], [25, 19], [37, 39], [51, 17]].map(([x, y]) => [c + (x - c) * scale, c + (y - c) * scale]);
  return `<path d="M${pts.map((p) => p.map((n) => n.toFixed(2)).join(" ")).join(" L")}" fill="none" stroke="${LINE}" stroke-width="${(7 * scale).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const svg = ({ rounded, scale = 1 }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${rounded ? `<rect width="64" height="64" rx="14" fill="${TILE}"/>` : `<rect width="64" height="64" fill="${TILE}"/>`}${line(scale)}</svg>`;

// The svg favicon itself (rounded, like a tab icon).
writeFileSync(`${ROOT}/public/favicon.svg`, svg({ rounded: true }).replace("<svg ", '<svg role="img" aria-label="HireFlow" ') + "\n");

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(markup, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
const jobs = [
  [svg({ rounded: false }), 1024, `${ROOT}/branding/app-icon-master.png`],
  [svg({ rounded: true }), 16, `${ROOT}/public/favicon-16.png`],
  [svg({ rounded: true }), 32, `${ROOT}/public/favicon-32.png`],
  [svg({ rounded: true }), 48, `${ROOT}/branding/.favicon-48.png`],
  [svg({ rounded: false }), 180, `${ROOT}/public/apple-touch-icon.png`],
  [svg({ rounded: true }), 192, `${ROOT}/public/icon-192.png`],
  [svg({ rounded: true }), 512, `${ROOT}/public/icon-512.png`],
  [svg({ rounded: false, scale: 0.72 }), 512, `${ROOT}/public/maskable-512.png`],
  [svg({ rounded: false }), 512, `${ROOT}/public/app-icon.png`],
  [svg({ rounded: true }), 512, `${ROOT}/public/favicon.png`],
];
for (const [markup, size, out] of jobs) await png(markup, size, out);
await browser.close();
console.log("rendered", jobs.length);
// favicon.ico (16/32/48) and the in-app copy are made with Python's Pillow:
//   python3 -c "from PIL import Image; i=[Image.open(p).convert('RGBA') for p in ['public/favicon-16.png','public/favicon-32.png','branding/.favicon-48.png']]; i[2].save('public/favicon.ico', sizes=[(16,16),(32,32),(48,48)], append_images=i[:2])"
//   cp public/app-icon.png src/assets/app-icon-new.png && rm branding/.favicon-48.png
