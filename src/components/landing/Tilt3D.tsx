import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

// Pointer-following 3D tilt for cards (desktop). Cheap GPU transform, no WebGL.
// Outer layer owns the perspective; inner layer is the rotated plane with
// preserve-3d so children can use translateZ() for real parallax depth.
// Falls back to flat on touch devices (no pointer hover).
interface Tilt3DProps {
  children: ReactNode;
  className?: string;
  max?: number;
  style?: CSSProperties;
}

export default function Tilt3D({ children, className, max = 7, style }: Tilt3DProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${px * max}deg) rotateX(${-py * max}deg)`;
  };
  const reset = () => {
    const el = ref.current;
    if (el) el.style.transform = "rotateY(0deg) rotateX(0deg)";
  };

  return (
    <div
      className={className}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={{ perspective: "900px", ...style }}
    >
      <div
        ref={ref}
        style={{
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform .35s cubic-bezier(.22,1,.36,1)",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
