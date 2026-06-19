// Single source of truth for the user's reduced-motion preference at runtime.
// CSS @media handles CSS-driven animation; this gates the JS / WebGL / framer-motion
// paths that a CSS media query can't reach.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
