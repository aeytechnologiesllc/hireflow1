/**
 * OrbLoader — the standard, premium full-screen loading state.
 *
 * Centers a medium <AvaOrb> (ORB_SIZE.md) on the Deep Jade background. Used for
 * route/lazy fallbacks and "preparing…" moments so the loading orb is always an
 * appropriate, brand-consistent size — never a tiny spinner.
 *
 * The orb is reduced-motion gated inside <AvaOrb> itself; it renders a static,
 * shaded mesh when motion is reduced.
 */
import { AvaOrb } from "@/components/ava/AvaOrb";
import { ORB_SIZE } from "@/components/ava/orbSizes";

export function OrbLoader({ message }: { message?: string }) {
  return (
    <div
      className="orb-loader-fade min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: "hsl(var(--background))" }}
    >
      <AvaOrb size={ORB_SIZE.md} reflection={false} amp={0.24} flow={0.6} />
      {message && (
        <p
          className="text-sm font-medium text-center"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export default OrbLoader;
