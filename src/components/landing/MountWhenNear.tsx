import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getScrollParent } from "@/lib/scrollParent";

// Mounts its children only once they scroll near the viewport — used to defer creating
// heavy WebGL contexts (e.g. the below-the-fold CTA orb) until they're actually needed,
// so a phone doesn't hold every 3D context live at initial page load. Mounts once and
// keeps mounted (no churn on scroll-away).
interface MountWhenNearProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  rootMargin?: string;
}

export default function MountWhenNear({ children, className, style, rootMargin = "350px" }: MountWhenNearProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const root = getScrollParent(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { root, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, rootMargin]);

  return (
    <div ref={ref} className={className} style={style}>
      {show ? children : null}
    </div>
  );
}
