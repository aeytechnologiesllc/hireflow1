// Makes the two share pictures (1200 x 630) from HTML, in the locked colours
// (ink and ivory, brass accent; docs/LAUNCH-PLAN.md, Phase 3, tasks 1 and 5).
// Run: node scripts/make-share-images.mjs
//   public/share/hireflow.jpg  the front page's own picture
//   public/share/careers.jpg   any business's job or careers link (the owner's
//                              own business keeps public/share/zulu-careers.jpg):
//                              neutral, so it is never "remote" or "work from
//                              home" for a front desk in Ohio
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MARK = `<svg viewBox="0 0 64 64" width="44" height="44"><rect width="64" height="64" rx="14" fill="#14120E"/><rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="rgba(224,185,106,0.32)"/><path d="M13 46 L25 19 L37 39 L51 17" fill="none" stroke="#E0B96A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const page = (body) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=block">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: radial-gradient(70% 90% at 92% 0%, rgba(224, 185, 106, 0.16), rgba(224, 185, 106, 0) 60%), #0B0A08; color: #F4F0E6; font-family: "Geist", system-ui, sans-serif; }
  .wrap { box-sizing: border-box; height: 100%; padding: 72px 84px 64px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 16px; font-weight: 600; font-size: 28px; letter-spacing: -0.01em; }
  .tag { margin-left: 18px; font: 500 15px/1 "Geist", sans-serif; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(244, 240, 230, 0.5); }
  h1 { margin: auto 0 0; font: 700 84px/1 "Geist", sans-serif; letter-spacing: -0.045em; }
  h1 em { display: block; font: italic 400 100px/1.02 "Instrument Serif", Georgia, serif; letter-spacing: -0.02em; color: #E8C37E; }
  p { margin: 22px 0 0; font-size: 28px; line-height: 1.4; color: rgba(244, 240, 230, 0.72); max-width: 30ch; }
  .foot { margin-top: auto; padding-top: 22px; border-top: 1px solid rgba(244, 240, 230, 0.14); display: flex; justify-content: space-between; font-size: 21px; color: rgba(244, 240, 230, 0.58); }
  .foot b { color: #E8C37E; font-weight: 500; }
</style></head><body><div class="wrap">${body}</div></body></html>`;

const pictures = [
  [
    `${ROOT}/public/share/hireflow.jpg`,
    page(`<div class="brand">${MARK}HireFlow<span class="tag">Chat and phone · any business</span></div>
      <h1>Hire customer service agents<em>while you sleep.</em></h1>
      <div class="foot"><span>Every applicant tested and scored before you meet them</span><b>First job free</b></div>`),
  ],
  [
    `${ROOT}/public/share/careers.jpg`,
    page(`<div class="brand">${MARK}HireFlow</div>
      <h1>Now hiring.<em>Apply online.</em></h1>
      <p>A few questions and short tests, from your phone or computer.</p>
      <div class="foot"><span>Open roles on HireFlow</span><b>hireflownow.com</b></div>`),
  ],
];

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [out, html] of pictures) {
  await tab.setContent(html, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: out, type: "jpeg", quality: 88 });
}
await browser.close();
console.log("rendered", pictures.length);
