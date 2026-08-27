/**
 * BrandLoader — the one loading moment, everywhere.
 *
 * The rising line draws itself inside the jade tile, glints, and draws again:
 * applications come in flat, Ava lifts the ones worth your time — the logo
 * telling its own story while you wait. Fully token-driven, so it is ivory by
 * Day and ink by Night, and correct on candidate surfaces too.
 *
 * Replaces two loaders that predated the design: a WebGL orb on hardcoded
 * old-jade (#0a2019) at sign-in, and a lone seal breathing on the route
 * fallback. Reduced motion: the finished mark, no animation.
 */
import { type ReactNode } from "react";

export function BrandLoader({
  message,
  children,
}: {
  message?: string;
  /** Optional slot under the mark — AuthLoadingScreen puts its cycling copy here. */
  children?: ReactNode;
}) {
  return (
    <div
      className="hf-loader flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6"
      style={{ background: "var(--ground, #F0EBDF)", color: "var(--ink, #14201B)" }}
    >
      <style>{`
        .hf-loader .tile {
          width: 64px; height: 64px; border-radius: 14px;
          background: var(--slab, #0C2A21);
          box-shadow: var(--shadow-md, 0 10px 22px -14px rgba(20,32,27,.34));
          display: flex; align-items: center; justify-content: center;
        }
        .hf-loader .rise {
          stroke-dasharray: 1; stroke-dashoffset: 1;
          animation: hf-rise-draw 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes hf-rise-draw {
          0%        { stroke-dashoffset: 1;  opacity: 1; }
          42%, 74%  { stroke-dashoffset: 0;  opacity: 1; }
          88%, 100% { stroke-dashoffset: 0;  opacity: 0; }
        }
        .hf-loader .name {
          font-family: Fraunces, Georgia, serif; font-weight: 600;
          font-size: 21px; letter-spacing: -0.01em;
          animation: hf-name-breathe 2.4s ease-in-out infinite;
        }
        @keyframes hf-name-breathe { 0%, 100% { opacity: 0.85; } 55% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .hf-loader .rise { animation: none; stroke-dashoffset: 0; }
          .hf-loader .name { animation: none; }
        }
      `}</style>

      <div className="flex items-center gap-4">
        <div className="tile">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              className="rise"
              d="M4 18 L9 7 L14 15 L20 6"
              pathLength={1}
              stroke="var(--jade-bright, #3FCE97)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="name">HireFlow</span>
      </div>

      {message && (
        <p className="text-center text-sm font-medium" style={{ color: "var(--ink-3, #5C655E)" }}>
          {message}
        </p>
      )}
      {children}
    </div>
  );
}

export default BrandLoader;
