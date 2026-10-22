// HireFlow explainer scenes (same mechanics as _ref/kit.js, HireFlow's own look and finale).
// The recorder (video/film.mjs) calls play('<step id>') as each spoken line starts.
// A scene is <section class="scene" id="s-<step id>" data-bg="night|mid|late|dawn" data-hz="1">. Inside it:
//   .in (+ .up .drop .left .right .fade .pop .slam .thump .flip .press, delay with style="--d:300ms")  appears
//   [data-count]  rolls a number from data-from to data-to over data-ms (data-fmt="int", data-suffix)
//   [data-fill]   grows width or height to data-fill (%), after data-delay ms
// Everything runs on the page clock (CSS animations, performance.now), so the frame-by-frame filming catches it all.
// Layout: 1920x1080 is the film; a portrait window (1080x1920, the 15 s ad) gets html.tall and the CSS re-flows.
(function () {
  const root = document.documentElement;
  const TALL = innerHeight > innerWidth;
  if (TALL) root.classList.add('tall');

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const fmt = (v) => Math.round(v).toLocaleString('en-US');
  function count(el) {
    const from = +el.dataset.from || 0, to = +el.dataset.to, ms = +el.dataset.ms || 1500, d = +el.dataset.delay || 0;
    const suf = el.dataset.suffix || '';
    el.textContent = fmt(from) + suf;
    const t0 = performance.now() + d;
    (function st() {
      // performance.now(), not the frame time rAF passes in: only performance.now follows the film's clock
      const x = Math.max(0, Math.min(1, (performance.now() - t0) / ms));
      el.textContent = fmt(from + (to - from) * ease(x)) + suf;
      if (x < 1) requestAnimationFrame(st);
    })();
  }
  function fill(el) {
    const d = +el.dataset.delay || 0, ms = +el.dataset.ms || 1200, dir = el.dataset.dir || 'width';
    el.style.transition = 'none'; el.style[dir] = '0%';
    void el.offsetWidth;
    el.style.transition = `${dir} ${ms}ms cubic-bezier(.25,.8,.25,1) ${d}ms`;
    el.style[dir] = el.dataset.fill + '%';
  }

  // ---- the ground: sky layers (cross-faded per scene), stars, and the dotted Earth horizon ----
  document.body.insertAdjacentHTML('afterbegin',
    '<div id="sky"><i class="night"></i><i class="mid"></i><i class="late"></i><i class="dawn"></i><i class="finale"></i></div>' +
    '<div id="stars"></div><canvas id="horizon" aria-hidden="true"></canvas>');
  (function stars() {
    // a seeded sprinkle, so every filming run draws the same sky
    let s = 20261021;
    const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const n = TALL ? 70 : 84;
    let h = '';
    for (let i = 0; i < n; i++) {
      const x = rnd() * 100, y = Math.pow(rnd(), 1.2) * 80, sz = 1.8 + rnd() * 2.4 + (rnd() > 0.92 ? 2 : 0);
      const o = 0.5 + rnd() * 0.5, dur = 3 + rnd() * 5, dl = -rnd() * 8;
      const gold = rnd() > 0.8;
      h += `<i style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;--o:${o.toFixed(2)};animation-duration:${dur.toFixed(1)}s;animation-delay:${dl.toFixed(1)}s${gold ? ';background:#E8C37E' : ''}"></i>`;
    }
    document.getElementById('stars').innerHTML = h;
  })();

  // The Earth: the landing page's own land mask, as a curved band of fine dots along the bottom, turning very slowly.
  const horizon = (function () {
    const cv = document.getElementById('horizon'), ctx = cv.getContext('2d');
    const RAD = Math.PI / 180;
    const raw = atob(window.HF_LAND || ''), LAND = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) LAND[i] = raw.charCodeAt(i);
    const isLand = (lat, lon) => {
      const row = Math.min(359, Math.max(0, Math.floor((90 - lat) * 2))), col = ((Math.floor((lon + 180) * 2) % 720) + 720) % 720;
      return (LAND[row * 90 + (col >> 3)] & (0x80 >> (col & 7))) !== 0;
    };
    let W = 0, H = 0, R = 0, cx = 0, cy = 0, cap = 0, dpr = 1;
    let xs, ys, zs, town, n = 0;
    function build() {
      W = innerWidth; H = innerHeight;
      cap = TALL ? 400 : 310;                       // how much of the Earth shows above the bottom edge
      R = TALL ? W * 1.45 : W * 1.02;
      const glow = 110;
      cv.width = Math.round(W * dpr); cv.height = Math.round((cap + glow) * dpr);
      cv.style.width = W + 'px'; cv.style.height = cap + glow + 'px';
      cx = W / 2; cy = glow + R;
      const space = TALL ? 15 : 19;                 // dot spacing in px at the limb
      const total = Math.round((4 * Math.PI * R * R) / (space * space));
      const golden = Math.PI * (3 - Math.sqrt(5));
      const X = [], Y = [], Z = [], T = [];
      for (let i = 0; i < total; i++) {
        const y = 1 - (2 * (i + 0.5)) / total, r = Math.sqrt(1 - y * y), th = i * golden;
        const x = r * Math.cos(th), z = r * Math.sin(th);
        const lat = Math.asin(y) / RAD, lon = Math.atan2(x, z) / RAD;
        if (lat < -60 || !isLand(lat, lon)) continue;
        X.push(x); Y.push(y); Z.push(z);
        let hh = Math.sin(i * 12.9898) * 43758.5453; hh -= Math.floor(hh);
        T.push(hh < (lat > 8 && lat < 58 ? 0.05 : 0.02) ? 1 : 0);
      }
      xs = new Float32Array(X); ys = new Float32Array(Y); zs = new Float32Array(Z); town = new Uint8Array(T); n = X.length;
    }
    function draw(ms) {
      if (!n) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, cap + 110);
      // the night side of the planet, a touch bluer at the edge
      const body = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R);
      body.addColorStop(0, '#04060B'); body.addColorStop(0.9, '#070C1B'); body.addColorStop(1, '#0F1B3E');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      // the camera, as the landing's first screen has it, turning about 1.4 degrees a second
      const lon0 = -96 + ms * 0.0014, lat0 = -33;
      const cl = Math.cos(lon0 * RAD), sl = Math.sin(lon0 * RAD), ct = Math.cos(lat0 * RAD), st = Math.sin(lat0 * RAD);
      const dot = TALL ? 1.7 : 1.45;
      const buckets = [[], [], [], []];
      const lights = [];
      for (let i = 0; i < n; i++) {
        const x1 = xs[i] * cl - zs[i] * sl, z1 = xs[i] * sl + zs[i] * cl;
        const y2 = ys[i] * ct - z1 * st, z2 = ys[i] * st + z1 * ct;
        if (z2 <= 0.012) continue;
        const px = cx + x1 * R, py = cy - y2 * R;
        if (py > cap + 112 || py < 100 || px < -6 || px > W + 6) continue;
        if (town[i]) { lights.push(px, py); continue; }
        const b = z2 < 0.18 ? 0 : z2 < 0.36 ? 1 : z2 < 0.55 ? 2 : 3;
        buckets[b].push(px, py);
      }
      const alpha = [0.26, 0.45, 0.62, 0.78];
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = `rgba(244,240,230,${alpha[b]})`; ctx.beginPath();
        const a = buckets[b];
        for (let k = 0; k < a.length; k += 2) { ctx.moveTo(a[k] + dot, a[k + 1]); ctx.arc(a[k], a[k + 1], dot, 0, Math.PI * 2); }
        ctx.fill();
      }
      // towns: a few warm lights on the dark side
      ctx.fillStyle = 'rgba(232,195,126,.95)'; ctx.shadowColor = 'rgba(232,195,126,.9)'; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let k = 0; k < lights.length; k += 2) { ctx.moveTo(lights[k] + dot * 1.5, lights[k + 1]); ctx.arc(lights[k], lights[k + 1], dot * 1.5, 0, Math.PI * 2); }
      ctx.fill(); ctx.shadowBlur = 0;
      // the thin blue-white rim of the atmosphere
      const rim = ctx.createRadialGradient(cx, cy, R - 30, cx, cy, R + 100);
      rim.addColorStop(0, 'rgba(160,185,255,0)'); rim.addColorStop(0.23, 'rgba(176,200,255,.5)');
      rim.addColorStop(0.32, 'rgba(110,140,235,.2)'); rim.addColorStop(1, 'rgba(60,90,200,0)');
      ctx.fillStyle = rim; ctx.fillRect(0, 0, W, cap + 110);
    }
    function setup() { dpr = 1; build(); draw(0); }
    return { setup, draw };
  })();

  // ---- scenes ----
  let cur = null;
  window.play = function (id) {
    const next = document.getElementById('s-' + id);
    if (!next) return false;
    if (cur && cur !== next) { const old = cur; old.classList.remove('on'); old.classList.add('off'); setTimeout(() => old.classList.remove('off'), 400); }
    document.body.dataset.bg = next.dataset.bg || 'night';
    document.body.dataset.hz = next.dataset.hz || '0';
    // restart the scene's animations from the beginning
    next.classList.remove('on', 'off'); void next.offsetWidth; next.classList.add('on');
    next.querySelectorAll('[data-count]').forEach(count);
    next.querySelectorAll('[data-fill]').forEach(fill);
    if (window.onScene) window.onScene(id, next);
    cur = next;
    return true;
  };

  // HireFlow's mark: a dark jade tile with the bright rising line (Wordmark.tsx, viewBox 24)
  window.MARK = '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" rx="24" fill="#0C2A21"/><rect x="1" y="1" width="98" height="98" rx="23" fill="none" stroke="rgba(63,206,151,.28)" stroke-width="2"/>' +
    '<g transform="translate(18 18) scale(2.8333)"><path class="rise" d="M4 18 L9 7 L14 15 L20 6" fill="none" stroke="#3FCE97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  // Ava's seal, as AvaSeal.tsx draws it (night tokens: jade wax disc, brass ring and letter)
  window.SEAL = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#17805F"/><circle cx="50" cy="50" r="31" fill="none" stroke="#D9B876" stroke-width="6"/>' +
    '<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Fraunces, Georgia, serif" font-size="52" font-weight="700" fill="#D9B876">A</text></svg>';
  window.CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5 L10 17 L19 7" fill="none" stroke="#0C2A21" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.querySelectorAll('[data-mark]').forEach((e) => (e.innerHTML = MARK + e.innerHTML));
  document.querySelectorAll('[data-seal]').forEach((e) => (e.innerHTML = SEAL));
  document.querySelectorAll('[data-check]').forEach((e) => (e.innerHTML = CHECK));
  document.querySelectorAll('[data-checks]').forEach((e) => (e.innerHTML = `<i>${CHECK}</i><i>${CHECK}</i><i>${CHECK}</i>`));

  // ---- the finale: built from data-title (or ?title=), so every HireFlow video ends on the same moment ----
  const qt = new URLSearchParams(location.search).get('title');
  if (qt && document.getElementById('s-closing')) document.getElementById('s-closing').dataset.title = qt;
  document.querySelectorAll('.scene.finale').forEach((sec) => {
    sec.dataset.bg = 'finale'; sec.dataset.hz = '1';
    // a soft burst of gold light dots
    let fx = '<div class="fx"><div class="halo"></div><div class="ring"></div><div class="ring r2"></div>';
    const N = 46;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (i % 3) * 0.21, r = (TALL ? 380 : 520) + ((i * 37) % 5) * (TALL ? 90 : 130);
      const sz = 7 + ((i * 7) % 5) * 2.8, dl = (i % 6) * 30;
      fx += `<i class="dotb" style="--x:${Math.round(Math.cos(a) * r * (TALL ? 1 : 1.4))}px;--y:${Math.round(Math.sin(a) * r * (TALL ? 1.1 : 0.8))}px;--s:${sz.toFixed(1)}px;--dl:${dl}ms"></i>`;
    }
    fx += '</div>';
    const letters = [...'HireFlow'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
    let title = sec.dataset.title || '';
    let accent = sec.dataset.accent;
    if (title && accent == null) accent = title.split(' ').slice(-3).join(' ');
    if (title && accent && title.endsWith(accent)) title = `${title.slice(0, title.length - accent.length)}<em>${accent}</em>`;
    sec.innerHTML = fx + `<div class="stack"><div class="mark">${MARK}</div><div class="name">${letters}</div>` +
      (title ? `<div class="tl">${title}</div>` : '') +
      `<div class="url2"><span>hireflownow.com</span></div>` +
      `<div class="cta">Post a job free <svg viewBox="0 0 24 24"><path d="M5 12 H18 M12 6 L18 12 L12 18" fill="none" stroke="#14201B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>`;
  });
  function placeBurst() {
    document.querySelectorAll('.scene.finale').forEach((sec) => {
      const m = sec.querySelector('.mark').getBoundingClientRect();
      sec.style.setProperty('--cy', Math.round(m.top + m.height / 2) + 'px');
    });
  }

  // fonts first: the horizon and the burst position need the settled layout
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  horizon.setup();
  requestAnimationFrame(placeBurst);
  ready.then(() => requestAnimationFrame(placeBurst));
  // the Earth turns on the page clock; it only costs anything while it is in view
  (function loop() {
    if (document.body.dataset.hz === '1') horizon.draw(performance.now());
    requestAnimationFrame(loop);
  })();

  // ?show=<id> holds one scene for design checks
  const q = new URLSearchParams(location.search).get('show');
  if (q) window.play(q);
})();
