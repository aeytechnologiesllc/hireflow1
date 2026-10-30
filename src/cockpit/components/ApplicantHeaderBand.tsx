import { useEffect, useState, type ReactNode } from "react";
import type { ApplicantScore, AvaSuggestion, HeaderLine } from "../lib/applicantProfile";
import { scoreColor } from "../lib/applicantProfile";
import { initialsTint } from "../lib/initialsTint";

/**
 * The desktop profile's header band (docs/APPLICANT-PROFILE.md), no box:
 * the avatar (a live dot while they are active), the name and the status
 * chip, one meta line (job, country, applied when, the live line), and on
 * the right "Ava suggests" and the big score. A hairline under it.
 */

const LINE_TONE: Record<HeaderLine["tone"], string> = {
  good: "var(--good-fg)",
  amber: "var(--amber-fg)",
  crit: "var(--crit)",
  muted: "var(--ink-3)",
};

/** How long "Ava suggests" stays up after an applicant's page opens. */
export const SUGGESTION_SHOWN_MS = 8000;

/** The suggestion's box: a solid tint of its tone over the page's ground
 *  (no translucent panel), the words in the tone's readable shade. */
const SUGGEST_STYLE: Record<AvaSuggestion["tone"], { background: string; color: string }> = {
  good: { background: "color-mix(in srgb, var(--good) 14%, var(--ground))", color: "var(--good-fg)" },
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
  suggestKey,
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
  /** Whose page this is (the application's id): the suggestion comes up afresh for each one. */
  suggestKey?: string | null;
  score: ApplicantScore;
}) {
  return (
    <section className="ckp-head" aria-label={`${name}, ${role}`}>
      <span className="relative shrink-0 self-start sm:self-center">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="block h-16 w-16 rounded-full object-cover" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }} />
        ) : (
          <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full border text-[20px] font-semibold" style={initialsTint(initials)}>
            {initials}
          </span>
        )}
        {liveNow && (
          <span
            role="img"
            aria-label="Active now"
            className="absolute right-[2px] top-[2px] block h-3 w-3 rounded-full"
            style={{ background: "var(--action-bright)", boxShadow: "0 0 0 3px var(--ground)" }}
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

      <div className="ckp-headright flex items-center gap-[18px]">
        {suggestion && <Suggestion suggestion={suggestion} openedKey={suggestKey ?? name} />}
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

/**
 * "Ava suggests", beside the score. The owner, 2026-10-09: "every time the
 * page loads, it should pop up, but then it should kind of disappear after
 * some time. Shouldn't stay there."
 *
 * So it comes up when an applicant's page opens, stays for
 * SUGGESTION_SHOWN_MS, and fades out of the way. Its place is kept, so
 * nothing in the header moves, and it is back for as long as the pointer is
 * over that side of the header. It is only ever faded, never removed: a
 * screen reader still reads it.
 */
function Suggestion({ suggestion, openedKey }: { suggestion: AvaSuggestion; openedKey: string }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setGone(false);
    const timer = window.setTimeout(() => setGone(true), SUGGESTION_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [openedKey, suggestion.text]);
  return (
    // Keyed by whose page it is, so it pops up again for the next applicant.
    <p
      key={openedKey}
      className="ckp-suggest max-w-[230px] rounded-[12px] px-3.5 py-2.5 text-[13px] leading-[1.35]"
      style={SUGGEST_STYLE[suggestion.tone]}
      data-ava-suggests
      data-gone={gone ? "" : undefined}
    >
      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.12em]">Ava suggests</span>
      {suggestion.text}
    </p>
  );
}
