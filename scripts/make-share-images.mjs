// Makes the two share pictures (1200 x 630) from HTML (docs/LAUNCH-PLAN.md,
// Phase 3, tasks 1 and 5), in the front page's own look, "The Desk" (the owner
// approved it 2026-10-30; docs/LANDING.md): sage desk #C6CFBE with a warm wash
// from the top right, deep green ink #1D3329, the jade #0F6B4F for the words
// that matter, Besley and Schibsted Grotesk, and the logo's own mark, the jade
// rising line on the deep green tile (scripts/make-app-icons.mjs). Never the
// retired near-black and gold card: every shared hireflownow.com link showed it.
// Run: node scripts/make-share-images.mjs
//   public/share/hireflow.jpg  the front page's own picture (and the blog's)
//   public/share/careers.jpg   any business's job or careers link (the owner's
//                              own business keeps public/share/zulu-careers.jpg):
//                              neutral, so it is never "remote" or "work from
//                              home" for a front desk in Ohio
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MARK = `<svg viewBox="0 0 64 64" width="46" height="46"><rect width="64" height="64" rx="14" fill="#0C2A21"/><rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="rgba(63,206,151,0.32)"/><path d="M13 46 L25 19 L37 39 L51 17" fill="none" stroke="#3FCE97" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Ava's green wax seal, drawn as the front page draws it (its blob and seal).
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function blob(seed, cx, cy, r) {
  const g = rng(seed), n = 15, p = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + g() * 0.2; const rr = r * (0.88 + g() * 0.17); p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m = mid(p[n - 1], p[0]);
  let d = `M${m[0].toFixed(2)} ${m[1].toFixed(2)}`;
  for (let k = 0; k < n; k++) { const q = p[k], m2 = mid(p[k], p[(k + 1) % n]); d += ` Q${q[0].toFixed(2)} ${q[1].toFixed(2)} ${m2[0].toFixed(2)} ${m2[1].toFixed(2)}`; }
  return d + "Z";
}
const SEAL = (seed) => `<svg viewBox="0 0 40 40" width="100%" height="100%" style="overflow:visible">
  <defs><radialGradient id="wax${seed}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#2FA078"/><stop offset=".45" stop-color="#147554"/><stop offset="1" stop-color="#0A4A35"/></radialGradient></defs>
  <path d="${blob(seed, 20, 20.4, 19)}" fill="#0A4A35"/><path d="${blob(seed, 20, 20, 18.6)}" fill="url(#wax${seed})"/>
  <circle cx="20" cy="20" r="12.6" fill="#11694C"/>
  <circle cx="20.4" cy="20.6" r="12.6" fill="none" stroke="#3DB088" stroke-opacity=".55" stroke-width="1.1"/>
  <circle cx="19.6" cy="19.5" r="12.6" fill="none" stroke="#06331F" stroke-opacity=".6" stroke-width="1.1"/>
  <path d="M13.2 24.6 L16.6 16.4 L20.2 22 L26.4 14.6" transform="translate(.55 .7)" fill="none" stroke="#49C094" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M13.2 24.6 L16.6 16.4 L20.2 22 L26.4 14.6" fill="none" stroke="#063A27" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="13.5" cy="11" rx="4" ry="2" fill="#7FE0B8" opacity=".28" transform="rotate(-35 13.5 11)"/>
</svg>`;
// A letter on the desk: an envelope, sealed by Ava or not.
const FLAP = `<svg class="flap" viewBox="0 0 100 66" preserveAspectRatio="none"><path d="M0 66 L40 30 M100 66 L60 30" stroke="rgba(29,51,41,.14)" stroke-width=".7" fill="none" vector-effect="non-scaling-stroke"/><path d="M0 0 L50 40 L100 0 Z" fill="rgba(29,51,41,.045)" stroke="rgba(29,51,41,.22)" stroke-width=".9" vector-effect="non-scaling-stroke"/></svg>`;
const letter = ({ x, y, r, tone, seal }) =>
  `<div class="env" style="left:${x}px;top:${y}px;transform:rotate(${r}deg);--c:${tone}">${FLAP}${seal ? `<span class="seal">${SEAL(seal)}</span>` : ""}</div>`;
// The underline the front page draws under "on your desk."
const UNDER = `<svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 9 C 60 4, 120 3, 170 5.5 S 255 10, 297 4"/></svg>`;

const page = (body) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Besley:ital,wght@0,500..800;1,500..600&family=Schibsted+Grotesk:wght@400..700&display=block">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; color: #1D3329; font-family: "Schibsted Grotesk", system-ui, sans-serif; -webkit-font-smoothing: antialiased;
    background: linear-gradient(242deg, rgba(240, 225, 190, 0.72) 0%, rgba(240, 225, 190, 0.42) 34%, rgba(240, 225, 190, 0) 64%),
      linear-gradient(180deg, rgba(255, 250, 236, 0.10), rgba(255, 250, 236, 0) 38%, rgba(29, 51, 41, 0.07) 100%), #C6CFBE; }
  .wrap { position: relative; z-index: 2; box-sizing: border-box; height: 100%; padding: 60px 72px 52px 76px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 15px; font: 600 32px/1 "Besley", Georgia, serif; letter-spacing: -0.01em; }
  .brand svg { display: block; border-radius: 12px; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.22) inset, -1px 4px 8px -1px rgba(12, 42, 33, 0.4); }
  .tag { margin-left: 16px; font: 600 15px/1 "Schibsted Grotesk", sans-serif; letter-spacing: 0.18em; text-transform: uppercase; color: #4E6056; }
  h1 { margin: auto 0 0; font: 650 84px/0.98 "Besley", Georgia, serif; letter-spacing: -0.028em; }
  h1 .ln { display: block; }
  h1 .em { position: relative; display: inline-block; white-space: nowrap; color: #0F6B4F; }
  h1 .em svg { position: absolute; left: -2%; bottom: -0.14em; width: 104%; height: 0.2em; overflow: visible; }
  h1 .em path { fill: none; stroke: #0F6B4F; stroke-width: 5; stroke-linecap: round; }
  p { margin: 30px 0 0; font-size: 26px; line-height: 1.42; color: #304238; max-width: 27ch; }
  .foot { margin-top: auto; padding-top: 20px; border-top: 1px solid rgba(29, 51, 41, 0.16); display: flex; justify-content: space-between; align-items: center; font-size: 21px; color: #304238; }
  .foot b { font-weight: 650; color: #0F6B4F; }
  /* the front page's postage stamp */
  .stamp { display: inline-block; transform: rotate(-1.6deg); filter: drop-shadow(0 1px 1px rgba(20, 38, 30, 0.28)) drop-shadow(-2px 6px 7px rgba(20, 38, 30, 0.16)); }
  .stamp span { --r: 3.4px; position: relative; display: block; padding: 13px 22px; background: #0F6B4F; color: #F3EFE2; font: 600 21px/1 "Besley", Georgia, serif; white-space: nowrap;
    -webkit-mask: radial-gradient(var(--r), #0000 97%, #000) round calc(-1.5 * var(--r)) calc(-1.5 * var(--r)) / calc(3 * var(--r)) calc(3 * var(--r)), linear-gradient(#000 0 0) no-repeat 50% / calc(100% - 3 * var(--r)) calc(100% - 3 * var(--r)); }
  .stamp span::before { content: ""; position: absolute; inset: 7px; border: 1px solid rgba(243, 239, 226, 0.4); }
  /* letters on the desk */
  .desk { position: absolute; inset: 0; z-index: 1; }
  .env { position: absolute; width: 236px; height: 154px; border-radius: 3px; background: var(--c);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5) inset, 0 0 0 1px rgba(29, 51, 41, 0.08), -8px 16px 22px -6px rgba(22, 40, 31, 0.32); }
  .env .flap { position: absolute; inset: 0; width: 100%; height: 100%; }
  .env .seal { position: absolute; left: 50%; top: 61%; width: 60px; height: 60px; margin: -30px 0 0 -30px; filter: drop-shadow(-1px 3px 3px rgba(10, 40, 28, 0.35)); }
  .sheet { position: absolute; width: 290px; height: 360px; border-radius: 3px; background: #F6F2E7; box-sizing: border-box; padding: 40px 34px;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 0 0 1px rgba(29, 51, 41, 0.08), -10px 20px 26px -6px rgba(22, 40, 31, 0.3); }
  .sheet i { display: block; height: 10px; margin: 0 0 22px; border-radius: 5px; background: rgba(29, 51, 41, 0.13); }
  .sheet i.h { height: 16px; width: 62%; margin-bottom: 34px; background: rgba(29, 51, 41, 0.3); }
  .sheet .ok { position: absolute; right: 30px; bottom: 30px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid #0F6B4F; display: grid; place-items: center; }
</style></head><body>${body}</body></html>`;

const pictures = [
  [
    `${ROOT}/public/share/hireflow.jpg`,
    page(`<div class="desk">
        ${letter({ x: 962, y: 26, r: 7, tone: "#EFE9DA" })}
        ${letter({ x: 1004, y: 226, r: -5, tone: "#E7EDE1" })}
        ${letter({ x: 818, y: 100, r: -8, tone: "#EFE6D3", seal: 18 })}
        ${letter({ x: 884, y: 298, r: 4, tone: "#F3EEE2", seal: 25 })}
        ${letter({ x: 704, y: 326, r: -3, tone: "#E7EDE1", seal: 11 })}
      </div>
      <div class="wrap">
        <div class="brand">${MARK}HireFlow<span class="tag">Chat and email · any business</span></div>
        <h1><span class="ln">Hundreds apply.</span><span class="ln">Three land</span><span class="ln"><span class="em">on your desk.${UNDER}</span></span></h1>
        <div class="foot"><span>Every applicant tested and scored before you meet them</span><span class="stamp"><span>First job free</span></span></div>
      </div>`),
  ],
  [
    `${ROOT}/public/share/careers.jpg`,
    page(`<div class="desk">
        <div class="sheet" style="left:820px;top:92px;transform:rotate(4deg)"><i class="h"></i><i></i><i style="width:88%"></i><i></i><i style="width:70%"></i><i style="width:80%"></i>
          <span class="ok"><svg width="28" height="28" viewBox="0 0 16 16"><path d="M2.5 8.8l3.4 3.4 7.6-8.4" fill="none" stroke="#0F6B4F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>
      </div>
      <div class="wrap">
        <div class="brand">${MARK}HireFlow</div>
        <h1><span class="ln">Now hiring.</span><span class="ln"><span class="em">Apply online.${UNDER}</span></span></h1>
        <p>A few questions and short tests, from your phone or computer.</p>
        <div class="foot"><span>Open roles on HireFlow</span><b>hireflownow.com</b></div>
      </div>`),
  ],
];

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [out, html] of pictures) {
  await tab.setContent(html, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  const faces = await tab.evaluate(() => ["Besley", "Schibsted Grotesk"].map((f) => [...document.fonts].some((face) => face.family.replace(/"/g, "") === f && face.status === "loaded")));
  if (faces.includes(false)) throw new Error(`a face did not load (Besley, Schibsted Grotesk: ${faces}); the picture would fall back to Georgia`);
  await tab.screenshot({ path: out, type: "jpeg", quality: 88 });
}
await browser.close();
console.log("rendered", pictures.length);
