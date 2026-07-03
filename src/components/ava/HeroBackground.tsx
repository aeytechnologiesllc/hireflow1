/**
 * HeroBackground — the brand's premium Deep Jade ambient background, ported from
 * the marketing landing hero (`public/landing.html`).
 *
 * The landing hero layers (1) a slow jade aurora and (2) a faint drifting
 * constellation of mint particles with thin connecting lines. This component
 * reproduces that same look as a self-contained, GPU-friendly React layer so
 * other surfaces (e.g. the Ava create-job flow) feel brighter, smoother, and
 * consistent with the brand — instead of a flat checkered grid.
 *
 * Design notes:
 *  - Aurora = pure CSS transform/opacity on radial-gradient blobs (GPU-composited,
 *    no blur filters, no WebGL) — so it can coexist with the WebGL <AvaOrb> on the
 *    same page without burning a second GL context.
 *  - Constellation = ONE lightweight 2D canvas (~half-res, throttled to ~30fps,
 *    paused when the tab is hidden) — cheap and subtle.
 *  - Reduced-motion: both the aurora animation and the canvas are disabled; a
 *    static jade glow remains so the surface still looks premium.
 *  - Renders BEHIND content (z-0) and is pointer-events:none. Callers keep their
 *    content at z-10+. A soft top/bottom vignette protects text contrast.
 */
import { useEffect, useRef } from "react";

const STYLE = `
  .hf-hero-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
  .hf-hero-bg--contained { position: absolute; }
  .hf-hero-bg__aurora { position: absolute; inset: 0; }
  .hf-hero-bg__aurora::before,
  .hf-hero-bg__aurora::after { content: ""; position: absolute; border-radius: 50%; }
  .hf-hero-bg__aurora::before {
    top: -26%; left: -12%; width: 64vw; height: 64vw; max-width: 820px; max-height: 820px;
    background: radial-gradient(circle at 50% 50%,
      hsl(152 46% 24% / 0.46) 0%,
      hsl(152 44% 18% / 0.18) 38%,
      transparent 68%);
    animation: hf-hero-a 26s ease-in-out infinite;
  }
  .hf-hero-bg__aurora::after {
    bottom: -32%; right: -16%; width: 58vw; height: 58vw; max-width: 720px; max-height: 720px;
    background: radial-gradient(circle at 50% 50%,
      hsl(160 42% 22% / 0.34) 0%,
      hsl(38 46% 30% / 0.10) 42%,
      transparent 70%);
    animation: hf-hero-b 32s ease-in-out infinite;
  }
  /* a third, brighter jade core glow up top — gives the "brighter" hero feel */
  .hf-hero-bg__glow {
    position: absolute; top: -18%; left: 50%; transform: translateX(-50%);
    width: 70vw; height: 46vw; max-width: 900px; max-height: 560px;
    background: radial-gradient(ellipse at 50% 50%,
      hsl(152 50% 30% / 0.30) 0%,
      hsl(152 44% 20% / 0.10) 45%,
      transparent 72%);
  }
  .hf-hero-bg__canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  /* vignette to keep foreground content readable */
  .hf-hero-bg__veil {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 120% 80% at 50% 50%, transparent 30%, hsl(var(--background) / 0.55) 100%),
      linear-gradient(180deg, hsl(var(--background) / 0.30) 0%, transparent 22%, transparent 78%, hsl(var(--background) / 0.40) 100%);
  }
  @keyframes hf-hero-a {
    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
    50%      { transform: translate3d(6%, 4%, 0) scale(1.12); }
  }
  @keyframes hf-hero-b {
    0%, 100% { transform: translate3d(0, 0, 0) scale(1.05); }
    50%      { transform: translate3d(-5%, -4%, 0) scale(0.94); }
  }
  @media (prefers-reduced-motion: reduce) {
    .hf-hero-bg__aurora::before,
    .hf-hero-bg__aurora::after { animation: none !important; }
  }
`;

export function HeroBackground({ className, contained = false }: { className?: string; contained?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COUNT = 48;
    const SCALE = 0.5; // render at half-res, stretch via CSS — cheap + soft
    const LINK_SQ = 100 * 100;
    let W = 0;
    let H = 0;
    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const particles: P[] = [];

    const seed = () => {
      particles.length = 0;
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: Math.random() * 1.4 + 0.5,
          a: Math.random() * 0.3 + 0.1,
        });
      }
    };

    const resize = () => {
      const rect = contained ? rootRef.current?.getBoundingClientRect() : null;
      const nextW = Math.max(1, Math.floor((rect?.width || window.innerWidth) * SCALE));
      const nextH = Math.max(1, Math.floor((rect?.height || window.innerHeight) * SCALE));
      const prevW = W;
      const prevH = H;
      W = canvas.width = nextW;
      H = canvas.height = nextH;
      if (particles.length === 0 || prevW <= 2 || prevH <= 2) {
        seed();
      } else if (prevW !== W || prevH !== H) {
        for (const p of particles) {
          p.x = (p.x / prevW) * W;
          p.y = (p.y / prevH) * H;
        }
      }
    };
    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    if (contained && rootRef.current) ro.observe(rootRef.current);

    let raf = 0;
    let last = 0;
    let tabVisible = document.visibilityState === "visible";
    let inView = true;
    const onVis = () => {
      tabVisible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    const observeTarget = rootRef.current;
    if (observeTarget) io.observe(observeTarget);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!tabVisible || !inView) return;
      if (now - last < 33) return; // ~30fps throttle
      last = now;

      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
        ctx.fillStyle = `rgba(159,231,201,${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(159,231,201,0.045)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_SQ) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
    };
  }, [contained]);

  return (
    <div
      ref={rootRef}
      className={`hf-hero-bg${contained ? " hf-hero-bg--contained" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <style>{STYLE}</style>
      <div className="hf-hero-bg__glow" />
      <div className="hf-hero-bg__aurora" />
      <canvas ref={canvasRef} className="hf-hero-bg__canvas" />
      <div className="hf-hero-bg__veil" />
    </div>
  );
}

export default HeroBackground;
