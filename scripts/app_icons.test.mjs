#!/usr/bin/env node
/**
 * The icons themselves are the logo, the green seal (BRANDING.md; guard
 * one-logo-mark; the owner chose "D, the green seal" on 2026-10-31).
 *
 * The guard reads the drawing (scripts/make-app-icons.mjs, favicon.svg, the
 * wordmark); it cannot see the pictures it makes. Changing the drawing and
 * forgetting to run the generator would leave the old icon on every phone
 * and tab while the guard passed. This test opens the committed PNGs (and the
 * PNGs inside favicon.ico) and checks their pixels: on the app icons, the
 * paper square #F3EEE2 around the seal (clear corners where it is rounded,
 * paper to the edge where it is full-bleed), the seal's wax #13734F, its
 * inner disc #11694C and the rising line #063A27 pressed in where the
 * drawing puts them; on the favicons, the seal alone on nothing (clear
 * corners), its wax and its pressed line. Never the jade line on the deep
 * green tile of 2026-10-11 to 2026-10-31 (#3FCE97 on #0C2A21), never the
 * brass on ink of 2026-10-25 to 2026-10-30 (#E0B96A on #14120E), never the
 * old dark orb.
 *
 * Run with: node scripts/app_icons.test.mjs   (no dependencies: node:zlib)
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAPER = [0xf3, 0xee, 0xe2];
const WAX = [0x13, 0x73, 0x4f];
const DISC = [0x11, 0x69, 0x4c];
const LINE = [0x06, 0x3a, 0x27];
/** Retired marks: none of their colours may show anywhere in an icon. */
const RETIRED = [
  ["the jade line of the deep green tile", [0x3f, 0xce, 0x97]],
  ["the deep green tile", [0x0c, 0x2a, 0x21]],
  ["the brass line", [0xe0, 0xb9, 0x6a]],
  ["the ink tile", [0x14, 0x12, 0x0e]],
];
const NEAR = 10; // per channel: the browser's rendering may round a step or two

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG into { width, height, px(x, y) -> [r, g, b, a] }. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString("latin1", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[dst + i - bpp] : 0, b = y ? out[dst - stride + i] : 0, c = i >= bpp && y ? out[dst - stride + i - bpp] : 0;
      let v = raw[src + i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + i] = v & 0xff;
    }
  }
  return { width, height, px: (x, y) => { const i = Math.round(y) * stride + Math.round(x) * bpp; return [out[i], out[i + 1], out[i + 2], bpp === 4 ? out[i + 3] : 255]; } };
}

/** The PNG images inside an .ico (Pillow writes each size as a PNG). */
function icoImages(buf) {
  const count = buf.readUInt16LE(4), images = [];
  for (let k = 0; k < count; k++) {
    const e = 6 + k * 16, size = buf.readUInt32LE(e + 8), at = buf.readUInt32LE(e + 12);
    images.push(decodePng(buf.subarray(at, at + size)));
  }
  return images;
}

const near = (rgba, rgb, tol = NEAR) => rgba[3] >= 245 && rgb.every((v, i) => Math.abs(rgba[i] - v) <= tol);
const hex = (rgba) => "#" + rgba.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("") + (rgba[3] < 255 ? ` alpha ${rgba[3]}` : "");

// Points on the seal's own 64-unit drawing (make-app-icons.mjs): the wax
// ring between the inner disc (r 19.5, 20.5 on the small seal) and the wax's
// edge (r 26.5); the inner disc, away from the line; the middle of each of
// the pressed line's three strokes (the full seal's line, and the small
// seal's larger one for 16 to 48 px).
const ON_WAX = [[32, 8.5], [55.5, 32], [32, 55.5]];
const ON_DISC = [[32, 20], [40, 41], [16, 32]];
const ON_LINE = [[24.25, 33], [29.75, 30.9], [37.5, 29.4]];
const ON_LINE_SMALL = [[21.95, 33.45], [29.1, 30.7], [39.2, 28.75]];
// The app icon: the seal 50 units wide on the 64-unit paper square (44 on the
// maskable one, inside Android's safe circle), centred; the paper shows at
// the middle of every edge.
const ON_PAPER = [[32, 2.5], [2.5, 32], [61.5, 32], [32, 61.5]];
/** The pixel holding a point given on the icon's 64 grid. */
function at(img, [gx, gy]) {
  const s = img.width / 64;
  return img.px(Math.min(img.width - 1, Math.floor(gx * s)), Math.min(img.height - 1, Math.floor(gy * s)));
}
/** A point on the seal's own grid, placed on the icon (the seal `box` units wide, centred). */
const placed = ([x, y], box) => [32 - box / 2 + (x * box) / 64, 32 - box / 2 + (y * box) / 64];
function retiredColours(img) {
  const seen = [];
  for (const [name, rgb] of RETIRED) {
    let hit = false;
    for (let y = 0; y < img.height && !hit; y++) for (let x = 0; x < img.width && !hit; x++) if (near(img.px(x, y), rgb, 6)) hit = true;
    if (hit) seen.push(name);
  }
  return seen;
}
function checkAppIcon(name, img, { rounded, box = 50 }) {
  const bad = [];
  for (const p of ON_PAPER) { const v = at(img, p); if (!near(v, PAPER)) bad.push(`paper at ${p}: ${hex(v)}`); }
  for (const p of ON_WAX) { const v = at(img, placed(p, box)); if (!near(v, WAX)) bad.push(`wax at ${p}: ${hex(v)}`); }
  for (const p of ON_DISC) { const v = at(img, placed(p, box)); if (!near(v, DISC, 6)) bad.push(`disc at ${p}: ${hex(v)}`); }
  for (const p of ON_LINE) { const v = at(img, placed(p, box)); if (!near(v, LINE)) bad.push(`line at ${p}: ${hex(v)}`); }
  const corner = img.px(0, 0);
  if (rounded ? corner[3] > 40 : !near(corner, PAPER)) bad.push(`corner: ${hex(corner)} (${rounded ? "the rounded square leaves it clear" : "the full-bleed square fills it"})`);
  const old = retiredColours(img);
  if (old.length) bad.push(`a retired mark's colour: ${old.join(", ")}`);
  check(`${name} (${img.width}x${img.height}) is the green seal on the paper square`, bad.length === 0, bad.join("; "));
}
function checkFavicon(name, img, { small }) {
  const bad = [];
  for (const c of [[0, 0], [img.width - 1, 0], [0, img.height - 1], [img.width - 1, img.height - 1]]) {
    const v = img.px(...c);
    if (v[3] > 40) bad.push(`corner ${c}: ${hex(v)} (the seal stands on nothing)`);
  }
  for (const p of ON_WAX) { const v = at(img, p); if (!near(v, WAX)) bad.push(`wax at ${p}: ${hex(v)}`); }
  for (const p of small ? ON_LINE_SMALL : ON_LINE) { const v = at(img, p); if (!near(v, LINE)) bad.push(`line at ${p}: ${hex(v)}`); }
  const old = retiredColours(img);
  if (old.length) bad.push(`a retired mark's colour: ${old.join(", ")}`);
  check(`${name} (${img.width}x${img.height}) is the green seal alone, its line pressed in`, bad.length === 0, bad.join("; "));
}

console.log("\nThe app icons are the seal on the paper square, as drawn");
const appIcons = [
  ["public/icon-512.png", { rounded: true }],
  ["public/icon-192.png", { rounded: true }],
  ["public/maskable-512.png", { rounded: false, box: 44 }],
  ["public/apple-touch-icon.png", { rounded: false }],
  ["public/app-icon.png", { rounded: false }],
  ["src/assets/app-icon-new.png", { rounded: false }],
  ["branding/app-icon-master.png", { rounded: false }],
];
for (const [rel, shape] of appIcons) {
  try {
    checkAppIcon(rel, decodePng(await readFile(path.join(ROOT, rel))), shape);
  } catch (e) {
    check(`${rel} can be read`, false, e.message);
  }
}
// The maskable icon's seal stays inside Android's safe circle (the inner 80%,
// radius 40% of the side): nothing but paper on that circle.
try {
  const img = decodePng(await readFile(path.join(ROOT, "public/maskable-512.png")));
  const r = img.width * 0.4, c = img.width / 2, off = [];
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, v = img.px(Math.floor(c + Math.cos(a) * r), Math.floor(c + Math.sin(a) * r));
    if (!near(v, PAPER)) off.push(hex(v));
  }
  check("public/maskable-512.png keeps the seal inside the safe circle", off.length === 0, off.slice(0, 3).join(", "));
} catch (e) {
  check("public/maskable-512.png can be read", false, e.message);
}

console.log("\nThe favicons are the seal alone, drawn to read at 16 px");
for (const [rel, small] of [["public/favicon.png", false], ["public/favicon-32.png", true]]) {
  try {
    checkFavicon(rel, decodePng(await readFile(path.join(ROOT, rel))), { small });
  } catch (e) {
    check(`${rel} can be read`, false, e.message);
  }
}
// 16 px is too small for three points on a 1.75 px line; its clear corners,
// its wax and its line's colour are enough.
{
  const img = decodePng(await readFile(path.join(ROOT, "public/favicon-16.png")));
  let lineSeen = false;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (near(img.px(x, y), LINE, 14)) lineSeen = true;
  check(
    "public/favicon-16.png is the seal, its line pressed in",
    img.px(0, 0)[3] <= 40 && img.px(15, 15)[3] <= 40 && near(at(img, [32, 8.5]), WAX, 14) && lineSeen && retiredColours(img).length === 0,
  );
}
try {
  const sizes = icoImages(await readFile(path.join(ROOT, "public/favicon.ico")));
  check("public/favicon.ico holds 16, 32 and 48", sizes.map((i) => i.width).sort((a, b) => a - b).join(",") === "16,32,48");
  for (const img of sizes.filter((i) => i.width >= 32)) checkFavicon(`public/favicon.ico's ${img.width} px`, img, { small: true });
} catch (e) {
  check("public/favicon.ico can be read", false, e.message);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
