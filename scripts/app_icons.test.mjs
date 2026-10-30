#!/usr/bin/env node
/**
 * The icons themselves are the logo's mark (BRANDING.md; guard one-logo-mark).
 *
 * The guard reads the drawing (scripts/make-app-icons.mjs, favicon.svg, the
 * wordmark); it cannot see the pictures it makes. Changing the drawing and
 * forgetting to run the generator would leave the old icon on every phone
 * and tab while the guard passed. This test opens the committed PNGs (and the
 * PNGs inside favicon.ico) and checks their pixels: the deep green tile
 * #0C2A21 where the tile is, the jade line #3FCE97 on the line, and a clear
 * corner where the tile is rounded. Never the brass on ink of 2026-10-25 to
 * 2026-10-30 (#E0B96A on #14120E), never the old dark orb.
 *
 * Run with: node scripts/app_icons.test.mjs   (no dependencies: node:zlib)
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TILE = [0x0c, 0x2a, 0x21];
const LINE = [0x3f, 0xce, 0x97];
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

const near = (rgba, rgb) => rgba[3] >= 245 && rgb.every((v, i) => Math.abs(rgba[i] - v) <= NEAR);
const hex = (rgba) => "#" + rgba.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("") + (rgba[3] < 255 ? ` alpha ${rgba[3]}` : "");

// Points on the 64-unit drawing (make-app-icons.mjs): the line runs
// (13,46) (25,19) (37,39) (51,17), 7 wide; the tile is the whole square,
// rounded rx 14 on the "rounded" icons; the maskable one draws the line at
// 0.72 around the centre.
const ON_LINE = [[19, 32.5], [31, 29], [44, 28]];
const ON_TILE = [[32, 58], [8, 32], [56, 46]];
function inGrid(img, [gx, gy], scale = 1) {
  const s = img.width / 64, c = 32;
  return [(c + (gx - c) * scale) * s, (c + (gy - c) * scale) * s];
}
function checkIcon(name, img, { rounded, scale = 1 }) {
  const bad = [];
  for (const p of ON_TILE) { const v = img.px(...inGrid(img, p, 1)); if (!near(v, TILE)) bad.push(`tile at ${p}: ${hex(v)}`); }
  for (const p of ON_LINE) { const v = img.px(...inGrid(img, p, scale)); if (!near(v, LINE)) bad.push(`line at ${p}: ${hex(v)}`); }
  const corner = img.px(0, 0);
  if (rounded ? corner[3] > 40 : !near(corner, TILE)) bad.push(`corner: ${hex(corner)} (${rounded ? "the rounded tile leaves it clear" : "the square tile fills it"})`);
  check(`${name} (${img.width}x${img.height}) is the jade line on the deep green tile`, bad.length === 0, bad.join("; "));
}

console.log("\nThe icons are the mark, as drawn");
const icons = [
  ["public/icon-512.png", { rounded: true }],
  ["public/icon-192.png", { rounded: true }],
  ["public/favicon.png", { rounded: true }],
  ["public/favicon-32.png", { rounded: true }],
  ["public/maskable-512.png", { rounded: false, scale: 0.72 }],
  ["public/apple-touch-icon.png", { rounded: false }],
  ["public/app-icon.png", { rounded: false }],
  ["src/assets/app-icon-new.png", { rounded: false }],
  ["branding/app-icon-master.png", { rounded: false }],
];
for (const [rel, shape] of icons) {
  try {
    checkIcon(rel, decodePng(await readFile(path.join(ROOT, rel))), shape);
  } catch (e) {
    check(`${rel} can be read`, false, e.message);
  }
}
// 16 px is too small for three points on a 3.5 px line; its tile and its line's colour are enough.
{
  const img = decodePng(await readFile(path.join(ROOT, "public/favicon-16.png")));
  let lineSeen = false;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (near(img.px(x, y), LINE)) lineSeen = true;
  check("public/favicon-16.png has the tile and the jade line", near(img.px(...inGrid(img, [32, 58])), TILE) && lineSeen);
}
try {
  const sizes = icoImages(await readFile(path.join(ROOT, "public/favicon.ico")));
  check("public/favicon.ico holds 16, 32 and 48", sizes.map((i) => i.width).sort((a, b) => a - b).join(",") === "16,32,48");
  for (const img of sizes.filter((i) => i.width >= 32)) checkIcon(`public/favicon.ico's ${img.width} px`, img, { rounded: true });
} catch (e) {
  check("public/favicon.ico can be read", false, e.message);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
