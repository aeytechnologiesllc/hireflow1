import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

// Reliable scroll-reveal. The app shell scrolls inside a height-capped #root, not
// the window, which breaks framer-motion's whileInView (it leaves content stuck
// invisible). This binds an IntersectionObserver to the *actual* scroll ancestor
// so reveals fire correctly, with a safety fallback so content can never stay hidden.
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null; // fall back to the viewport
}

interface RevealProps {
  children: ReactNode;
  /** stagger delay in ms */
  delay?: number;
  /** initial translateY in px */
  y?: number;
  className?: string;
  style?: CSSProperties;
}

export default function Reveal({ children, delay = 0, y = 28, className, style }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const root = getScrollParent(el);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { root, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    io.observe(el);
    // Safety net: never leave content hidden if the observer somehow never fires.
    const t = window.setTimeout(() => setShown(true), 6000);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [shown]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${y}px)`,
        transition: `opacity 0.75s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.75s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
