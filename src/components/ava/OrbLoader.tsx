/**
 * OrbLoader — the standard full-screen loading state.
 *
 * Ava's seal, centred, breathing slowly. Kept at badge scale on purpose: this
 * is a held moment, not a brand splash. Named OrbLoader still because every
 * lazy route imports it; the orb it used to show is retired.
 *
 * The breathing is gated by prefers-reduced-motion in cockpit.css.
 */
import AvaSeal from "@/components/ava/AvaSeal";

export function OrbLoader({ message }: { message?: string }) {
  return (
    <div
      className="orb-loader-fade flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6"
      style={{ background: "hsl(var(--background))" }}
    >
      <span className="ck-seal-breathe">
        <AvaSeal size={44} />
      </span>
      {message && (
        <p className="text-center text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
          {message}
        </p>
      )}
    </div>
  );
}

export default OrbLoader;
