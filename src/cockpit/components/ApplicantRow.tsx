import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, ShieldAlert, StickyNote } from "lucide-react";
import { noteTitle } from "../lib/applicantNotes";
import { TONE_VAR, type ApplicantDot, type ApplicantListRow, type DotState, type LineSegment } from "../lib/applicantList";
import { MILESTONE_LABELS, type MilestoneView } from "../lib/milestones";
import { samePhoneWords } from "../lib/blockedApplicants";
import { applicantPath, useJobScope } from "../lib/jobScope";

/**
 * One applicant on the Applicants list (docs/APPLICANTS-LIST.md §2): a row of
 * the desktop table, or a card on a phone. Everything it says is already
 * worked out on the row (lib/applicantList.ts, from the same record the full
 * profile builds); this file only draws it, the way the approved mockup does
 * (docs/mockups/applicants-list-*.png).
 *
 * The whole row is a link to /applicants/:id, so it opens in a new tab, reads
 * as one target to a screen reader, and is not a <button> (the phone-wide
 * button rule in index.css would restyle it).
 */

/** The table's columns: Applicant · Where they are · Last active · Flags · Score · ›.
 *  The header and every row share it, so they always line up. The Applicant
 *  column grows first: on a narrow table ("Philippines · applied 3 days ago")
 *  it is the one that runs out of room, while the dots shrink happily. */
export const APPLICANT_GRID = "minmax(220px,1.45fr) minmax(210px,1.4fr) 146px 80px 96px 16px";
/** The narrowest the table can be: the columns' minimums (768), their five
 *  16px gaps, the row's 20px padding each side and the card's border. Below
 *  this the Score column is cut off, so the page draws cards instead. */
export const APPLICANT_TABLE_MIN = 768 + 5 * 16 + 2 * 20 + 2;

/* ── Where they are ───────────────────────────────────────────────────── */

/** A milestone not reached, and the line to it: --ink-3 at 75% is at least
 *  3:1 on the card in both themes (--hair and --track were under 2.4:1,
 *  third Pass C review). */
const UNLIT = "color-mix(in srgb, var(--ink-3) 75%, transparent)";

/**
 * "Where they are": four milestones, Applied → Tested → Interview → Hired
 * (lib/milestones.ts; the owner's Option C, 2026-10-24). Solid dots on a line
 * for what is behind them, the one they are at larger, and its name stressed
 * under it; the step detail is the line under the rail. Hired, once reached,
 * is the one brass moment; a declined applicant's dot is drawn stopped.
 */
export function MilestoneRail({ view, labels = true, size = 9 }: { view: MilestoneView; labels?: boolean; size?: number }) {
  const big = size + 4;
  return (
    <div aria-label={`Where they are: ${view.tone === "stopped" ? "Declined" : view.at === 3 && view.tone !== "won" ? "Offer" : MILESTONE_LABELS[view.at]}`} role="img">
      <div className="flex items-center" style={{ height: big + 6 }}>
        {MILESTONE_LABELS.map((label, i) => {
          const lit = i < view.lit;
          const here = i === view.at;
          const won = view.tone === "won" && i === 3;
          const fill = won ? "var(--brass)" : lit ? "var(--ink)" : "transparent";
          const ring = won ? "var(--brass)" : here && view.tone === "stopped" ? "var(--crit)" : lit || here ? "var(--ink)" : UNLIT;
          const d = here ? big : size;
          return (
            <span key={label} className={`flex items-center ${i === 0 ? "" : "min-w-0 flex-1"}`}>
              {i > 0 && <span className="h-[2px] min-w-[8px] flex-1" style={{ background: i < view.lit ? "var(--ink)" : UNLIT }} />}
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: d,
                  height: d,
                  background: fill,
                  border: `2px solid ${ring}`,
                  boxShadow: here && view.tone !== "stopped" ? `0 0 0 3px color-mix(in srgb, ${won ? "var(--brass)" : "var(--ink)"} 14%, transparent)` : undefined,
                }}
              />
            </span>
          );
        })}
      </div>
      {labels && (
        <div className="mt-1 flex justify-between text-[11px] leading-none tracking-[0.01em]">
          {MILESTONE_LABELS.map((label, i) => (
            <span
              key={label}
              style={{
                color: i === view.at ? (view.tone === "stopped" ? "var(--crit)" : view.tone === "won" ? "var(--brass)" : "var(--ink)") : "var(--ink-3)",
                fontWeight: i === view.at ? 600 : 400,
              }}
            >
              {i === view.at && view.tone === "stopped" ? "Declined" : i === 3 && view.at === 3 && view.tone !== "won" ? "Offer" : label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Under the table: where the rest is. (The five dot states it used to name
 *  went with the dots: the milestones say their own names.) */
export function ListFootnote({ className = "" }: { className?: string }) {
  return (
    <div className={`text-[12px] ${className}`} style={{ color: "var(--ink-3)" }}>
      Open a row to see their full profile: every answer, test and flag.
    </div>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

/** The line under the dots, each run in its own colour. A run never breaks
 *  inside itself ("step 4 of 7", "live" stay whole); when the line is too long
 *  it wraps between runs, so nothing is cut off. The " · " between two runs
 *  stays on the end of the line it closes ("step 3 of 7 ·" / "live"): a wrap
 *  never starts a line with a dot. */
export function LineText({ line, className = "", style, title }: { line: readonly LineSegment[]; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <span className={className} style={style} title={title}>
      {line.map((seg, i) => {
        // " · step 4 of 7" → a non-breaking " ·" glued to what came before,
        // then the ordinary space a wrap may take, then the run itself.
        const sep = i > 0 ? /^\s*·/.exec(seg.text)?.[0] : undefined;
        const rest = sep ? seg.text.slice(sep.length) : seg.text;
        const lead = /^\s*/.exec(rest)?.[0] ?? "";
        const body = rest.slice(lead.length);
        return (
          <span key={i}>
            {sep && <span style={{ color: TONE_VAR[seg.tone] }}>{"\u00a0·"}</span>}
            {sep ? (lead || body ? " " : "") : lead}
            {body && (
              <span className="whitespace-nowrap" style={{ color: TONE_VAR[seg.tone] }}>
                {body}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

const CHIP_LOOK: Record<string, CSSProperties> = {
  amber: { color: "var(--amber-fg)", background: "var(--amber-bg)" },
  // "Viewed": a Needs-review applicant this reader has already opened
  // (lib/applicantNotes.ts). Quiet, so the unopened ones stand out.
  muted: { color: "var(--ink-3)", background: "color-mix(in srgb, var(--ink) 8%, transparent)" },
  jade: { color: "var(--jade-soft-fg)", background: "var(--jade-soft)" },
  crit: { color: "var(--crit)", background: "var(--crit-bg)" },
};

/** His interview rating of them, beside the stage: quiet, because the stage is the state and this is a note of his. */
export function InterviewScoreChip({ words }: { words: string }) {
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-[5px] border px-[6px] py-[2px] text-[11px] font-semibold leading-none tabular-nums"
      style={{ borderColor: "var(--line)", color: "var(--ink-2)", background: "var(--surface)" }}
      title="Your rating of their interview, out of 10"
      data-interview-chip
    >
      {words}
    </span>
  );
}

/** Needs review, Interview, Offer, Hired, Declined. */
export function StatusChip({ chip }: { chip: NonNullable<ApplicantListRow["chip"]> }) {
  return (
    <span className="ck-pill shrink-0 !px-[7px] !py-[3px]" style={CHIP_LOOK[chip.tone] ?? CHIP_LOOK.jade}>
      {chip.label}
    </span>
  );
}

/** Shield and "3 flags" in amber, or "None". The tooltip lists them. */
export function FlagsCell({ flags, hideNone = false }: { flags: ApplicantListRow["flags"]; hideNone?: boolean }) {
  if (flags.count === 0) {
    return hideNone ? null : (
      <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        None
      </span>
    );
  }
  const words = `${flags.count} ${flags.count === 1 ? "flag" : "flags"}`;
  return (
    // `relative`: the sr-only text below is position:absolute, and with no
    // positioned ancestor inside the card it stretched the team member's
    // shell (its outer box scrolled away into a blank screen).
    <span className="relative inline-flex shrink-0 items-center gap-1.5 text-[12.5px]" style={{ color: "var(--amber-fg)" }} title={flags.tooltip ?? undefined}>
      <ShieldAlert aria-hidden className="h-3.5 w-3.5" />
      {words}
      {flags.tooltip && <span className="sr-only">: {flags.tooltip}</span>}
    </span>
  );
}

/** Same phone as someone the team blocked: flagged, never refused
 *  (lib/blockedApplicants.ts). The full words are its tooltip and are read
 *  out; the chip itself stays short. */
export function SamePhoneChip({ name }: { name: string }) {
  const words = samePhoneWords(name);
  return (
    <span className="ck-pill relative shrink-0 !px-[7px] !py-[3px]" style={{ color: "var(--crit)", background: "var(--crit-bg)" }} title={words.title}>
      <span aria-hidden>{words.chip}</span>
      <span className="sr-only">{words.title}</span>
    </span>
  );
}

/** The bookmark beside the name of someone on the team's shortlist
 *  (lib/shortlist.ts). Brass, filled, and said in words to a screen reader. */
export function ShortlistMark({ size = 14 }: { size?: number }) {
  return (
    // `relative` contains the sr-only text (see FlagsCell).
    <span className="relative inline-flex shrink-0" title="On your shortlist" data-shortlist-mark>
      <Bookmark aria-hidden style={{ width: size, height: size, color: "var(--brass)", fill: "var(--brass)" }} />
      <span className="sr-only">On your shortlist</span>
    </span>
  );
}

/** The team has written notes on this applicant (lib/applicantNotes.ts). The
 *  newest is the tooltip, and is read out. */
export function NoteMark({ note, size = 14 }: { note: NonNullable<ApplicantListRow["note"]>; size?: number }) {
  const title = noteTitle(note);
  return (
    <span className="relative inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }} title={title} data-note-mark={note.count}>
      <StickyNote aria-hidden style={{ width: size, height: size }} />
      {note.count > 1 && <span aria-hidden>{note.count}</span>}
      <span className="sr-only">
        {note.count === 1 ? "1 note" : `${note.count} notes`}: {title}
      </span>
    </span>
  );
}

/** ai_score over /100 in Fraunces, "so far" or "not scored yet" under it.
 *  Never a quiz percentage standing in for it. `reserve` keeps the second
 *  line's room when there are no words (the phone card: a score landing,
 *  or "so far" arriving, must not change the card's height). */
export function ScoreCell({ row, size = 30, reserve = false }: { row: ApplicantListRow; size?: number; reserve?: boolean }) {
  return (
    <span className="block text-right leading-none">
      {row.score == null ? (
        <span className="ck-num inline-block font-medium" style={{ fontSize: size, color: "var(--ink-3)" }} aria-label="No score">
          —
        </span>
      ) : (
        <span className="ck-num font-medium" style={{ fontSize: size, color: TONE_VAR[row.scoreTone] }}>
          {row.score}
          <span className="ml-[2px] font-sans text-[13px] tracking-normal" style={{ color: "var(--ink-3)" }}>
            /100
          </span>
        </span>
      )}
      {row.scoreWords ? (
        <span className="mt-1 block font-sans text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {row.scoreWords}
        </span>
      ) : (
        reserve && (
          <span aria-hidden className="mt-1 block font-sans text-[11.5px]">
            {" "}
          </span>
        )
      )}
    </span>
  );
}

/** The avatar — their photo, or plain initials on a raised disc, as the
 *  mockup draws it — with a live dot when they did something in the last
 *  two minutes. */
function Who({ row, size = 38 }: { row: ApplicantListRow; size?: number }) {
  return (
    <span className="relative shrink-0">
      {row.avatarUrl ? (
        <img src={row.avatarUrl} alt="" className="block rounded-full object-cover" style={{ width: size, height: size, boxShadow: "inset 0 0 0 1px var(--line)" }} />
      ) : (
        <span
          aria-hidden
          className="grid place-items-center rounded-full text-[13px] font-semibold"
          style={{ width: size, height: size, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}
        >
          {row.initials}
        </span>
      )}
      {row.liveNow && (
        <span
          aria-hidden
          className="absolute -right-[1px] -top-[1px] block h-[10px] w-[10px] rounded-full"
          style={{ background: "var(--jade)", boxShadow: "0 0 0 2px var(--hf-surface)" }}
        />
      )}
    </span>
  );
}

/** "Philippines · applied 3 days ago": each half whole, the dot kept on the
 *  first line when it wraps. With people from more than one job on the list,
 *  their job leads it ("Barista · Philippines · …"): with four or five jobs
 *  open, a name and a score alone don't say which one they want. */
function SubLine({ row, words, showJob = false }: { row: ApplicantListRow; words: string; showJob?: boolean }) {
  return (
    <>
      {showJob && row.jobTitle && (
        <>
          <span className="whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
            {row.jobTitle}
            {"\u00a0·"}
          </span>{" "}
        </>
      )}
      <span className="whitespace-nowrap">{row.country}{"\u00a0·"}</span> <span className="whitespace-nowrap">{words}</span>
    </>
  );
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ── The desktop row ───────────────────────────────────────────────────── */

/** `lead`: the "all on this page" checkbox, drawn over the avatars' column
 *  (SelectMark, components/ApplicantBulkBar.tsx); the labels stay hidden from
 *  a screen reader, the checkbox does not. */
export function ApplicantTableHeader({ lead }: { lead?: ReactNode } = {}) {
  return (
    <div
      className="grid h-10 items-center gap-4 border-b px-5 text-[11px] uppercase tracking-[0.12em]"
      style={{ gridTemplateColumns: APPLICANT_GRID, color: "var(--ink-3)", borderColor: "var(--line-soft)", background: "var(--ground-2)" }}
      aria-hidden={lead ? undefined : true}
    >
      {lead ? (
        <span className="flex items-center gap-3">
          <span className="grid w-[38px] shrink-0 place-items-center">{lead}</span>
          <span aria-hidden>Applicant</span>
        </span>
      ) : (
        <span>Applicant</span>
      )}
      <span aria-hidden>Where they are</span>
      <span aria-hidden>Last active</span>
      <span aria-hidden>Flags</span>
      <span aria-hidden className="text-right">Score</span>
      <span aria-hidden />
    </div>
  );
}

interface RowProps {
  row: ApplicantListRow;
  /** "Interview 7.8": his own rating of their interview (lib/interviewScore.ts), when he has given one. */
  interviewChip?: string | null;
  /** Called before the link navigates (the page keeps its scroll). */
  onOpen?: (row: ApplicantListRow, event: MouseEvent) => void;
  index?: number;
  /** Rise in with the list (`ck-reveal`). Only while the list first lands:
   *  the browser replays a CSS animation on any node React moves, so a row
   *  that changed place, or arrived later, would blink out and fade back in
   *  (the Applicants page passes false after its first paint). */
  reveal?: boolean;
  /** Name their job on the line under theirs: the list holds more than one job's people. */
  showJob?: boolean;
}

export function ApplicantTableRow({ row, onOpen, index = 0, reveal = true, interviewChip, showJob }: RowProps) {
  // Under the job when the list is the job's (lib/jobScope.ts).
  const jobId = useJobScope();
  return (
    <Link
      to={applicantPath(row.id, jobId)}
      onClick={(e) => onOpen?.(row, e)}
      data-applicant-row={row.id}
      className={[
        `${reveal ? "ck-reveal " : ""}group relative grid min-h-[74px] items-center gap-4 border-b px-5 py-3 last:border-b-0`,
        "transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ink)_3.5%,transparent)]",
        // Focus is drawn INSIDE the row: the table card clips anything outside
        // it, and the cockpit's own ring (.ck-scroll a:focus-visible) sits 2px out.
        "focus-visible:bg-[color-mix(in_srgb,var(--ink)_3.5%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:!-outline-offset-2 focus-visible:outline-[var(--jade)]",
        // the jade tab on the left edge, as in the mockup's hovered row
        "before:absolute before:bottom-[10px] before:left-0 before:top-[10px] before:w-[3px] before:rounded-r-[3px] before:bg-[var(--jade)] before:opacity-0 before:transition-opacity before:content-['']",
        "hover:before:opacity-100 focus-visible:before:opacity-100",
      ].join(" ")}
      style={{ gridTemplateColumns: APPLICANT_GRID, borderColor: "var(--line-soft)", ["--ck-i" as string]: Math.min(index, 12) }}
    >
      {/* Applicant */}
      <span className="flex min-w-0 items-center gap-3">
        <Who row={row} />
        <span className="min-w-0">
          {/* Narrow: the chip drops under the name rather than cutting it. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="max-w-full truncate text-[14.5px] font-medium" style={{ color: "var(--ink)" }}>
              {row.name}
            </span>
            {row.shortlisted && <ShortlistMark />}
            {row.note && <NoteMark note={row.note} />}
            {row.chip && <StatusChip chip={row.chip} />}
            {interviewChip && <InterviewScoreChip words={interviewChip} />}
            {row.sameBlockedPhoneAs && <SamePhoneChip name={row.sameBlockedPhoneAs} />}
          </span>
          {/* Wraps rather than cuts: the applied age is the part that matters. */}
          <span className="block text-[12.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
            <SubLine row={row} words={row.appliedWords} showJob={showJob} />
          </span>
        </span>
      </span>

      {/* Where they are */}
      <span className="min-w-0">
        <MilestoneRail view={row.milestones} />
        <LineText line={row.line} className="mt-[7px] block text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }} />
      </span>

      {/* Last active */}
      <span className="text-[12.5px] font-medium" style={{ color: TONE_VAR[row.activeTone] }}>
        {row.activeWords}
      </span>

      {/* Flags */}
      <span className="min-w-0">
        <FlagsCell flags={row.flags} />
      </span>

      {/* Score */}
      <ScoreCell row={row} />

      {/* data-row-chevron: hidden where the row's ⋯ menu takes its place
          (ApplicantRowFrame, components/ApplicantBulkBar.tsx). */}
      <ChevronRight data-row-chevron aria-hidden className="h-4 w-4 opacity-60 transition-colors group-hover:opacity-100 group-hover:text-[var(--jade)]" style={{ color: "var(--ink-3)" }} />
    </Link>
  );
}

/* ── The phone card ────────────────────────────────────────────────────── */

/** The card's last line: the chip and what it means ("NEEDS REVIEW finished
 *  every test", "INTERVIEW interview Thu 3 PM"), or where they are now. */
function CardLine({ row }: { row: ApplicantListRow }) {
  if (!row.chip) return <LineText line={row.line} />;
  if (row.tab === "needs-review") {
    // "finished every test" beside the chip; Ava's suggestion, when there is
    // one, on a line of its own rather than broken across two.
    const [first, ...rest] = row.line;
    const ava = rest.map((seg, i) => (i === 0 ? { ...seg, text: seg.text.replace(/^\s*·\s*/, "") } : seg));
    return (
      <>
        <StatusChip chip={row.chip} /> <LineText line={first ? [{ ...first, text: lowerFirst(first.text) }] : []} />
        {ava.length > 0 && <LineText line={ava} className="mt-0.5 block" />}
      </>
    );
  }
  const words = lowerFirst(row.status === "interview" && !row.interviewAt ? row.lineText : row.activeWords);
  return (
    <>
      <StatusChip chip={row.chip} /> <LineText line={[{ text: words, tone: "soft" }]} />
    </>
  );
}

export function ApplicantCard({ row, onOpen, index = 0, reveal = true, interviewChip, showJob }: RowProps) {
  // Under the job when the list is the job's (lib/jobScope.ts).
  const jobId = useJobScope();
  return (
    <Link
      to={applicantPath(row.id, jobId)}
      onClick={(e) => onOpen?.(row, e)}
      data-applicant-row={row.id}
      // `relative` contains anything absolutely placed inside (the flags'
      // screen-reader text), so it can never stretch the page around it.
      className={`ck-card ${reveal ? "ck-reveal " : ""}relative block !rounded-[16px] px-3.5 pb-[13px] pt-3.5 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jade)]`}
      style={{ ["--ck-i" as string]: Math.min(index, 8) }}
    >
      <span className="flex items-center gap-[11px]">
        <Who row={row} />
        <span className="min-w-0 flex-1">
          {/* One line, as before: the name cuts short, the bookmark never does. */}
          <span className="flex min-w-0 items-center gap-1.5 text-[15px] leading-[1.3]">
            <span className="min-w-0 truncate font-medium" style={{ color: "var(--ink)" }}>
              {row.name}
            </span>
            {row.shortlisted && <ShortlistMark />}
            {row.note && <NoteMark note={row.note} />}
          </span>
          <span className="block text-[12.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
            <SubLine row={row} words={row.onForm ? `started ${row.appliedAgo}` : row.appliedAgo} showJob={showJob} />
          </span>
        </span>
        <span className="shrink-0">
          <ScoreCell row={row} size={27} reserve />
        </span>
      </span>
      <span className="mt-[13px] block">
        <MilestoneRail view={row.milestones} size={10} />
      </span>
      {/* data-card-foot: keeps clear of the card's ⋯ / checkbox corner (ApplicantRowFrame).
          Always two lines tall, never more: a live line that grows, or a
          flag landing beside it, changes what it says, not the card's
          height, so the cards below never slide (2026-10-07). */}
      <span
        data-card-foot
        className="mt-2 flex items-start justify-between gap-2 text-[12.5px] leading-[1.45]"
        style={{ color: "var(--ink-2)", height: CARD_FOOT_HEIGHT }}
      >
        <span className="min-w-0 overflow-hidden" style={{ maxHeight: CARD_FOOT_HEIGHT }}>
          {row.sameBlockedPhoneAs && (
            <>
              <SamePhoneChip name={row.sameBlockedPhoneAs} />{" "}
            </>
          )}
          {interviewChip && (
            <>
              <InterviewScoreChip words={interviewChip} />{" "}
            </>
          )}
          <CardLine row={row} />
        </span>
        <FlagsCell flags={row.flags} hideNone />
      </span>
    </Link>
  );
}

/** Two lines of the card's foot (12.5px at 1.45). */
const CARD_FOOT_HEIGHT = "calc(2 * 1.45em)";
