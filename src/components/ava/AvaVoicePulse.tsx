/**
 * AvaVoicePulse — Ava's seal, breathing with whoever is talking.
 *
 * The one place the retired orb did real work rather than decoration: in voice
 * mode it took `getIntensity` and pulsed with the live level, so you could see
 * that Ava had heard you. Deleting it without a replacement would have removed
 * feedback, not clutter.
 *
 * This keeps the signal and drops the WebGL. It is the seal — the mark Ava
 * already signs everything with — inside a halo whose scale and opacity track
 * the same 0–1 level the orb consumed, driven on rAF and written straight to
 * style so the pulse never re-renders React.
 *
 * Colours are the existing jade/brass tokens; nothing new is introduced.
 */
import { useEffect, useRef } from "react";
import AvaSeal from "@/components/ava/AvaSeal";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface AvaVoicePulseProps {
  /** Diameter of the seal in px. The halo extends beyond it. */
  size?: number;
  /** Live level, 0–1 — Ava's voice or the user's mic, whichever is louder. */
  getIntensity?: () => number;
  /** Dimmed until the session is actually live. */
  active?: boolean;
  className?: string;
}

export function AvaVoicePulse({ size = 96, getIntensity, active = true, className }: AvaVoicePulseProps) {
  const haloRef = useRef<HTMLSpanElement | null>(null);
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const getRef = useRef(getIntensity);
  getRef.current = getIntensity;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    // Eased follow, so a spiky mic reading doesn't make the halo jitter.
    let smoothed = 0;
    const tick = () => {
      const raw = Math.max(0, Math.min(1, getRef.current?.() ?? 0));
      smoothed += (raw - smoothed) * 0.18;
      const halo = haloRef.current;
      const ring = ringRef.current;
      if (halo) {
        halo.style.transform = `scale(${1 + smoothed * 0.42})`;
        halo.style.opacity = `${0.18 + smoothed * 0.5}`;
      }
      if (ring) {
        ring.style.transform = `scale(${1 + smoothed * 0.2})`;
        ring.style.opacity = `${0.28 + smoothed * 0.45}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span
      aria-hidden
      className={className}
      style={{
        position: "relative",
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        opacity: active ? 1 : 0.55,
        transition: "opacity .4s ease",
      }}
    >
      <span
        ref={haloRef}
        style={{
          position: "absolute",
          inset: "-22%",
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--jade) 0%, transparent 68%)",
          opacity: 0.18,
          pointerEvents: "none",
          willChange: "transform, opacity",
        }}
      />
      <span
        ref={ringRef}
        style={{
          position: "absolute",
          inset: "-6%",
          borderRadius: "50%",
          border: "1.5px solid var(--brass-line, var(--brass))",
          opacity: 0.28,
          pointerEvents: "none",
          willChange: "transform, opacity",
        }}
      />
      <AvaSeal size={Math.round(size * 0.66)} tilt={-5} />
    </span>
  );
}

export default AvaVoicePulse;
