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
 * ONE screen from the start screen to the page (2026-10-31, the owner: "a
 * black bar ... find out if there's only one loading screen"). Opening the
 * app used to show three in turn (index.html's seal, AuthLoadingScreen with
 * its messages, then the lazy-page fallback), each pressing the seal again
 * from a different place, and AuthLoadingScreen painted its ground only in a
 * column the width of its words, over a see-through overlay. Now:
 *   - it covers the whole viewport with the ground, itself (fixed, inset 0);
 *   - the seal sits at the viewport's centre, 64 px, exactly where
 *     index.html's start screen draws it, and the words hang under it, so
 *     nothing moves when one loader takes over from another;
 *   - the stamp plays once per page load: the start screen plays it, and a
 *     loader that takes over mid-stamp carries on from the same moment
 *     (STAMP_FROM, read from the start screen's own animation); every later
 *     loader shows the seal still;
 *   - the words fade in only the first time; a loader with no message of its
 *     own keeps the one just shown (the lazy-page fallback after
 *     AuthLoadingScreen), so the message does not blink away.
 *
 * The thin line is the only loop, and the loader is on screen only while
 * something loads (scripts/guards/no-endless-animations.mjs allows it here).
 * Reduced motion: the seal and the line, both still.
 */
import { useEffect, useState, type ReactNode } from "react";
import { SealMark } from "@/cockpit/components/Wordmark";

const STAMP_DELAY = 0.1; // s, as index.html's start screen
const STAMP_LENGTH = 0.6; // s

/** When the start screen's stamp began (document timeline, ms), read while it is still on the page. */
const STAMP_FROM: number | null = (() => {
  if (typeof document === "undefined") return null;
  const boot = document.querySelector("#hf-boot svg");
  if (!boot) return null;
  const started = boot.getAnimations?.()[0]?.startTime;
  return typeof started === "number" ? started : performance.now();
})();

/** What this page load has shown already. */
const shown = { seal: STAMP_FROM !== null, words: false, message: "", messageGoneAt: 0 };

export function BrandLoader({
  message,
  children,
}: {
  message?: string;
  /** Optional slot under the message. */
  children?: ReactNode;
}) {
  // Decided once, on the first render: carry on the start screen's stamp, play it, or none.
  const [stamp] = useState<string | null>(() => {
    if (!shown.seal) return `${STAMP_DELAY}s`;
    if (STAMP_FROM === null) return null;
    const into = (performance.now() - STAMP_FROM) / 1000;
    return into < STAMP_DELAY + STAMP_LENGTH ? `${STAMP_DELAY - into}s` : null;
  });
  const [fadeWords] = useState(() => !shown.words);
  // A loader with no message of its own keeps the one shown just before it.
  const [kept] = useState(() => (!message && Date.now() - shown.messageGoneAt < 1500 ? shown.message : ""));
  const said = message || kept;

  useEffect(() => {
    shown.seal = true;
    shown.words = true;
  }, []);
  useEffect(() => {
    if (!said) return;
    shown.message = said;
    return () => {
      shown.messageGoneAt = Date.now();
    };
  }, [said]);

  return (
    <div
      className="hf-loader"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "var(--ground, #DEE3D5)",
        color: "var(--ink, #1D3329)",
      }}
    >
      <style>{`
        .hf-loader .press {
          position: absolute; left: 50%; top: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px;
          transform-origin: 50% 50%;
          filter: drop-shadow(-1px 3px 3px rgba(10, 40, 28, 0.28));
        }
        .hf-loader .press.stamp { animation: hf-seal-press ${STAMP_LENGTH}s cubic-bezier(0.2, 0.9, 0.3, 1.2) 1 both; }
        @keyframes hf-seal-press {
          0%   { transform: scale(1.4);  opacity: 0; }
          55%  { transform: scale(0.95); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        .hf-loader .words {
          position: absolute; left: 0; right: 0; top: calc(50% + 44px);
          display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 0 24px;
        }
        .hf-loader .words.fade { animation: hf-loader-words 0.35s ease-out 0.25s 1 both; }
        @keyframes hf-loader-words { from { opacity: 0; } to { opacity: 1; } }
        .hf-loader .name {
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
        .hf-loader .said { min-height: 20px; margin: 2px 0 0; text-align: center; font-size: 14px; font-weight: 500; color: var(--ink-3, #4B5D53); }
        @media (prefers-reduced-motion: reduce) {
          .hf-loader .press.stamp, .hf-loader .words.fade { animation: none; }
          .hf-loader .line i { animation: none; transform: translateX(75%); }
        }
      `}</style>

      <span className={stamp ? "press stamp" : "press"} style={stamp ? { animationDelay: stamp } : undefined}>
        <SealMark size={64} />
      </span>
      <div className={fadeWords ? "words fade" : "words"}>
        <span className="name font-display">HireFlow</span>
        <span className="line" aria-hidden="true">
          <i />
        </span>
        <p className="said">{said}</p>
        {children}
      </div>
    </div>
  );
}

export default BrandLoader;
