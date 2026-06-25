/**
 * Dev preview — tune the swirl Ava orb against the auth mockup.
 * Route: /orb-preview (remove before launch)
 */
import { Link } from "react-router-dom";
import { AvaOrb } from "@/components/ava/AvaOrb";

export default function OrbPreview() {
  return (
    <div
      className="min-h-[100dvh] overflow-x-hidden"
      style={{
        background: "#0a2019",
        color: "#eef6f1",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&family=Inter:wght@400;600;700&display=swap"
      />

      {/* Subtle constellation mesh */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(31,158,119,0.4) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(203,163,106,0.15) 0%, transparent 40%),
            linear-gradient(rgba(238,246,241,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(238,246,241,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 80px 80px, 80px 80px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <Link
          to="/"
          className="text-sm opacity-50 transition-opacity hover:opacity-90"
          style={{ color: "#eef6f1" }}
        >
          ← Back
        </Link>

        <p
          className="mt-6 text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: "#cba36a" }}
        >
          Orb prototype — swirl variant
        </p>

        {/* Desktop auth layout preview */}
        <div className="mt-10 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-center lg:items-start">
            <AvaOrb size={380} />
            <span
              className="mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em]"
              style={{
                borderColor: "rgba(203,163,106,0.35)",
                color: "#cba36a",
                background: "rgba(10,32,25,0.6)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "#1f9e77", boxShadow: "0 0 8px rgba(31,158,119,0.6)" }}
              />
              Employer Portal
            </span>
            <h1
              className="mt-4 text-center text-3xl leading-tight lg:text-left lg:text-4xl"
              style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 500 }}
            >
              Hiring, handled by Ava.
            </h1>
          </div>

          {/* Placeholder card — shows scale next to orb */}
          <div
            className="rounded-2xl border p-8"
            style={{
              borderColor: "rgba(203,163,106,0.22)",
              background: "rgba(14,42,34,0.85)",
            }}
          >
            <p className="text-sm opacity-50">Auth card placeholder</p>
            <h2
              className="mt-4 text-2xl"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              Welcome back
            </h2>
            <p className="mt-2 text-sm opacity-55">Sign in to manage your hiring</p>
            <div
              className="mt-6 h-12 rounded-xl"
              style={{
                background: "linear-gradient(135deg, #cba36a, #e6c184)",
              }}
            />
          </div>
        </div>

        {/* Small-size verification row (loading orb is 120–140) */}
        <div className="mt-20" data-testid="small-orb-row">
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-[0.2em] opacity-40">
            Small sizes — 120 / 140 / 160 / 188
          </p>
          <div className="flex flex-wrap items-end justify-center gap-12">
            <AvaOrb size={120} reflection={false} />
            <AvaOrb size={140} reflection={false} />
            <AvaOrb size={160} reflection={false} />
            <AvaOrb size={188} reflection={false} />
          </div>
        </div>

        {/* Mobile layout preview */}
        <div className="mx-auto mt-20 max-w-sm">
          <p
            className="mb-6 text-center text-xs font-bold uppercase tracking-[0.2em] opacity-40"
          >
            Mobile layout
          </p>
          <div className="flex flex-col items-center">
            <AvaOrb size={220} />
            <div
              className="mt-8 w-full rounded-2xl border p-6"
              style={{
                borderColor: "rgba(203,163,106,0.22)",
                background: "rgba(14,42,34,0.85)",
              }}
            >
              <h2
                className="text-xl"
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              >
                Welcome back
              </h2>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
