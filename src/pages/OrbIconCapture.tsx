/**
 * OrbIconCapture — dev-only. Renders the REAL AvaOrb (three.js point-cloud) as the production
 * app-icon tile (treatment C — brighter jade), full-bleed at top-left so a headless screenshot
 * at window=px is the exact icon. Route: /preview/orb-icon?px=1024&shape=square|round&core=3200
 */
import { useSearchParams } from "react-router-dom";
import { AvaOrb } from "@/components/ava/AvaOrb";

const C_BG = "radial-gradient(ellipse 86% 76% at 32% 25%, #1f4634 0%, #0c1f17 58%, #060f0b 100%)";

export default function OrbIconCapture() {
  const [sp] = useSearchParams();
  const px = Number(sp.get("px") || 1024);
  const round = sp.get("shape") === "round";
  const orb = Math.round(px * Number(sp.get("orb") || 0.84));
  // Omit coreCount → AvaOrb auto-scales density by area, staying lush at large sizes.
  const core = sp.get("core") ? Number(sp.get("core")) : undefined;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: px,
        height: px,
        borderRadius: round ? Math.round(px * 0.225) : 0,
        background: C_BG,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        boxShadow: round ? `inset 0 0 0 ${Math.max(1, px / 340)}px rgba(230,194,122,0.18)` : "none",
      }}
    >
      <AvaOrb size={orb} coreCount={core} reflection={false} glow amp={0.24} flow={0.7} />
    </div>
  );
}
