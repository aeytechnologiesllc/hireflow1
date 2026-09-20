/**
 * The employer cockpit's trial widget fabricated a countdown (found
 * 2026-09-17). Every real free-tier subscription is created with
 * trial_end: null and never expires (get-subscription/index.ts,
 * migration 20260904110000_free_tier_open) — so
 * buildAccountFromProfile's `trialDaysLeft ?? 14` and its literal
 * "Trial" end-date fallback (src/cockpit/lib/mappers.ts) fired for
 * every real employer, not just an edge case. showcaseSource.ts's
 * fetchShowcaseAccount hardcoded the same 14 / "Trial" pair directly.
 * Shell.tsx's TrialBadge and More.tsx's account-card chip and trial
 * card rendered those fabricated values gated only on `showTrialAccess`
 * (mode === "showcase" || isTrialing) — isTrialing is true regardless
 * of whether trial_end is set, so the gate never actually protected
 * against a missing end date.
 *
 * Fixed by removing the widget entirely: buildAccountFromProfile and
 * fetchShowcaseAccount now return only { name, initials }; neither
 * Shell.tsx nor More.tsx renders any trial countdown or reads
 * showTrialAccess. This guard keeps all of that from quietly coming
 * back — whether as the same hardcoded fallback, or as a revived
 * widget gated on isTrialing/showTrialAccess instead of a real,
 * non-null end date.
 */
export default [
  {
    id: "no-trial-countdown-fabrication",
    why:
      "buildAccountFromProfile (src/cockpit/lib/mappers.ts) and fetchShowcaseAccount " +
      "(src/cockpit/data/showcaseSource.ts) must never invent a numeric trial-days fallback " +
      "or a literal \"Trial\" end-date string, and no cockpit surface may render trial-countdown " +
      "copy gated on isTrialing/showTrialAccess alone, since that is true even when there is no " +
      "real end date.",
    run: async ({ read }) => {
      const bad = [];

      const mappers = (await read("src/cockpit/lib/mappers.ts")) ?? "";
      const fn = (mappers.match(/export function buildAccountFromProfile\([\s\S]*?\n}/) ?? [""])[0];
      if (!fn) {
        bad.push("buildAccountFromProfile is missing from src/cockpit/lib/mappers.ts");
      } else {
        if (/trialDaysLeft/.test(fn)) bad.push("buildAccountFromProfile still references trialDaysLeft");
        if (/trialEnds/.test(fn)) bad.push("buildAccountFromProfile still references trialEnds");
        if (/\?\?\s*14\b/.test(fn)) bad.push("buildAccountFromProfile has a hardcoded `?? 14` trial-days fallback");
        if (/"Trial"/.test(fn)) bad.push('buildAccountFromProfile has a literal "Trial" end-date fallback');
      }

      const showcase = (await read("src/cockpit/data/showcaseSource.ts")) ?? "";
      const showcaseFn = (showcase.match(/export async function fetchShowcaseAccount\([\s\S]*?\n}/) ?? [""])[0];
      if (!showcaseFn) {
        bad.push("fetchShowcaseAccount is missing from src/cockpit/data/showcaseSource.ts");
      } else {
        if (/trialDaysLeft\s*:\s*14/.test(showcaseFn)) bad.push("fetchShowcaseAccount hardcodes trialDaysLeft: 14");
        if (/trialEnds\s*:\s*["']Trial["']/.test(showcaseFn)) bad.push('fetchShowcaseAccount hardcodes trialEnds: "Trial"');
      }

      for (const file of ["src/cockpit/Shell.tsx", "src/cockpit/pages/More.tsx"]) {
        const src = (await read(file)) ?? "";
        if (/days left/i.test(src) || /trial ends/i.test(src)) {
          bad.push(
            `${file} renders trial-countdown copy ("days left" / "Trial ends") — a revived widget ` +
              "must gate on a real, non-null end date, not on isTrialing/showTrialAccess alone",
          );
        }
        if (/showTrialAccess/.test(src)) {
          bad.push(
            `${file} reads showTrialAccess — that flag is true for every free-tier employer ` +
              "regardless of whether a real trial end date exists",
          );
        }
      }

      const cockpitData = (await read("src/cockpit/hooks/useCockpitData.ts")) ?? "";
      if (/showTrialAccess/.test(cockpitData)) {
        bad.push(
          'useCockpitData.ts still computes showTrialAccess (mode === "showcase" || isTrialing) — ' +
            "isTrialing alone does not mean a real end date exists",
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
