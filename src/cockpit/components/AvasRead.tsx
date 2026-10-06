import { useState, type ReactNode } from "react";
import { AlertCircle, Play } from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import { CountUp } from "./CountUp";
import type { Candidate } from "../data";
import { weighedPhrase, type AssessmentRecord } from "../lib/assessmentRecord";
import { avaProse, clip, firstName, interviewMinutes, pullQuote, transcriptOf } from "../lib/avaProse";
import { scorecardWhy } from "../lib/applicantProfile";
import { ProfileSection } from "./ProfileSection";

/**
 * Ava's letterhead: brass rule, her mark, the score, and her working — the
 * candidate's own words from the voice interview (with the recording when
 * there is one), what she weighed, whether the score is worth raising, and
 * every flag she raised. Lifted out of the Applicants panel so the full
 * profile reads the same card.
 *
 * Every value comes off the application record. Where the record is silent —
 * no transcript, no quiz, no resume — the element is left out rather than
 * filled in.
 */

/** The fields of the application row this card reads. */
export interface AvasReadApp {
  resume_url?: string | null;
  voice_interview_recording_url?: string | null;
  voice_interview_transcript?: unknown;
  /** whyUp / whyDown: the facts behind the number (the desktop's "Why up"
   *  and "Why down"). */
  ai_scorecard?: unknown;
}

/** How many of Ava's flags show before "Show all": three on the phone's
 *  card, four on the desktop's open section. */
const FLAGS_SHOWN = 3;
const FLAGS_SHOWN_OPEN = 4;

/** The 10px all-caps rule the spec uses for every small label. */
function Label({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="block text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]" style={{ color }}>
      {children}
    </span>
  );
}

/** One side of "Why up / Why down": her phrases, each its own line. Empty
 *  says so, rather than leaving a heading over nothing. */
function WhyList({ title, items, color, dot }: { title: string; items: string[]; color: string; dot: string }) {
  return (
    <div className="min-w-0">
      <Label color={color}>{title}</Label>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-col">
          {items.map((item) => (
            <li key={item} className="relative py-[5px] pl-[18px] text-[13.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
              <span aria-hidden className="absolute left-[2px] top-[12px] block h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
          Nothing on file.
        </p>
      )}
    </div>
  );
}

export function AvasRead({
  candidate,
  app,
  record,
  showScore = true,
  variant = "card",
}: {
  candidate: Candidate;
  app?: AvasReadApp | null;
  record: AssessmentRecord | null;
  /** Off where the page already carries the score once (the profile's head). */
  showScore?: boolean;
  /** "card": the letterhead (the phone). "open": a section of the desktop's
   *  main column, no box (docs/APPLICANT-PROFILE.md): the seal, the summary,
   *  Why up and Why down side by side, then what she flagged. */
  variant?: "card" | "open";
}) {
  // `candidate.analyzed` is the single source of truth (computed once in
  // `mapCandidate`) — never re-derived from `overall > 0`: a genuine finished
  // score of 0 is a real result and has to read as one.
  const analyzed = candidate.analyzed;
  const turns = transcriptOf(app);
  const minutes = interviewMinutes(turns);
  const quote = pullQuote(turns);
  const recording = app?.voice_interview_recording_url ?? null;
  const prose = avaProse(candidate.readFull) || candidate.read;
  const [allFlags, setAllFlags] = useState(false);
  // The form saves as they type (wave 2): what they have written is already readable.
  const draftSaved = record?.entries.some((e) => e.kind === "application" && e.detail?.kind === "application" && !!e.detail.draft) ?? false;

  // Say what she actually weighed — everything this person has finished, read
  // off the same record the list below shows. Showcase rows carry no record;
  // they keep the old three-fact line.
  const finished = record ? weighedPhrase(record.entries) : null;
  const weighed = finished
    ? [finished]
    : ([
        turns.length > 0 || candidate.voice != null
          ? minutes != null
            ? `${minutes}-minute voice interview`
            : "voice interview"
          : null,
        candidate.quiz != null ? "skills check" : null,
        app?.resume_url ? "resume" : null,
      ].filter(Boolean) as string[]);

  // Every flag she raised, in her words — the deal-breaker line above already
  // carries one of them, so it is not said twice.
  const flags = (record?.riskFlags ?? candidate.riskFlags).filter((f) => f !== candidate.hardRejectReason);
  const flagsShown = variant === "open" ? FLAGS_SHOWN_OPEN : FLAGS_SHOWN;
  const shownFlags = allFlags ? flags : flags.slice(0, flagsShown);

  // Ava's own decline recommendation always surfaces here, in her own words,
  // no matter what the number says — a flagged candidate must never read as
  // clean just because the score looks good. Anything softer (no hard-reject
  // reason, just a middling or weak score) still gets the score-based nudge.
  const worthAsking =
    analyzed && candidate.recommendedAction === "reject"
      ? candidate.hardRejectReason
        ? `Ava recommends declining — ${candidate.hardRejectReason}`
        : "Ava recommends declining this one — the evidence collected so far is below the bar for this role."
      : analyzed && candidate.risk.level !== "Low"
        ? candidate.risk.level === "Medium"
          ? `${candidate.overall} puts them in the middle of your field — worth asking about the gaps`
          : `${candidate.overall} is below the people I sealed — worth asking before you spend an hour`
        : null;

  const weighedLine = candidate.fillingInForm
    ? "Nothing sent yet"
    : weighed.length > 0
      ? `${weighed.join(", ")}, weighed against the job`
      : "Weighed against the job";

  if (variant === "open") {
    const why = scorecardWhy(app?.ai_scorecard);
    return (
      <ProfileSection title={"Ava\u2019s read"} sub={weighedLine.charAt(0).toUpperCase() + weighedLine.slice(1)}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3.5">
          <span className="ck-seal ck-seal-press mt-[2px]">
            <AvaSeal size={32} />
          </span>
          <div className="min-w-0">
            {candidate.fillingInForm ? (
              <p className="text-[14px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
                {draftSaved
                  ? `${firstName(candidate.name)} is filling in the application form right now. Their answers save as they type — open the Application tile to read them so far. The moment they send it, I read it.`
                  : `${firstName(candidate.name)} is filling in the application form right now. Nothing is sent until they submit it — the moment they do, I read it, and their answers land here.`}
              </p>
            ) : !analyzed ? (
              <p className="text-[14px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
                I&rsquo;m still reading this one. The score and the evidence land here the moment
                screening finishes — you don&rsquo;t have to wait on the page.
              </p>
            ) : (
              <>
                {prose && (
                  <p className="max-w-[820px] text-[15px] leading-[1.6]" style={{ color: "var(--ink)" }}>
                    {clip(prose, 640)}
                  </p>
                )}

                {quote && (
                  <figure className="mt-3.5 max-w-[820px]">
                    <blockquote className="font-display text-[18px] italic leading-[1.4]" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>
                      &ldquo;{quote.text}&rdquo;
                    </blockquote>
                    <figcaption className="mt-2 flex items-center gap-[9px]">
                      {recording && (
                        <a
                          href={recording}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Play ${candidate.name}'s voice interview`}
                          className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-[1.08]"
                          style={{ background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }}
                        >
                          <Play className="h-[11px] w-[11px]" fill="currentColor" strokeWidth={0} />
                        </a>
                      )}
                      <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                        {recording ? "Hear it — " : "From the "}
                        voice interview{quote.at ? `, ${quote.at}` : ""}
                      </span>
                    </figcaption>
                  </figure>
                )}

                {worthAsking && (
                  <p className="mt-3.5 flex max-w-[820px] items-start gap-2.5 text-[13.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                    <AlertCircle className="mt-[3px] h-3.5 w-3.5 shrink-0" strokeWidth={2.3} style={{ color: "var(--amber-fg)" }} aria-hidden />
                    <span>{worthAsking}</span>
                  </p>
                )}

                {(why.up.length > 0 || why.down.length > 0) && (
                  <div className="mt-4 grid grid-cols-2 gap-7">
                    <WhyList title="Why up" items={why.up} color="var(--jade-soft-fg)" dot="var(--jade)" />
                    <WhyList title="Why down" items={why.down} color="var(--amber-fg)" dot="var(--brass)" />
                  </div>
                )}

                {flags.length > 0 && (
                  <div className="mt-4">
                    <Label color="var(--ink-3)">What I flagged · {flags.length}</Label>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {shownFlags.map((flag) => (
                        <li key={flag} className="flex items-start gap-2.5 text-[13px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                          <span aria-hidden className="mt-[7px] block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--amber-fg)" }} />
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                    {flags.length > flagsShown && (
                      <button
                        type="button"
                        className="mt-2 text-[12.5px] font-semibold hover:underline"
                        style={{ color: "var(--brass)" }}
                        aria-expanded={allFlags}
                        onClick={() => setAllFlags((v) => !v)}
                      >
                        {allFlags ? "Show fewer" : `Show all ${flags.length}`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </ProfileSection>
    );
  }

  return (
    <div className="ck-card relative px-5 pb-4 pt-4">
      {/* the brass rule across the head of the letterhead */}
      <span aria-hidden className="absolute left-5 right-5 top-[9px] h-[2px] rounded-[1px]" style={{ background: "var(--brass-line)" }} />

      <div className="mt-1.5 flex items-center gap-[11px]">
        <span className="ck-seal ck-seal-press">
          <AvaSeal size={24} />
        </span>
        <span className="min-w-0">
          <Label color="var(--jade-soft-fg)">Ava&rsquo;s read</Label>
          <span className="mt-[3px] block text-[11px]" style={{ color: "var(--ink-3)" }}>
            {weighedLine}
          </span>
        </span>
        {analyzed && showScore && (
          <span className="ck-num ml-auto shrink-0 text-[38px] font-semibold leading-[0.85]" style={{ color: "var(--jade)" }}>
            <CountUp value={candidate.overall} duration={700} delay={150} />
            <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              /100
            </span>
          </span>
        )}
      </div>

      {candidate.fillingInForm ? (
        <p className="mt-3.5 text-[13px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
          {draftSaved
            ? `${firstName(candidate.name)} is filling in the application form right now. Their answers save as they type — open the Application row to read them so far. The moment they send it, I read it.`
            : `${firstName(candidate.name)} is filling in the application form right now. Nothing is sent until they submit it — the moment they do, I read it, and their answers land here.`}
        </p>
      ) : !analyzed ? (
        <p className="mt-3.5 text-[13px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
          I&rsquo;m still reading this one. The score and the evidence land here the moment
          screening finishes — you don&rsquo;t have to wait on the page.
        </p>
      ) : (
        <>
          {quote && (
            <figure className="mt-3.5">
              <blockquote className="font-display text-[20px] italic leading-[1.35]" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>
                &ldquo;{quote.text}&rdquo;
              </blockquote>
              <figcaption className="mt-2 flex items-center gap-[9px]">
                {recording && (
                  <a
                    href={recording}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Play ${candidate.name}'s voice interview`}
                    className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-[1.08]"
                    style={{ background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }}
                  >
                    <Play className="h-[11px] w-[11px]" fill="currentColor" strokeWidth={0} />
                  </a>
                )}
                <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  {recording ? "Hear it — " : "From the "}
                  voice interview{quote.at ? `, ${quote.at}` : ""}
                </span>
              </figcaption>
            </figure>
          )}

          {prose && (
            <p className="mt-3 text-[13px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
              {clip(prose, 320)}
            </p>
          )}

          {/* Her working is said once, above, in full sentences — re-splitting
              it into a checklist here just repeated the same insight. What's
              worth a second callout is the one thing the paragraph doesn't
              already say: whether the score itself is worth raising. */}
          {worthAsking && (
            <>
              <div className="my-3 h-px" style={{ background: "var(--line-soft)" }} />
              <ul className="flex flex-col gap-2">
                <li className="flex items-start gap-2.5 text-[13px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                  <AlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" strokeWidth={2.3} style={{ color: "var(--amber-fg)" }} aria-hidden />
                  <span>{worthAsking}</span>
                </li>
              </ul>
            </>
          )}

          {/* Everything else she flagged (ai_scorecard.riskFlags), verbatim —
              for the owner to weigh, never a stop on its own. */}
          {flags.length > 0 && (
            <>
              <div className="my-3 h-px" style={{ background: "var(--line-soft)" }} />
              <Label color="var(--ink-3)">What I flagged · {flags.length}</Label>
              <ul className="mt-2 flex flex-col gap-1.5">
                {shownFlags.map((flag) => (
                  <li key={flag} className="flex items-start gap-2.5 text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                    <span aria-hidden className="mt-[6px] block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--amber-fg)" }} />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
              {flags.length > FLAGS_SHOWN && (
                <button
                  type="button"
                  className="mt-2 text-[12px] font-semibold hover:underline"
                  style={{ color: "var(--brass)" }}
                  aria-expanded={allFlags}
                  onClick={() => setAllFlags((v) => !v)}
                >
                  {allFlags ? "Show fewer" : `Show all ${flags.length}`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default AvasRead;
