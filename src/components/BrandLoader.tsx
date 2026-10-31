/**
 * BrandLoader — the one loading moment, everywhere.
 *
 * The green seal (the logo since 2026-10-31; SealMark in Wordmark.tsx) is
 * pressed once, a short stamp, and then stays still; under it the name, a
 * thin line that slides gently while the page arrives, and the message. Calm
 * on purpose: no glow, nothing that draws itself again and again. The seal
 * keeps the wax's own colours in both themes; the ground and the words follow
 * the theme's tokens, so it is sage paper by Day and warm ink by Night, and
 * correct on candidate surfaces too. The fallbacks are Day's (Sage paper),
 * the theme the app opens in.
 *
 * The thin line is the only loop, and the loader is on screen only while
 * something loads (scripts/guards/no-endless-animations.mjs allows it here).
 * Reduced motion: the seal and the line, both still.
 */
import { type ReactNode } from "react";
import { SealMark } from "@/cockpit/components/Wordmark";

export function BrandLoader({
  message,
  children,
}: {
  message?: string;
  /** Optional slot under the message. */
  children?: ReactNode;
}) {
  return (
    <div
      className="hf-loader flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6"
      style={{ background: "var(--ground, #DEE3D5)", color: "var(--ink, #1D3329)" }}
    >
      <style>{`
        .hf-loader .press {
          display: block; transform-origin: 50% 50%;
          filter: drop-shadow(-1px 3px 3px rgba(10, 40, 28, 0.28));
          animation: hf-seal-press 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) 0.1s 1 both;
        }
        @keyframes hf-seal-press {
          0%   { transform: scale(1.4);  opacity: 0; }
          55%  { transform: scale(0.95); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        .hf-loader .name {
          margin-top: 4px;
          font-size: 21px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.15;
        }
        .hf-loader .line {
          position: relative; width: 120px; height: 2px; border-radius: 2px; overflow: hidden;
          background: var(--line, #C4CCBB);
        }
        .hf-loader .line i {
          position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 2px;
          background: currentColor; opacity: 0.6;
          transform: translateX(-110%);
          animation: hf-loader-line 1.6s cubic-bezier(0.45, 0, 0.25, 1) 0.4s infinite;
        }
        @keyframes hf-loader-line { from { transform: translateX(-110%); } to { transform: translateX(260%); } }
        @media (prefers-reduced-motion: reduce) {
          .hf-loader .press { animation: none; }
          .hf-loader .line i { animation: none; transform: translateX(75%); }
        }
      `}</style>

      <span className="press">
        <SealMark size={64} />
      </span>
      <span className="name font-display">HireFlow</span>
      <span className="line" aria-hidden="true">
        <i />
      </span>

      {message && (
        <p className="mt-2 text-center text-sm font-medium" style={{ color: "var(--ink-3, #4B5D53)" }}>
          {message}
        </p>
      )}
      {children}
    </div>
  );
}

export default BrandLoader;
