import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

/**
 * The Analytics page's two pieces of motion (src/cockpit/analytics.css,
 * docs/ANALYTICS.md): a section that plays once when it comes into view, and
 * a number whose digits roll up to it.
 *
 * Both are finished pictures without motion: the styles draw the final state
 * by default, `.an-reveal` holds the start of the motion and `.in` releases
 * it. Someone who asks for less motion gets the final state at once.
 */

const DIGITS = Array.from({ length: 20 }, (_, i) => String(i % 10));

/**
 * A number that rolls to its value, one column per digit. When the value
 * changes while the page is open (a new applicant arrives), the columns roll
 * on from where they are. Read out as the plain number.
 */
export function RollingNumber({ value, className }: { value: number | string; className?: string }) {
  const text = String(value);
  const ref = useRef<HTMLSpanElement>(null);

  // Each digit rolls in a window as wide as the widest figure, then the
  // window settles to the digit it landed on (so a 1 leaves no gap beside
  // it). Measured in the number's own type, again once the fonts are in.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const size = () => {
      if (cancelled || !el.isConnected) return;
      const probe = document.createElement("span");
      probe.className = "an-odo-probe";
      el.appendChild(probe);
      const widths: number[] = [];
      let widest = 0;
      for (let d = 0; d < 10; d += 1) {
        probe.textContent = String(d);
        widths[d] = probe.getBoundingClientRect().width;
        widest = Math.max(widest, widths[d]);
      }
      el.removeChild(probe);
      if (!widest) return;
      el.querySelectorAll<HTMLElement>(".an-odo-d").forEach((cell) => {
        cell.style.setProperty("--w0", `${widest.toFixed(2)}px`);
        cell.style.setProperty("--w1", `${widths[Number(cell.dataset.digit)].toFixed(2)}px`);
      });
    };
    size();
    void document.fonts?.ready.then(size);
    window.addEventListener("resize", size);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", size);
    };
  }, [text]);

  let k = 0;
  return (
    <span ref={ref} className={className ? `an-odo ${className}` : "an-odo"} role="img" aria-label={text}>
      {Array.from(text).map((ch, i) => {
        if (ch < "0" || ch > "9") return <span key={i} aria-hidden>{ch}</span>;
        const order = k;
        k += 1;
        return (
          <span
            key={i}
            className="an-odo-d"
            data-digit={ch}
            aria-hidden
            style={{ ["--delay" as string]: `${(order * 0.09).toFixed(2)}s`, ["--dur" as string]: `${(1.25 + order * 0.28).toFixed(2)}s` } as CSSProperties}
          >
            <span className="an-odo-col" style={{ ["--to" as string]: 10 + Number(ch) } as CSSProperties}>
              {DIGITS.map((d, n) => (
                <span key={n}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A card that plays its motion once, the first time enough of it is on the
 * screen, and carries the light that follows the pointer.
 */
export function Reveal({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          watch.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [seen]);

  return (
    <section
      ref={ref}
      className={`an-reveal${seen ? " in" : ""}${className ? ` ${className}` : ""}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      {...rest}
    >
      {children}
    </section>
  );
}
