// HireFlow YouTube videos (copied from the LaunchSweeps pipeline, crownforge-site video/): animated scenes, paced by the voice.
//   node video/film.mjs video/scripts/<name>.json <work>
// Reads <work>/clips/durations.json (run voice.py first), writes <work>/frames/*.jpg and <work>/timeline.json.
// Rules: real screens, NO mouse pointer and NO green ring (owner 2026-10-19), the camera moves instead, no text laid on the picture, one even pace set by
// the voice (each step holds for its line plus about a second), every move about one second.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');

const [scriptFile, work] = process.argv.slice(2);
const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
const dur = JSON.parse(fs.readFileSync(`${work}/clips/durations.json`, 'utf8'));
const BASE = process.env.BASE || 'http://localhost:4502';
// TALL=1 films the same scenes upright (1080x1920) for a phone ad; the scenes lay themselves out tall.
const TALL = !!process.env.TALL;
const W = TALL ? 1080 : 1920, H = TALL ? 1920 : 1080, LEAD = 150, BREATH = 450;  // owner 2026-10-19: "feels too slow"
const Z = script.zoom || 1;  // page zoom: the picture is still 1920x1080, the page is laid out at 1920/Z wide
fs.mkdirSync(`${work}/frames`, { recursive: true });
for (const f of fs.readdirSync(`${work}/frames`)) fs.unlinkSync(`${work}/frames/${f}`);

const OVERLAY = `(() => {
  const ARROW = '<svg width="30" height="30" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.2 17.2 L12.6 25.4 L16 24 L12.6 16 L19.8 16 Z" fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  let target = null, pad = 12, x = -100, y = -100;
  const mk = () => {
    if (document.getElementById('zzc')) return;
    const st = document.createElement('style');
    st.textContent = '#askBtn,.ask{display:none!important}';
    document.documentElement.appendChild(st);
    const c = document.createElement('div'); c.id = 'zzc'; c.innerHTML = ARROW; c.style.display = 'none';  // owner 2026-10-19: no mouse pointer, it looks like a screen recorder
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', transform: 'translate(-100px,-100px)' });
    const r = document.createElement('div'); r.id = 'zzr';
    Object.assign(r.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', zIndex: 2147483646, pointerEvents: 'none', border: '0', opacity: '0'  /* owner 2026-10-19: no green highlight in videos; the ring only tells the camera where to look */ });
    document.documentElement.append(r, c);
  };
  document.addEventListener('mousemove', (e) => { mk(); x = e.clientX; y = e.clientY; document.getElementById('zzc').style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; }, true);
  const loop = () => {
    const r = document.getElementById('zzr');
    if (r) {
      if (target && target.isConnected) {
        const b = target.getBoundingClientRect();
        Object.assign(r.style, { left: b.left - pad + 'px', top: b.top - pad + 'px', width: b.width + 2 * pad + 'px', height: b.height + 2 * pad + 'px', opacity: '1' });
      } else r.style.opacity = '0';
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__ringEl = (el, p) => { mk(); pad = p ?? 12; target = el || null; return !!target; };
  window.__cursorAt = () => [x, y];
  if (document.readyState !== 'loading') mk(); else document.addEventListener('DOMContentLoaded', mk);
})();`;

const CARD = (kind) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@600;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 40%,#ffcf3a 0%,#ff9a3d 55%,#e2641f 100%);font-family:Figtree,system-ui,sans-serif;color:#2a1206}
.c{text-align:center;max-width:73vw;padding:0 4vw}.b{display:inline-flex;align-items:center;gap:.95vw;font:800 2.8vw/1 'Bricolage Grotesque',sans-serif}.b svg{width:3.4vw;height:3.4vw}
h1{font:800 5vw/1.04 'Bricolage Grotesque',sans-serif;letter-spacing:-.02em;margin:2.3vw 0 1.4vw;text-wrap:balance}p{font:700 2vw/1.3 Figtree;margin:0;opacity:.85}
.u{display:inline-block;margin-top:2.4vw;padding:1.15vw 2.1vw;border-radius:1.15vw;background:#fff4df;border:.21vw solid #2a1206;box-shadow:0 .42vw 0 #2a1206;font:800 2.3vw/1 Figtree}</style></head><body><div class="c">
<div class="b"><svg width="64" height="64" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10.6" fill="#ff7a2e" stroke="#2a1206" stroke-width="1.8"/><circle cx="13" cy="13" r="7.4" fill="#ffcf3a" stroke="#2a1206" stroke-width="1.4"/><path d="M13 7.6 L17.4 12.6 H14.7 V18.2 H11.3 V12.6 H8.6 Z" fill="#fff4df" stroke="#2a1206" stroke-width="1.2" stroke-linejoin="round"/></svg>LaunchSweeps</div>
${kind === 'title' ? `<h1>${script.title}</h1><p>${script.subtitle || ''}</p>` : `<h1>${script.endTitle || 'Launch your own sweepstakes casino'}</h1><span class="u">launchsweeps.com</span><p style="margin-top:1.8vw">${script.endLine || 'Book a private demo and test the real platform yourself.'}</p>`}
</div></body></html>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Math.round(W / Z), height: Math.round(H / Z) }, deviceScaleFactor: Z, reducedMotion: 'no-preference' });
await ctx.addInitScript(OVERLAY);
await ctx.route('**/__card/**', (route) => route.fulfill({ contentType: 'text/html', body: CARD(route.request().url().includes('title') ? 'title' : 'end') }));
// animated explainer pages (video/scenes/) are served from the project, next to the real site
const SCENES = new URL('./scenes/', import.meta.url);
await ctx.route('**/__scene/**', (route) => {
  const name = new URL(route.request().url()).pathname.replace(/^.*\/__scene\//, '');
  const file = new URL(name, SCENES);
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.webp') ? 'image/webp' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
  route.fulfill({ contentType: type, body: fs.readFileSync(file) });
});
await ctx.route('**/_vercel/**', (route) => route.fulfill({ status: 204, body: '' }));
await ctx.route(/supabase\.co/, (route) => route.abort());
let page = await ctx.newPage();
let mx = (W / Z) * 0.62, my = (H / Z) * 0.72;

async function glide(x, y, speed = 1500) {
  const d = Math.hypot(x - mx, y - my);
  const ms = Math.max(280, Math.min(850, (d / speed) * 1000));
  const n = Math.round(ms / 16);
  const sx = mx, sy = my;
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n);
    await page.mouse.move(sx + (x - sx) * t, sy + (y - sy) * t);
    await sleep(16);
  }
  mx = x; my = y;
}
async function box(sel) {
  const el = await page.$(sel);
  if (!el) throw new Error('not found: ' + sel);
  return el.boundingBox();
}
// THE CLOCK. Owner 2026-10-19: the wheel "glitched". A live screen capture drops frames whenever the
// page is busy (a world change, a coin burst), and the motion jumps. So the film is not captured live:
// once filming starts the page's own clock is paused, and every frame is made by moving that clock
// forward exactly 1/30 s and taking a picture. Nothing can be dropped, however busy the page is.
const FPS = 30, FMS = 1000 / FPS;
let cdp = null, filming = false, nowMs = 0;
const frames = [], pending = [];
let afterNav = 0;
const inflight = new Map();
function advance() {
  return new Promise((res) => {
    let done = false;
    const fin = () => { if (!done) { done = true; clearTimeout(t); cdp.off('Emulation.virtualTimeBudgetExpired', fin); res(); } };
    cdp.on('Emulation.virtualTimeBudgetExpired', fin);
    // the page clock waits while a picture or font is still downloading, so nothing pops in late
    cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: FMS }).catch(fin);
    // ...but never forever: a download that never ends must not hang the film
    const t = setTimeout(() => console.log('  note: frame waited on', [...inflight.values()].slice(0, 3).join(', ') || 'nothing known'), 3000);
  });
}
function watch(p) {
  p.on('request', (r) => inflight.set(r, r.url().slice(0, 90)));
  p.on('requestfinished', (r) => inflight.delete(r));
  p.on('requestfailed', (r) => inflight.delete(r));
  p.on('crash', () => console.log('  PAGE CRASHED'));
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
}
watch(page);
// A photo can wait for the page to draw, and on a fresh page that draw can itself wait for the clock.
// If it takes too long, move the clock one millisecond (invisible) and keep waiting.
async function photo() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    const r = await Promise.race([p, sleep(8000).then(() => null)]);
    if (r) return r;
    // stuck: reconnect to the page and try again, rather than waiting forever
    console.log('  note: photo stuck at', (nowMs / 1000).toFixed(1) + 's, reconnecting');
    cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
    await advance();
  }
  throw new Error('photo kept hanging at ' + (nowMs / 1000).toFixed(1) + 's');
}
let stillShot = null;  // the closing card never moves: one picture, held, instead of filming it frame by frame
async function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    if (stillShot) {
      const k = frames.length;
      frames.push(nowMs);
      pending.push(fs.promises.writeFile(`${work}/frames/f${String(k).padStart(5, '0')}.jpg`, stillShot));
      nowMs += FMS;
      continue;
    }
    const dbg = process.env.DEBUG && afterNav-- > 0;
    if (dbg) console.log('    frame', frames.length, 'advance…');
    await advance();
    if (dbg) console.log('    frame', frames.length, 'shoot…');
    const shot = await photo();
    const k = frames.length;
    frames.push(nowMs);
    pending.push(fs.promises.writeFile(`${work}/frames/f${String(k).padStart(5, '0')}.jpg`, Buffer.from(shot.data, 'base64')));
    nowMs += FMS;
    if (frames.length % 150 === 0) console.log('  filmed', (nowMs / 1000).toFixed(0) + 's');
  }
}
const wait = (ms) => (filming ? tick(Math.max(0, Math.round(ms / FMS))) : sleep(ms));

async function scrollFrames(from, to, ms) {
  const n = Math.max(1, Math.round(ms / FMS));
  for (let i = 1; i <= n; i++) {
    const y = from + (to - from) * ease(i / n);
    await page.evaluate((y) => window.scrollTo(0, y), y);
    if (filming) await tick(1); else await sleep(FMS);
  }
}
async function scrollTo(sel, block = 'center', ms = 1000, offset = 0) {
  const handle = await page.$(sel);
  if (!handle) throw new Error('scroll target not found: ' + sel);
  const [from, to] = await page.evaluate(([el, block, offset]) => {
    const b = el.getBoundingClientRect();
    let to = scrollY + b.top + offset;
    if (block === 'center') to -= (innerHeight - Math.min(b.height, innerHeight)) / 2;
    if (block === 'top') to -= 90;
    return [scrollY, Math.max(0, Math.min(to, document.documentElement.scrollHeight - innerHeight))];
  }, [handle, block, offset]);
  await scrollFrames(from, to, ms);
}
async function scrollBy(px, ms = 1000) {
  const from = await page.evaluate(() => scrollY);
  const to = await page.evaluate((t) => Math.max(0, Math.min(t, document.documentElement.scrollHeight - innerHeight)), from + px);
  await scrollFrames(from, to, ms);
}
async function goto(url, settle) {
  if (!filming) { await page.goto(url, { waitUntil: 'networkidle' }); }
  else {
    // A new page is a cut. Open it in a fresh tab at normal speed, then pause that tab's clock and
    // close the old one. (Switching pages inside a paused tab left its next photos hanging forever.)
    // close the old (paused) tab FIRST: tabs of one site share a process, and a paused tab can stall the new one
    const old = page;
    page = await ctx.newPage();
    await old.close();
    watch(page);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (url.includes('/__card/')) { await sleep(300); stillShot = await page.screenshot({ type: 'jpeg', quality: 92 }); return; }
    cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  }
  if (process.env.DEBUG) console.log('  loaded');
  // a plain style element: page.addStyleTag waits for a load event that never comes while the clock is paused
  await page.evaluate(() => { const st = document.createElement('style'); st.textContent = 'html{scroll-behavior:auto!important}'; document.head.appendChild(st); });
  await wait(settle);
}
async function act(a) {
  if (process.env.DEBUG) console.log('  act', (nowMs / 1000).toFixed(1), JSON.stringify(a).slice(0, 80));
  if (a.goto) return goto(BASE + a.goto, a.settle ?? 600);
  if (a.scroll) return scrollTo(a.scroll, a.block || 'center', a.ms || 750, a.offset || 0);
  if (a.scrollBy) return scrollBy(a.scrollBy, a.ms || 750);
  if (a.scrollVh) return scrollBy(Math.round((H / Z) * a.scrollVh), a.ms || 750);
  if (a.cam !== undefined) { await logCam(a.cam ? await page.$(a.cam) : null, a.zoom); return; }
  const tap = a.press || a.click;
  if (tap) { await page.evaluate((s) => document.querySelector(s).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })), tap); return; }
  if (a.ring !== undefined) {
    // Playwright selectors (with :has-text) are resolved here, then handed to the page as an element.
    const el = a.ring ? await page.$(a.ring) : null;
    if (a.ring && !el) throw new Error('ring not found: ' + a.ring);
    await page.evaluate(([el, p]) => window.__ringEl(el, p), [el, a.pad ?? 12]);
    if (a.cam !== false) await logCam(el, a.zoom);
    return;
  }
  if (a.point || a.park) return;  // no pointer on screen (owner 2026-10-19), so nothing to move
  if (a.wait) return wait(a.wait * 1000);
  if (a.eval) return page.evaluate(a.eval);
  throw new Error('unknown action ' + JSON.stringify(a));
}

const voice = [], cams = [], caps = [];
// The camera: where the subject is (in picture pixels). build.py eases the picture in on it.
async function logCam(el, zoom) {
  if (!el) { cams.push({ at: nowMs, rect: null }); return; }
  if (filming) await tick(1); else await sleep(50);  // let the page settle first
  const b = await el.boundingBox();
  if (!b) return;
  cams.push({ at: nowMs, rect: [b.x * Z, b.y * Z, b.width * Z, b.height * Z], zoom: zoom ?? null });
}
async function step(key, actions, pre) {
  for (const a of pre || []) await act(a);  // page changes finish BEFORE the line starts
  if (script.scenePage) await page.evaluate((k) => window.play && window.play(k), key);
  const start = nowMs;
  voice.push({ key, at: start + LEAD });
  if (script.captions !== false) caps.push({ key, at: start + LEAD });
  const hold = LEAD + dur[key] * 1000 + BREATH;
  for (const a of actions || []) await act(a);
  const left = hold - (nowMs - start);
  if (left > 0) await wait(left);
  else if (left < -250) console.log(`  note: step ${key} ran ${(-left / 1000).toFixed(1)}s past its line`);
}

// Hook: open straight on the first page (no still title card); the question is the first caption.
if (script.scenePage) script.steps[0].pre = [{ goto: script.scenePage, settle: 300 }];
const first = script.steps[0];
for (const a of first.pre || []) await act(a);
first.pre = [];
await sleep(300);
cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
filming = true;
const filmStart = 0;
await step('opening', [{ wait: 0.2 }]);
for (const s of script.steps) await step(s.id, s.do, s.pre);
// the closing line plays over the brand finale (the same one the animated videos end on)
if (!script.scenePage) {
  await goto(BASE + '/__scene/finale.html?title=' + encodeURIComponent(script.finale || 'Hire Chat Agents while you sleep.'), 0);
  await page.evaluate(() => window.play && window.play('closing'));
}
await step('closing', [{ wait: 0.2 }]);
await wait(script.endHold ?? 2500);  // let the brand finale sit before the picture ends
const filmEnd = nowMs;
await Promise.all(pending);
fs.mkdirSync(`${work}/caps`, { recursive: true });
const capCtx = await browser.newContext({ deviceScaleFactor: 1 });  // captions at picture size, whatever the page zoom
const capPage = await capCtx.newPage();
await capPage.setViewportSize({ width: 1900, height: 400 });
const capText = { opening: script.hook || script.title };
for (const s of script.steps) if (s.cap) capText[s.id] = s.cap;
for (const [key, text] of Object.entries(capText)) {
  const big = key === 'opening';
  await capPage.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap" rel="stylesheet"><style>html,body{margin:0;background:transparent}
  #c{display:inline-block;margin:24px;padding:${big ? '26px 40px 30px' : '18px 30px 22px'};background:${big ? '#ffcf3a' : '#fff4df'};color:#2a1206;border:5px solid #2a1206;border-radius:22px;box-shadow:0 9px 0 #2a1206;
  font:800 ${big ? 78 : 58}px/1.05 'Bricolage Grotesque',sans-serif;letter-spacing:-.015em;max-width:1500px;text-align:center}</style></head><body><div id="c">${text}</div></body></html>`, { waitUntil: 'networkidle' });
  await capPage.locator('#c').screenshot({ path: `${work}/caps/${key}.png`, omitBackground: true });
}
await browser.close();
fs.writeFileSync(`${work}/timeline.json`, JSON.stringify({ filmStart, filmEnd, frames, voice, cams, caps, maxZoom: script.maxZoom || 1.5 }, null, 1));
console.log('frames', frames.length, 'length', ((filmEnd - filmStart) / 1000).toFixed(1) + 's');
