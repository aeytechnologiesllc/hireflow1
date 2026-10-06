import type { ReactNode } from "react";
import type { ApplicantScore, AvaSuggestion, HeaderLine } from "../lib/applicantProfile";
import { scoreColor } from "../lib/applicantProfile";

/**
 * The desktop profile's header band (docs/APPLICANT-PROFILE.md), no box:
 * the avatar (a live dot while they are active), the name and the status
 * chip, one meta line (job, country, applied when, the live line), and on
 * the right "Ava suggests" and the big score. A hairline under it.
 */

const LINE_TONE: Record<HeaderLine["tone"], string> = {
  jade: "var(--jade-soft-fg)",
  amber: "var(--amber-fg)",
  crit: "var(--crit)",
  muted: "var(--ink-3)",
};

/** The suggestion's box: a solid tint of its tone over the page's ground
 *  (no translucent panel), the words in the tone's readable shade. */
const SUGGEST_STYLE: Record<AvaSuggestion["tone"], { background: string; color: string }> = {
  jade: { background: "color-mix(in srgb, var(--jade) 14%, var(--ground))", color: "var(--jade-soft-fg)" },
  amber: { background: "color-mix(in srgb, var(--amber-fg) 14%, var(--ground))", color: "var(--amber-fg)" },
  crit: { background: "color-mix(in srgb, var(--crit) 13%, var(--ground))", color: "var(--crit)" },
};

export function ApplicantHeaderBand({
  name,
  initials,
  avatarUrl,
  liveNow,
  chip,
  role,
  country,
  applied,
  line,
  suggestion,
  score,
}: {
  name: string;
  initials: string;
  avatarUrl: string | null;
  liveNow: boolean;
  /** The chip beside the name, or another pill ("Filling in the form"). */
  chip: ReactNode;
  role: string;
  country: string | null;
  applied: string;
  line: HeaderLine | null;
  suggestion: AvaSuggestion | null;
  score: ApplicantScore;
}) {
  return (
    <section className="ckp-head" aria-label={`${name}, ${role}`}>
      <span className="relative shrink-0 self-start sm:self-center">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="block h-16 w-16 rounded-full object-cover" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }} />
        ) : (
          <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full text-[20px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            {initials}
          </span>
        )}
        {liveNow && (
          <span
            role="img"
            aria-label="Active now"
            className="absolute right-[2px] top-[2px] block h-3 w-3 rounded-full"
            style={{ background: "var(--jade-bright)", boxShadow: "0 0 0 3px var(--ground)" }}
          />
        )}
      </span>

      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-display text-[34px] leading-[1.1]" style={{ color: "var(--ink)", fontWeight: 500, letterSpacing: "-0.01em" }}>
            {name}
          </span>
          {chip}
        </h1>
        <p className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[13.5px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
          <span className="font-medium" style={{ color: "var(--ink-2)" }}>
            {role}
          </span>
          {country && <span>{country}</span>}
          <span>{applied}</span>
          {line && <span style={{ color: LINE_TONE[line.tone] }}>{line.text}</span>}
        </p>
      </div>

      <div className="flex items-center gap-[18px]">
        {suggestion && (
          <p className="max-w-[230px] rounded-[12px] px-3.5 py-2.5 text-[13px] leading-[1.35]" style={SUGGEST_STYLE[suggestion.tone]}>
            <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.12em]">Ava suggests</span>
            {suggestion.text}
          </p>
        )}
        {score.value == null ? (
          // Not scored yet: said in words. A 58px dash drew a thin rule that
          // read as a stray divider, not as a figure.
          <span className="ckp-score shrink-0 whitespace-nowrap text-right text-[15px]" style={{ color: "var(--ink-3)" }}>
            Not scored yet
          </span>
        ) : (
          <div className="ckp-score shrink-0 text-right">
            <span className="ck-num block whitespace-nowrap text-[58px] leading-[0.9]" style={{ color: scoreColor(score.band) }}>
              {score.value}
              <span className="ml-1 font-sans text-[18px] tracking-normal" style={{ color: "var(--ink-3)" }}>
                /100
              </span>
            </span>
            <span className="mt-1.5 block text-[12px]" style={{ color: "var(--ink-3)" }}>
              {score.soFar ? "so far" : "final score"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export default ApplicantHeaderBand;
