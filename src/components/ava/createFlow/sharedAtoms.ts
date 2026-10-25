import { useEffect, useState } from "react";

/**
 * Split out of shared.tsx (react-refresh/only-export-components: that file
 * should export only components) — plain constants and a hook, none of
 * which shared.tsx's own components read internally today, so this is a
 * pure relocation. AvaCreateJob.tsx imports DISPLAY/FOCUS_CSS/STEPS/useWide
 * from here now instead of from shared.tsx.
 */

export const DISPLAY = "'Fraunces', Georgia, serif";

export const STEPS = ["Brief", "Follow-ups", "Rigor", "Ava builds", "Review plan", "Publish"] as const;

export type Accent = "brass" | "good" | "goodSoft";

export const ACCENT: Record<Accent, { tile: string; fg: string; line: string; edge: string }> = {
  brass: { tile: "hsl(var(--primary) / 0.14)", fg: "hsl(var(--ck-brass-bright))", line: "hsl(var(--primary))", edge: "hsl(var(--primary) / 0.3)" },
  good: { tile: "hsl(var(--ck-action) / 0.16)", fg: "hsl(var(--ck-action))", line: "hsl(var(--ck-action))", edge: "hsl(var(--ck-action) / 0.3)" },
  goodSoft: { tile: "hsl(var(--ck-action-bright) / 0.16)", fg: "hsl(var(--ck-action-bright))", line: "hsl(var(--ck-action-bright))", edge: "hsl(var(--ck-action-bright) / 0.3)" },
};

export const FOCUS_CSS = `
  .ava-flow input:focus, .ava-flow textarea:focus {
    border-color: hsl(var(--primary) / 0.6) !important;
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.16), 0 0 24px hsl(var(--primary) / 0.10) !important;
  }
`;

export function useWide() {
  const get = () => typeof window !== "undefined" && window.innerWidth >= 640;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const on = () => setWide(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}
