/**
 * Employer glyph kit — the create-job flow's identity marks.
 *
 * The employer side ran on stock lucide icons (ClipboardList, FileText, Timer,
 * Camera, Trophy) while the candidate side had a hand-drawn kit. The owner's
 * read was exact: "all the icons feel very generic, very AI." It was also a
 * standing rule violation — candidate/glyphs.tsx already says a stock
 * briefcase, clipboard or camera may not carry identity.
 *
 * DIRECTION: "Climb and Seal". Every mark here is built from only the two
 * primitives the brand already owns and the kit already declares — the
 * wordmark's rising path (M4 18 L9 7 L14 15 L20 6, live in Wordmark and
 * BrandLoader) and the wax seal's ring (AvaSeal). That is the whole argument
 * for it: a competitor cannot copy these marks without copying the logo.
 *
 * Chosen by a 2-of-3 judge panel over "Stationery/letterpress" and "Tools of
 * the trade", with four marks grafted in from Stationery on the panel's
 * explicit instruction — GlyphRosette, GlyphQuoted, GlyphForme and a corrected
 * GlyphMeasure. Two Climb-and-Seal marks were rejected outright: its
 * application taper rasterized as lucide Filter (the Application card reuses
 * the EXISTING GlyphLetter instead, already documented as "an application on
 * its way"), and its video mark was the stock ID-card icon, so GlyphCallingCard
 * was redrawn from scratch.
 *
 * Family law, shared with candidate/glyphs.tsx: 24x24, fill="none",
 * stroke="currentColor", strokeWidth 2 (1.8-2.2), round caps and joins, at most
 * one small filled accent per mark. Nothing here is a briefcase, clipboard,
 * camera, sparkle, star, wand, robot or brain — a guardrail enforces it.
 *
 * Every mark was rendered at 16/20/24px in Day and Night before being accepted
 * (design/preview/glyph-rig.html).
 */
import type { CSSProperties, ReactNode } from "react";

export interface GlyphProps {
  /** Rendered size in px (square). */
  size?: number;
  /** Stroke weight — keep within the family's 1.8-2.2 range. */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  /** Give it a label only where the glyph is the sole indication of meaning. */
  title?: string;
}

function GlyphBase({
  size = 24,
  strokeWidth = 2,
  className,
  style,
  title,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/**
 * JobPost — Job post — the listing that goes out in public
 *
 * The letterhead card reduced to an icon: the full-width rule, a short
 * second rule, and the seal pressed at the lower right — the same two
 * things the plan card itself is made of, so the mark and the card it
 * heads are one drawing. Three elements, the lightest ink in the set; at
 * 16px the ring stays a ring (r5 is large enough not to blob) and it
 * reads as a signed notice. No page outline and no clip, so it cannot be
 * the lucide ClipboardList it replaces (AvaCreateJob.tsx:84,
 * AvaFlowPreview.tsx:150/188/264/290). If it proves too abstract to read
 * as 'the listing' once six cards are stacked, the one held reserve is
 * Tools-of-the-Trade's tear-off tab comb — do not substitute anything
 * else.
 */
export function GlyphJobPost(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M3.5 5.5 H20.5" />
      <path d="M3.5 10.5 H12.5" />
      <circle cx="16" cy="15.4" r="5" />
    </GlyphBase>
  );
}

/**
 * Scenarios — Quiz / timed scenarios / technical scenarios — judgement at
 * a fork
 *
 * The brand's own climb arriving at a decision and splitting two ways,
 * with the filled dot anchoring the junction so it never reads as a stray
 * zigzag. Three strokes and huge negative space — the crispest mark in
 * the exercise at 16px, and legible at 12px if it ever has to go there.
 * This is what a scenario question actually is (a branch), where lucide
 * Timer only said 'clock' — and timing already lives in the duration on
 * the docket line, so the mark must not repeat it. Replaces Timer
 * (AvaCreateJob.tsx:73, AvaFlowPreview.tsx:152/292) and ListChecks
 * (AvaFlowPreview.tsx:267). Note the dot's r1.6 exactly matches
 * GlyphJourney's, which is the family tell.
 */
export function GlyphScenarios(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M3.5 19.5 L9.3 9.4" />
      <path d="M9.3 9.4 L20.5 12.8" />
      <path d="M9.3 9.4 L20.5 4" />
      <circle cx="9.3" cy="9.4" r="1.6" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * Typing — Typing test / skills check — words per minute, accuracy
 *
 * A line of set text running into a standing I-beam caret. At 16px it
 * reads as '— I', a cursor waiting mid-line, which is the most
 * recognisable typing signal there is and shares no silhouette with
 * anything else here. It is the family's ruled vocabulary rotated
 * upright, not a keyboard grid — lucide Keyboard is the stock answer, it
 * is illegible below 20px, and it says nothing about speed. The one mark
 * in the set with no filled accent, deliberately: the caret is the ink.
 * Its old 1.05 collision with Climb-and-Seal's GlyphSpoken is gone
 * because GlyphSpoken is cut and GlyphQuoted took the voice slot.
 */
export function GlyphTyping(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M3.5 12 H11" />
      <path d="M16 6 V18" />
      <path d="M13.5 6 H18.5" />
      <path d="M13.5 18 H18.5" />
    </GlyphBase>
  );
}

/**
 * CallingCard — Video intro / walkthrough — the recorded introduction
 * they send
 *
 * REDRAWN — all three directions failed this one and every judge said so.
 * A landscape calling card whose head carries the letterhead rule, one
 * name line, and the pressed dot: the introduction is the metaphor, the
 * delivery is not. Explicitly NOT the three known failures — no play
 * triangle (that is what made Stationery's rasterize as a video player),
 * no circle head over a shoulder arc (that is the stock ID-card icon that
 * sank Climb and Seal's), no corner brackets (Tools' crop target). Kept
 * to four elements with 4.4 units between the band and the name rule so
 * nothing merges at 16px. It is the only closed rectangle in the family,
 * which is precisely why it is legible in a vertical stack of paths and
 * rings — and why there must never be a second one. Retires lucide Camera
 * on the cleaner playbook's Walkthrough card (AvaFlowPreview.tsx:191),
 * which the kit's own docstring bans by name and which is the flow's most
 * flagrant standing violation.
 */
export function GlyphCallingCard(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M3.4 6 H20.6 V18 H3.4 Z" />
      <path d="M3.4 9.2 H20.6" />
      <path d="M6.4 13.6 H13.4" />
      <circle cx="16.8" cy="13.6" r="1.7" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * Exchange — Chat simulation / Follow-ups — a live moment handled between
 * two voices
 *
 * The seal's ring cut into two facing arcs with a pressed dot held
 * between them — two voices, one moment. At 16px it reads as ( · ), calm
 * and distinct from every stripe and zigzag in the family; a staggered-
 * arc and a return-loop variant both read as accidents at that size. Not
 * a speech bubble (lucide MessageSquare reads as a support widget) and
 * not < > (that would collide with GlyphForme). HARD CONSTRAINT: never
 * render it inside a circular or heavily rounded tile — in a 44px rounded
 * tile it reads as a record button. This is safe here only because the
 * card spec deletes the icon tile entirely and the mark sits bare on the
 * sheet; if a tile ever comes back, this glyph must be swapped. Replaces
 * MessageSquare (AvaCreateJob.tsx:74) and MessagesSquare (shared.tsx:69).
 */
export function GlyphExchange(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M9.6 4.4 a9 9 0 0 0 0 15.2" />
      <path d="M14.4 4.4 a9 9 0 0 1 0 15.2" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * Quoted — Voice interview — what they said, out loud
 *
 * GRAFTED from Stationery on both judges' instruction, replacing Climb
 * and Seal's GlyphSpoken, which rasterized as the stock volume/broadcast
 * icon — the most generic mark in the winning set. A pair of letterpress
 * closing quotes: the only mark that says 'spoken' without drawing
 * hardware. At 16px the two bowls and tails stay crisp because there is
 * nothing fine inside them. Deliberately not a microphone (retires lucide
 * Mic at AvaCreateJob.tsx:75 and AvaFlowPreview.tsx:154/192/268/294 — a
 * mark nobody in the audit caught, and the kit's GlyphVoice docstring
 * already says it is 'deliberately not a microphone'), and deliberately
 * not a second waveform: the candidate kit's GlyphVoice owns bars, and
 * repeating them here would have collided with GlyphTyping's uprights.
 * Known ambiguity: out of context it can read as the numeral 99, so it is
 * only ever used adjacent to the words 'Voice interview' — never as a
 * bare rail node or favicon.
 */
export function GlyphQuoted(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M10 7.4 H5.4 V12.2 H10 V7.4 Z" />
      <path d="M10 12.2 c0 2.6 -1.6 4 -3.6 4.4" />
      <path d="M18.6 7.4 H14 V12.2 H18.6 V7.4 Z" />
      <path d="M18.6 12.2 c0 2.6 -1.6 4 -3.6 4.4" />
    </GlyphBase>
  );
}

/**
 * Measure — Screening rigor — the level you set, on a printer's measure
 *
 * GRAFTED from Stationery and CORRECTED: the end stops are shortened from
 * 4.8 units to 3.0 (10.5→13.5, was 9.6→14.4) because at full length the
 * mark read as a dumbbell. Four elements, 26.2 ink — the lightest and
 * crispest glyph tested, razor sharp at 16px in both themes. It replaces
 * Climb and Seal's own GlyphRigor, whose needle nearly vanished at 16px
 * leaving a bare arch, and — the deciding reason — it has no ring at all,
 * so it cannot collide with the kit's GlyphClock or with the lucide Clock
 * currently printed in the duration chip on the same card
 * (shared.tsx:203). The bead's off-centre position is the whole message:
 * a thing you slide, currently set high. Its r=2 is the largest solid
 * accent in the family; that is deliberate, since anything smaller stops
 * reading as a settable slug at 16px, and it is the one sanctioned
 * stretch of the one-small-accent rule. Replaces lucide SlidersHorizontal
 * (shared.tsx:70).
 */
export function GlyphMeasure(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M4.6 12 H19.4" />
      <path d="M4.6 10.5 V13.5" />
      <path d="M19.4 10.5 V13.5" />
      <circle cx="15.6" cy="12" r="2" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * Plan — The built plan — the whole run of steps Ava assembled (Review
 * plan rail node)
 *
 * The unmodified brand path written on the letterhead rule — two strokes,
 * the flattest and most premium mark here, and it survives 16px better
 * than anything else. It is deliberately the same path as the candidate
 * kit's GlyphJourney because the employer's plan and the candidate's
 * journey are one object seen from two sides; the baseline rule and the
 * ABSENT mid-bend dot are what keep them apart. Judges flagged the near-
 * duplication, so the rule is explicit: GlyphPlan is employer-surface
 * only, GlyphJourney is candidate-surface only, and they may never appear
 * on the same screen. Not a chart — no vertical axis, no gridline, no
 * data point. Replaces lucide ClipboardCheck and Workflow
 * (shared.tsx:71-72), both ruled out for identity marks by the kit's
 * docstring.
 */
export function GlyphPlan(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M3.5 16.5 L8.8 5.8 L13.6 13 L20.5 4.2" />
      <path d="M3.5 20.5 H20.5" />
    </GlyphBase>
  );
}

/**
 * Publish — Publish — the flow goes live, sealed and signed
 *
 * The climb runs up and lands on the pressed seal — the repo's own story,
 * since shared.tsx already marks the Publish node sealed:true and lets
 * the real AvaSeal stand in for the step glyph. Single ring with a filled
 * core rather than the seal's double ring, because at 16px a 2.3-unit gap
 * between two rings closes up and turns to mush. An earlier version shot
 * the path past the ring and read as a prohibition slash, so the path
 * stops on the rim (the endpoint sits 5.14 units from the centre, i.e.
 * exactly on the r5 rim at strokeWidth 2). Stationery's rival Publish
 * mark — the wordmark inside a ring — is rejected here: it reads as a
 * monogram and would compete with the actual AvaSeal on the one step that
 * renders it.
 */
export function GlyphPublish(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M3 20 L7.6 9.8 L11.6 15.8 L13.9 11.6" />
      <circle cx="17" cy="7.5" r="5" />
      <circle cx="17" cy="7.5" r="1.7" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * Rosette — Shortlist — your ranked top picks
 *
 * GRAFTED from Stationery into Climb and Seal's admitted Shortlist hole,
 * on every judge's instruction — and it is already native to this
 * vocabulary: the seal's ring with a filled core, awarded, with two
 * ribbon tails. Rated the most distinctive silhouette of all 34 marks
 * rendered at 16px, and it holds in Night. It retires lucide Trophy,
 * which appears on every playbook (AvaFlowPreview.tsx:155/193/231/269/295
 * and AvaCreateJob.tsx:77) and reads as gamification rather than as a
 * decision handed to an employer. Climb and Seal drew no Shortlist mark
 * at all because every ranked-list and podium idea collided with its
 * other marks; a ring with tails collides with nothing.
 */
export function GlyphRosette(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <circle cx="12" cy="9" r="5.4" />
      <circle cx="12" cy="9" r="1.7" fill="currentColor" stroke="none" />
      <path d="M8.8 13.4 L7.2 20 L10.2 18.4" />
      <path d="M15.2 13.4 L16.8 20 L13.8 18.4" />
    </GlyphBase>
  );
}

/**
 * Forme — Coding test — a line locked up between brackets
 *
 * GRAFTED from Stationery to cover the coding test, which Climb and Seal
 * does not draw at all. Square brackets are a typesetter's mark and a
 * coder's mark at once, so it is not a foreign object in a rule-and-seal
 * family the way a keyboard or a terminal would be. At 44.9 ink it is
 * mid-density but the two bracket arms hold their shape at 16px in Night
 * even as the inner rules thin out; the filled dot is the cursor sitting
 * at the end of the second line. Replaces lucide Code2
 * (AvaCreateJob.tsx:76, AvaFlowPreview.tsx:266), whose angle brackets
 * read as a developer-tool logo rather than as work being set.
 */
export function GlyphForme(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M9 5.4 H6.2 V18.6 H9" />
      <path d="M15 5.4 H17.8 V18.6 H15" />
      <path d="M9.8 10 H14.2" />
      <path d="M9.8 14 H12.6" />
      <circle cx="14.9" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}
