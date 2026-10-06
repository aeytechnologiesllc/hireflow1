import type { CSSProperties, MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { TONE_VAR, type ApplicantDot, type ApplicantListRow, type DotState, type LineSegment } from "../lib/applicantList";

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

const DOT_WORDS: Record<DotState, string> = {
  done: "done",
  below: "done, below the job's bar",
  now: "on it now",
  skipped: "skipped",
  todo: "not reached",
};

/* ── The journey strip ─────────────────────────────────────────────────── */

function Check({ size }: { size: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" style={{ stroke: "var(--ground)", strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A step not reached, and the line to it: --ink-3 at 75% is 3.5:1 on DAY's
 *  card and 3.3:1 on NIGHT's. */
const UNLIT = "color-mix(in srgb, var(--ink-3) 75%, transparent)";

/** One node, in one of the five states. `left` is a ring they walked away from. */
export function JourneyDot({ state, left = false, size = 16 }: { state: DotState; left?: boolean; size?: number }) {
  const base: CSSProperties = {
    width: size,
    height: size,
    flex: `0 0 ${size}px`,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    boxSizing: "border-box",
  };
  const look: Record<DotState, CSSProperties> = {
    done: { background: "var(--jade)", border: "1.5px solid var(--jade)" },
    below: { background: "var(--brass)", border: "1.5px solid var(--brass)" },
    now: left
      ? { background: "var(--ground)", border: "2px solid var(--ink-3)" }
      : { background: "var(--ground)", border: "2px solid var(--jade)", boxShadow: "0 0 0 4px var(--jade-soft)" },
    skipped: { background: "transparent", border: "1.5px dashed var(--ink-3)" },
    // At least 3:1 on the card in both themes (--line was about 1.5:1, and the
    // empty end of the strip all but disappeared), and still quieter than
    // the dashed skipped ring.
    todo: { background: "transparent", border: `1.5px solid ${UNLIT}` },
  };
  return <span aria-hidden style={{ ...base, ...look[state] }}>{state === "done" || state === "below" ? <Check size={Math.round(size * 0.58)} /> : null}</span>;
}

/** The line between two nodes: jade once they have gone past the one before it. */
function lineLit(prev: DotState, cur: DotState): boolean {
  return (prev === "done" || prev === "below" || prev === "skipped") && cur !== "todo";
}

/** One dot per journey step of THIS applicant's job, Decision last, joined by
 *  a line. Each dot names its step on hover; the row's own line says the rest. */
export function JourneyDots({ dots, size = 16 }: { dots: readonly ApplicantDot[]; size?: number }) {
  return (
    <div className="flex items-center" aria-hidden>
      {dots.map((dot, i) => (
        <span key={dot.stepId} className={`flex items-center ${i === 0 ? "" : "min-w-0 flex-1"}`} title={`${dot.title} · ${dot.left ? "left part-way" : DOT_WORDS[dot.state]}`}>
          {i > 0 && (
            <span
              className="h-[2px] min-w-[6px] flex-1"
              style={{ background: lineLit(dots[i - 1].state, dot.state) ? "var(--jade)" : UNLIT }}
            />
          )}
          <JourneyDot state={dot.state} left={dot.left} size={size} />
        </span>
      ))}
    </div>
  );
}

/** The five states, named once under the table (contract §2). */
export function DotLegend({ className = "" }: { className?: string }) {
  const items: Array<[DotState, string]> = [
    ["done", "Done"],
    ["below", "Done, below the job's bar"],
    ["now", "On it now"],
    ["skipped", "Skipped"],
    ["todo", "Not reached"],
  ];
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] ${className}`} style={{ color: "var(--ink-3)" }}>
      {items.map(([state, label]) => (
        <span key={state} className="inline-flex items-center gap-1.5">
          <JourneyDot state={state} size={12} />
          {label}
        </span>
      ))}
      <span className="ml-auto">Tap a row to open their full profile: every answer, test and flag.</span>
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
  jade: { color: "var(--jade-soft-fg)", background: "var(--jade-soft)" },
  crit: { color: "var(--crit)", background: "var(--crit-bg)" },
};

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

/** ai_score over /100 in Fraunces, "so far" or "not scored yet" under it.
 *  Never a quiz percentage standing in for it. */
export function ScoreCell({ row, size = 30 }: { row: ApplicantListRow; size?: number }) {
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
      {row.scoreWords && (
        <span className="mt-1 block font-sans text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {row.scoreWords}
        </span>
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
 *  first line when it wraps. */
function SubLine({ row, words }: { row: ApplicantListRow; words: string }) {
  return (
    <>
      <span className="whitespace-nowrap">{row.country}{"\u00a0·"}</span> <span className="whitespace-nowrap">{words}</span>
    </>
  );
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ── The desktop row ───────────────────────────────────────────────────── */

export function ApplicantTableHeader() {
  return (
    <div
      className="grid h-10 items-center gap-4 border-b px-5 text-[11px] uppercase tracking-[0.12em]"
      style={{ gridTemplateColumns: APPLICANT_GRID, color: "var(--ink-3)", borderColor: "var(--line-soft)", background: "var(--ground-2)" }}
      aria-hidden
    >
      <span>Applicant</span>
      <span>Where they are</span>
      <span>Last active</span>
      <span>Flags</span>
      <span className="text-right">Score</span>
      <span />
    </div>
  );
}

interface RowProps {
  row: ApplicantListRow;
  /** Called before the link navigates (the page keeps its scroll). */
  onOpen?: (row: ApplicantListRow, event: MouseEvent) => void;
  index?: number;
}

export function ApplicantTableRow({ row, onOpen, index = 0 }: RowProps) {
  return (
    <Link
      to={`/applicants/${row.id}`}
      onClick={(e) => onOpen?.(row, e)}
      data-applicant-row={row.id}
      className={[
        "ck-reveal group relative grid min-h-[74px] items-center gap-4 border-b px-5 py-3 last:border-b-0",
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
            {row.chip && <StatusChip chip={row.chip} />}
          </span>
          {/* Wraps rather than cuts: the applied age is the part that matters. */}
          <span className="block text-[12.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
            <SubLine row={row} words={row.appliedWords} />
          </span>
        </span>
      </span>

      {/* Where they are */}
      <span className="min-w-0">
        <JourneyDots dots={row.dots} />
        <LineText line={row.line} title={row.lineText} className="mt-[7px] block text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }} />
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

      <ChevronRight aria-hidden className="h-4 w-4 opacity-60 transition-colors group-hover:opacity-100 group-hover:text-[var(--jade)]" style={{ color: "var(--ink-3)" }} />
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

export function ApplicantCard({ row, onOpen, index = 0 }: RowProps) {
  return (
    <Link
      to={`/applicants/${row.id}`}
      onClick={(e) => onOpen?.(row, e)}
      data-applicant-row={row.id}
      // `relative` contains anything absolutely placed inside (the flags'
      // screen-reader text), so it can never stretch the page around it.
      className="ck-card ck-reveal relative block !rounded-[16px] px-3.5 pb-[13px] pt-3.5 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jade)]"
      style={{ ["--ck-i" as string]: Math.min(index, 8) }}
    >
      <span className="flex items-center gap-[11px]">
        <Who row={row} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium leading-[1.3]" style={{ color: "var(--ink)" }}>
            {row.name}
          </span>
          <span className="block text-[12.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
            <SubLine row={row} words={row.onForm ? `started ${row.appliedAgo}` : row.appliedAgo} />
          </span>
        </span>
        <span className="shrink-0">
          <ScoreCell row={row} size={27} />
        </span>
      </span>
      <span className="mt-[13px] block">
        <JourneyDots dots={row.dots} size={17} />
      </span>
      <span className="mt-2 flex items-start justify-between gap-2 text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
        <span className="min-w-0">
          <CardLine row={row} />
        </span>
        <FlagsCell flags={row.flags} hideNone />
      </span>
    </Link>
  );
}
