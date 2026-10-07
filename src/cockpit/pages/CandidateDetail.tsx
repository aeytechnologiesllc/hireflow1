import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ChevronUp,
  UserRound,
  MessageCircle,
  Target,
  BookOpen,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Ban,
  RotateCcw,
} from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import InterviewSchedulingWizard from "@/components/InterviewSchedulingWizard";
import { CandidateMark } from "../components/CandidateMark";
import { CockpitErrorCard } from "../components/ErrorCard";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile, useMinWidth } from "@/hooks/use-mobile";
import { useCockpitCandidate, useCockpitActions, nextAdvanceStatus, advanceTargetLabel } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";
import { ResumeViewerDialog } from "../components/ResumeViewerDialog";
import { buildCandidateJourney, nextJourneyStep, positionFor, type WorkflowStepLike } from "@/lib/candidateJourney";
import { stepHasResult } from "@/lib/journeyProgress";
import { parseApplicationNotes } from "@/lib/applicationNotes";
import { AssessmentRecordList, LiveDot } from "../components/AssessmentRecordList";
import { AssessmentRecordSheet } from "../components/AssessmentRecordSheet";
import { ApplicantJourneyRail } from "../components/ApplicantJourneyRail";
import { AvasRead, type AvasReadApp } from "../components/AvasRead";
import { ApplicantTimeline, type TimelineApp } from "../components/ApplicantTimeline";
import { InterviewMoment } from "../components/InterviewMoment";
import { ApplicantDecisionDialogs, type ApplicantDecision } from "../components/ApplicantDecisionDialogs";
import { ApplicantDecisionCard, type DecisionAction, type DecisionCardActions } from "../components/ApplicantDecisionCard";
// Remove and block on the profile too (its ⋯ menu; the phone's More).
import { ActionsMenu, ApplicantActionDialogs, BlockedNote, applicantMenuItems, type ApplicantActionRequest } from "../components/ApplicantRowMenu";
import { useBlockedApplicants } from "../hooks/useApplicantBlocks";
import { ApplicantHeaderBand } from "../components/ApplicantHeaderBand";
import { ApplicantTestTiles } from "../components/ApplicantTestTiles";
import { ApplicantAtAGlance } from "../components/ApplicantAtAGlance";
import { ApplicantInTheirWords } from "../components/ApplicantInTheirWords";
import { ApplicantIntegrityPanel } from "../components/ApplicantIntegrityPanel";
import { PanelLabel, ProfileSection } from "../components/ProfileSection";
import { firstName } from "../lib/avaProse";
import { useApplicationSessions, useNow } from "../hooks/useAssessmentSessions";
import { buildAssessmentRecord, liveTone, type AssessmentAppInput, type AssessmentEntry } from "../lib/assessmentRecord";
import {
  applicantChip,
  applicantScore,
  atAGlance,
  avaSuggests,
  contactFacts,
  finishedEveryTest,
  headerLine,
  inTheirWords,
  journeyDots,
  pagerFor,
  readApplicantOrder,
  readApplicantTab,
  scoreColor,
  splitActionBar,
  testTiles,
  type ApplicantChip,
} from "../lib/applicantProfile";
import { agoWords, listRowFor, TAB_LABELS, UNKNOWN_COUNTRY, type ApplicantListApp, type ApplicantTab } from "../lib/applicantList";

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];

/**
 * The full profile, /applicants/:id — everything one applicant submitted and
 * every decision about them. Since the Applicants page became a list
 * (docs/APPLICANTS-LIST.md §4) this page carries what that page's side panel
 * used to: where they are on the job's journey (the same dot rule as the
 * list's), Ava's read with their own words, the timeline, Set up interview,
 * and "3 of 64 ‹ ›" through the list they came from.
 *
 * Three layouts, one set of state, actions and dialogs (docs/APPLICANT-PROFILE.md):
 *  - a phone (under 768px of window, useIsMobile): the cards and the fixed
 *    decision bar, unchanged;
 *  - a page narrower than DESKTOP_PAGE: the desktop's sections in one
 *    full-width column, the decision card after the header and, once it has
 *    scrolled away, the same buttons in a sticky bar at the foot;
 *  - from DESKTOP_PAGE of the page's OWN width: the whole screen, a header
 *    band, the journey across the full width, then a main column beside a
 *    right column. The page's width, not the window's: the team member's
 *    shell has a wider sidebar than the cockpit's, so the same window leaves
 *    each a different page.
 */

/** From this much page width, the two columns: a 1200 window in the cockpit
 *  (its 216px sidebar) and 1220 in the team member's shell (256px). */
const DESKTOP_PAGE = 900;
/** Under this, the header's suggestion and score take a line of their own. */
const HEAD_SPLIT_BELOW = 820;
/** The journey across the full width needs this much per step for its
 *  longest words; narrower, the phone's rail. */
const WIDE_RAIL_PER_STEP = 88;
/** Under this, the column's decision card stacks as on the desktop. */
const CARD_ROW_FROM = 600;

/** The chip's colours: the list row's and the profile's are one chip. */
function chipStyle(tone: ApplicantChip["tone"]) {
  return tone === "amber"
    ? { color: "var(--amber-fg)", background: "var(--amber-bg)", borderColor: "var(--brass-line)" }
    : tone === "crit"
      ? { color: "var(--crit)", background: "var(--crit-bg)" }
      : { color: "var(--jade-soft-fg)", background: "var(--jade-soft)" };
}

/** The element that scrolls this page — the cockpit's <main class="ck-scroll">
 *  or the team member shell's <main> — or null when the window does. */
function scrollerOf(el: HTMLElement | null, scrolling = false): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && (!scrolling || node.scrollHeight > node.clientHeight)) return node;
    node = node.parentElement;
  }
  return null;
}

/** Back to the top: a new person starts at their name, not halfway down the
 *  last one. */
function scrollToTopOf(el: HTMLElement | null) {
  const scroller = scrollerOf(el, true);
  if (scroller) scroller.scrollTop = 0;
  else if (typeof window !== "undefined") window.scrollTo(0, 0);
}

/** An element's laid-out width (clientWidth: a transform, such as the page's
 *  entrance, does not change it), kept current as it resizes. Measured before
 *  the first paint. */
function useClientWidth(el: HTMLElement | null): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
    measure();
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [el]);
  return width;
}

export default function CockpitCandidateDetail() {
  const { id } = useParams();
  const top = useRef<HTMLDivElement | null>(null);
  const [topEl, setTopEl] = useState<HTMLDivElement | null>(null);
  const setTop = useCallback((el: HTMLDivElement | null) => {
    top.current = el;
    setTopEl(el);
  }, []);
  // The page's own width decides its layout (see the comment above).
  const pageWidth = useClientWidth(topEl);
  useEffect(() => {
    scrollToTopOf(top.current);
  }, [id]);
  // Opened from the list (or a link): the journey rail draws itself. Turned to
  // by the pager: it is already in place (see PAGER_MOVE).
  const turnedTo = (useLocation().state as { pagerMove?: boolean } | null)?.pagerMove === true;
  // One person per mount. The pager moves between people on this same route,
  // and the team member's shell does not remount the page on a new id the way
  // the cockpit's does — so an open sheet or dialog never follows to the next.
  return (
    <div ref={setTop}>
      <CandidateProfile key={id ?? ""} id={id} pageWidth={pageWidth} railEntrance={turnedTo ? "none" : "draw"} />
    </div>
  );
}

/** One button on the decision bar, and the same object on the desktop's
 *  decision card: one set of actions, two ways of drawing them. */
type BarAction = DecisionAction;

/** The element that scrolls the page: how tall it is, its top and bottom
 *  padding (sticky offsets are measured inside it), and whether it has been
 *  scrolled at all. */
interface ScrollerBox {
  /** Its top edge on the screen (a shell's header sits above it). */
  top: number;
  height: number;
  padTop: number;
  padBottom: number;
}
function useScroller(el: HTMLElement | null): { box: ScrollerBox | null; scrolled: boolean } {
  const [box, setBox] = useState<ScrollerBox | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    if (!el) return;
    const scroller = scrollerOf(el);
    const measure = () => {
      const style = scroller ? getComputedStyle(scroller) : null;
      const next = {
        top: scroller ? Math.round(scroller.getBoundingClientRect().top) : 0,
        height: scroller ? scroller.clientHeight : window.innerHeight,
        padTop: style ? parseFloat(style.paddingTop) || 0 : 0,
        padBottom: style ? parseFloat(style.paddingBottom) || 0 : 0,
      };
      setBox((prev) =>
        prev && prev.top === next.top && prev.height === next.height && prev.padTop === next.padTop && prev.padBottom === next.padBottom ? prev : next,
      );
    };
    const onScroll = () => setScrolled((scroller ? scroller.scrollTop : window.scrollY) > 0);
    measure();
    onScroll();
    window.addEventListener("resize", measure);
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (scroller && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(scroller);
    }
    return () => {
      window.removeEventListener("resize", measure);
      target.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [el]);
  return { box, scrolled };
}

/** An element's own height (offsetHeight), kept current as it resizes. */
function useOffsetHeight(el: HTMLElement | null): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setHeight((prev) => (prev === el.offsetHeight ? prev : el.offsetHeight));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return height;
}

/** True once the element has scrolled up past `cover` pixels from the top of
 *  the screen (the sticky top line): the column's decision card is out of
 *  sight, so its buttons may show in the bar at the foot. */
function useScrolledPast(el: HTMLElement | null, cover: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const rootTop = entry.rootBounds?.top ?? 0;
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < rootTop);
      },
      { rootMargin: `-${Math.max(0, Math.round(cover))}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, cover]);
  return past;
}

function barClass(variant: BarAction["variant"]) {
  return variant === "primary" ? "ck-btn ck-btn-primary" : "ck-btn ck-btn-outline";
}

const DANGER_STYLE = { color: "var(--hf-danger)", borderColor: "color-mix(in srgb, var(--hf-danger) 50%, transparent)" };

/**
 * "More" on the phone's decision bar: whatever does not fit in three buttons.
 * The menu is portalled to <body>: the page's entrance animation leaves a
 * transform on an ancestor for a moment, and a transformed ancestor traps a
 * fixed child (and its z-index) inside itself.
 */
function MoreMenu({ items, pulse }: { items: BarAction[]; pulse: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setPos({ right: Math.max(8, window.innerWidth - r.right), bottom: window.innerHeight - r.top + 8 });
  }, []);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
      if (buttons.length === 0) return;
      e.preventDefault();
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
      buttons[next].focus();
    };
    // A rotated phone or a resized window moves the button: close rather than float.
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [open, pos]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        // ! on the display utility: .ck-btn's own display comes later in the
        // cascade and would otherwise keep "More" on the desktop bar.
        className={`ck-btn ck-btn-outline min-h-[44px] flex-none md:!hidden${pulse ? " ck-node-pulse" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // The tab bar right under it has a "More" of its own (the app's other
        // pages): this one names what it holds, and its chevron opens upward.
        aria-label="More actions"
        onClick={() => setOpen((o) => !o)}
      >
        More
        <ChevronUp className="h-4 w-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="More actions"
            className="fixed z-[55] flex min-w-[220px] max-w-[calc(100vw-16px)] flex-col gap-0.5 rounded-[12px] border p-1.5"
            style={{
              right: pos.right,
              bottom: pos.bottom,
              background: "var(--hf-surface)",
              borderColor: "var(--hf-border-strong)",
              boxShadow: "var(--hf-shadow-raised)",
            }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className="ck-btn ck-btn-ghost min-h-[44px] w-full !justify-start"
                style={item.variant === "danger" ? { color: "var(--hf-danger)" } : { color: "var(--hf-text)" }}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {/* Every label starts on the same line, icon or not. */}
                {item.icon ?? <span aria-hidden className="h-4 w-4 shrink-0" />}
                {item.text}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/** "3 of 64 ‹ ›" through the list the owner came from (its tab, filters and
 *  sort, as the list wrote it to sessionStorage). Each turn replaces this
 *  profile in history, so Back still lands on the list. */
/**
 * What the pager's move carries, so the next profile knows it was turned to,
 * not opened: the journey rail draws itself for the person a visit opens and
 * is simply in place for the ones the pager turns to (with the walk replaying
 * each time, 54 applicants were 54 replays; docs/APPLICANT-PROFILE.md "How the
 * journey rail moves"). It rides the navigation because the cockpit's shell
 * remounts the whole page for every person, so nothing kept in memory here
 * survives the move.
 */
const PAGER_MOVE = { pagerMove: true } as const;

function Pager({ position, total, prevId, nextId }: { position: number; total: number; prevId: string | null; nextId: string | null }) {
  const navigate = useNavigate();
  const go = (target: string | null) => {
    if (target) navigate(`/applicants/${target}`, { replace: true, state: PAGER_MOVE });
  };
  const arrow =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border disabled:opacity-30 md:h-7 md:w-7";
  const arrowStyle = { borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)" };
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px] tabular-nums" style={{ color: "var(--ink-3)" }}>
      <button type="button" data-size="icon" aria-label="Previous applicant" disabled={!prevId} onClick={() => go(prevId)} className={arrow} style={arrowStyle}>
        <ChevronLeft className="h-4 w-4 md:h-3.5 md:w-3.5" />
      </button>
      <span aria-live="polite">
        {position} of {total}
      </span>
      <button type="button" data-size="icon" aria-label="Next applicant" disabled={!nextId} onClick={() => go(nextId)} className={arrow} style={arrowStyle}>
        <ChevronRight className="h-4 w-4 md:h-3.5 md:w-3.5" />
      </button>
    </span>
  );
}

function CandidateProfile({
  id,
  pageWidth,
  railEntrance,
}: {
  id: string | undefined;
  pageWidth: number | null;
  /** Whether the journey rail draws itself ("draw") or is simply in place ("none"). */
  railEntrance: "draw" | "none";
}) {
  const navigate = useNavigate();
  const { isTeamMember } = useAuth();
  const { candidate: c, application, isLoading, isError, refetch } = useCockpitCandidate(id);
  const { advance, hire, reject, letContinue, isUpdating } = useCockpitActions();
  const [dialog, setDialog] = useState<ApplicantDecision | null>(null);
  const [hirePrompt, setHirePrompt] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // The guided moment after a move to Interview — "want to propose times now?"
  const [interviewMoment, setInterviewMoment] = useState(false);
  // A brief pulse on "Set up interview" after "Later" — the visible hint for
  // where scheduling lives, without forcing the wizard on anyone.
  const [scheduleHint, setScheduleHint] = useState(false);
  const [recordKey, setRecordKey] = useState<string | null>(null);
  // An integrity alert opens on that test's timeline (see Notifications).
  const [recordFocus, setRecordFocus] = useState<"integrity" | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Remove and block / Unblock, from the ⋯ beside the pager (the phone's More).
  const blocks = useBlockedApplicants();
  const [blockRequest, setBlockRequest] = useState<ApplicantActionRequest | null>(null);
  const now = useNow(30_000);
  // The server's record of every attempt (live through useEmployerLiveSync).
  const { data: sessions } = useApplicationSessions(id ?? null);
  // The list's order, read once: this page remounts for every person it shows.
  const [order] = useState(() => readApplicantOrder());
  const pager = pagerFor(order, id);
  // The decision bar. On a phone it is fixed to the foot of the screen and
  // portalled to <body>: a transformed ancestor (the cockpit's entrance
  // animations leave one behind) turns `fixed` into "fixed to the page
  // column" (it sat at the end of the profile, off screen). In the column
  // layout the card's own buttons sit in a bar sticky at the foot of the
  // page, inside whatever scrolls it; sticky measures from inside the
  // scroller's padding, so the offset takes that padding back off.
  const isMobile = useIsMobile();
  // The two columns from DESKTOP_PAGE of the page's own width
  // (docs/APPLICANT-PROFILE.md). Until the page has been measured (the first
  // render, before anything is painted), the window's 1200px stands in.
  const windowDesktop = useMinWidth(1200);
  const width = pageWidth ?? 0;
  const measured = width > 0;
  const isDesktop = measured ? width >= DESKTOP_PAGE : windowDesktop;
  // The list's tab, said beside Back ("Back to applicants · Needs review").
  const [listTab] = useState(() => readApplicantTab());
  // The sticky top line, the scroller it sits in, and the right column's
  // parts: whether the whole column fits on the screen decides what stays.
  const [lineEl, setLineEl] = useState<HTMLDivElement | null>(null);
  const { box: scrollerBox, scrolled } = useScroller(isMobile ? null : lineEl);
  const lineHeight = useOffsetHeight(isMobile ? null : lineEl);
  const [decideEl, setDecideEl] = useState<HTMLDivElement | null>(null);
  const [panelsEl, setPanelsEl] = useState<HTMLDivElement | null>(null);
  const decideHeight = useOffsetHeight(isDesktop && !isMobile ? decideEl : null);
  const panelsHeight = useOffsetHeight(isDesktop && !isMobile ? panelsEl : null);
  // The column layout's decision card: once it has scrolled away under the
  // top line, its buttons show in the bar at the foot (never both at once).
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const cardGone = useScrolledPast(!isMobile && !isDesktop ? cardEl : null, (scrollerBox?.top ?? 0) + (scrollerBox?.padTop ?? 0) + (lineHeight ?? 0));
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  const [stickyBottom, setStickyBottom] = useState(16);
  useLayoutEffect(() => {
    if (isMobile || !barEl) return;
    const measure = () => {
      const scroller = scrollerOf(barEl);
      const pad = scroller ? parseFloat(getComputedStyle(scroller).paddingBottom) || 0 : 0;
      setStickyBottom(16 - pad);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isMobile, barEl]);

  // A "New application" alert can be tapped before the list it opens has heard
  // of the person, so a missing id gets one fresh fetch before the page says
  // they cannot be found. Once per id; a failed fetch shows the error card.
  const recheckedFor = useRef<string | null>(null);
  const [recheckDoneFor, setRecheckDoneFor] = useState<string | null>(null);
  const missing = !isLoading && !isError && !c && !!id;
  useEffect(() => {
    if (!missing || !id || recheckedFor.current === id) return;
    recheckedFor.current = id;
    refetch().finally(() => setRecheckDoneFor(id));
  }, [missing, id, refetch]);
  const stillLooking = missing && recheckDoneFor !== id;

  // What they submitted, test by test — the one record the rail, the list's
  // row and "What they submitted" all read.
  const record = useMemo(
    () => (application ? buildAssessmentRecord(application as unknown as AssessmentAppInput, { sessions, now }) : null),
    [application, sessions, now],
  );
  const status = application?.status;
  const dots = useMemo(() => journeyDots(record, status), [record, status]);
  // The list's own row for this person (listRowFor): the country, the live
  // dot and the line beside the name read exactly as the row they came from.
  const listRow = useMemo(
    () => (application && record ? listRowFor(application as unknown as ApplicantListApp, record, null, now, { sessions }) : null),
    [application, record, now, sessions],
  );
  const openEntry = recordKey ? record?.entries.find((e) => e.key === recordKey) ?? null : null;
  const openRecord = (entry: AssessmentEntry) => {
    setRecordFocus(null);
    if (entry.kind === "resume") setResumeOpen(true);
    else setRecordKey(entry.key);
  };

  // `?record=<step id>` (an integrity alert's link) opens that test's record
  // once the person is loaded; `&focus=integrity` lands on its timeline. The
  // parameters are then dropped, so closing the sheet does not reopen it.
  const recordParam = searchParams.get("record");
  useEffect(() => {
    if (!recordParam || !record) return;
    if (record.entries.some((e) => e.key === recordParam)) {
      setRecordKey(recordParam);
      setRecordFocus(searchParams.get("focus") === "integrity" ? "integrity" : null);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("record");
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [recordParam, record, searchParams, setSearchParams]);

  // The hint pulse is a moment, not a standing state — it fades on its own.
  useEffect(() => {
    if (!scheduleHint) return;
    const t = setTimeout(() => setScheduleHint(false), 5600);
    return () => clearTimeout(t);
  }, [scheduleHint]);

  // Go back to where they came from (the applicants list, which keeps its
  // tab, filters and scroll in its URL); fall back to the list if this was a
  // deep link.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/applicants");
  };

  // Two different held states, and they must not read the same. Wax does not
  // spin, so the wait is the breathing seal plus a line saying what it's doing.
  if (isLoading || stillLooking) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-[640px] flex-col items-center justify-center gap-4">
        <span className="ck-seal-breathe">
          <AvaSeal size={44} />
        </span>
        <p className="text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>Pulling up their record…</p>
      </div>
    );
  }

  // A failed load must never read as "I can't find that applicant any more" —
  // that says the record is gone; a failed fetch says nothing of the kind.
  if (isError) {
    return (
      <div className="mx-auto max-w-[640px] pt-10">
        <CockpitErrorCard message="We couldn't load this applicant just now." onRetry={refetch} />
      </div>
    );
  }

  // A stale bookmark or a withdrawn application lands here with nothing to show.
  // It used to spin forever above the only way out, so say it and offer the door.
  if (!c) {
    return (
      <div className="mx-auto max-w-[640px] pt-10">
        <div className="ck-card-flat px-4 py-8 text-center">
          <span className="inline-flex"><AvaSeal size={28} /></span>
          <p className="mt-3 text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
            I can't find that applicant any more. The application may have been withdrawn or removed.
          </p>
          <button
            type="button"
            className="ck-btn ck-btn-outline mt-3 !py-2 !text-[12.5px]"
            onClick={() => navigate("/applicants")}
          >
            Back to applicants
          </button>
        </div>
      </div>
    );
  }

  const isHired = status === "hired";
  const isRejected = status === "rejected";
  const isOffered = status === "offered";
  const isTerminal = isHired || isRejected;
  const canAdvance = !!nextAdvanceStatus(status);
  // The step "Let them take the next test" would open — same journey the
  // candidate's own screens build (candidateJourney.ts). Only while the
  // candidate is parked: the application is in the team's hands (submitted or
  // held), the step they stand on is done (its result is on file) and a real
  // step comes next. Never while a step is still theirs to take, never once
  // the application is decided.
  const appRow = application as
    | { phase?: string | null; notes?: string | null; voice_interview_result?: unknown; jobs?: { workflow_steps?: unknown; quiz_questions?: unknown } | null }
    | null;
  const quizQuestions = appRow?.jobs?.quiz_questions as unknown[] | undefined;
  const journey = buildCandidateJourney(appRow?.jobs?.workflow_steps as WorkflowStepLike[] | undefined, {
    hasQuiz: (Array.isArray(quizQuestions) && quizQuestions.length > 0) || c.quiz != null,
  });
  const where = { phase: appRow?.phase, status };
  const parked =
    (status === "pending" || status === "reviewing") &&
    stepHasResult(parseApplicationNotes(appRow?.notes), appRow?.voice_interview_result, positionFor(journey, where).current);
  const nextStep = parked ? nextJourneyStep(journey, where) : null;
  // `c.analyzed` is the single source of truth (computed once in `mapCandidate`) —
  // never re-derive this from `overall > 0`: a genuine finished score of 0 is a
  // real result and has to read as one, not fall back to looking unscored.
  const analyzed = c.analyzed;
  const advanceLabel = advanceTargetLabel(status);
  // The number the list shows: Ava's overall score (ai_score), "so far" while
  // she waits on tests, "—" until she has scored them. Never a quiz
  // percentage standing in for it.
  const score = applicantScore(application as { ai_score?: unknown; ai_scorecard?: unknown } | null);
  const resumeUrl = (application as { resume_url?: string | null } | null)?.resume_url ?? null;
  // Ava's own recommendation, not the score, decides how loud the buttons get:
  // a decline recommendation must never sit under a primary green Advance —
  // the human still decides, but the page can't be arguing against Ava's own
  // warning while she's making it.
  const declineRecommended = c.recommendedAction === "reject";
  // The chip beside the name, the list row's chip: Needs review (finished
  // every test, not decided), Interview, Offer, Hired or Declined.
  const chip = applicantChip(status, finishedEveryTest(dots));
  // Ava's flags are listed on her read once she has scored them; this card
  // keeps its own list only before that.
  const riskFlags = analyzed ? [] : (record?.riskFlags ?? c.riskFlags).filter((f) => f !== c.risk.note);
  const riskIconColor =
    c.risk.level === "High" || c.risk.level === "Medium" ? "var(--amber-fg)" : c.risk.level === "Low" ? "var(--hf-green)" : "var(--hf-text-muted)";

  const doAdvance = async () => {
    // Read the target before advancing — status flips the moment the
    // mutation lands, so this is the last point it's still knowable.
    const movingToInterview = advanceLabel === "Interview";
    if (application) await advance(c.id, application.status);
    setDialog(null);
    if (movingToInterview) setInterviewMoment(true);
  };
  const doContinue = async () => {
    if (nextStep) await letContinue(c.id, nextStep.id, nextStep.title);
    setDialog(null);
  };
  const doHire = async () => {
    await hire(c.id);
    setDialog(null);
    setHirePrompt(true);
  };
  const doReject = async (reason?: string) => {
    await reject(c.id, reason);
    setDialog(null);
  };
  const message = () => navigate(`/messages?candidate=${c.avatar}`);
  const first = firstName(c.name);

  // Remove and block: blocked people are off the list, so the profile says
  // so plainly, with Unblock beside it (their application stays declined).
  const candidateId = (application as { candidate_id?: string | null } | null)?.candidate_id ?? null;
  const blockRow = candidateId ? blocks.blocked.get(candidateId) ?? null : null;
  const blockTarget = { applicationId: c.id, candidateId, name: c.name };
  const blockAction: BarAction = blockRow
    ? { key: "block", text: "Unblock", icon: <RotateCcw className="h-4 w-4" />, variant: "outline", onClick: () => setBlockRequest({ kind: "unblock", target: blockTarget }) }
    : { key: "block", text: "Remove and block", icon: <Ban className="h-4 w-4" />, variant: "danger", onClick: () => setBlockRequest({ kind: "block", targets: [blockTarget] }) };
  // Pass is on the decision card already; the menu holds what is not.
  const profileMenuItems = applicantMenuItems({ target: blockTarget, status: status ?? "", blocked: !!blockRow, onRequest: setBlockRequest }).filter((item) => item.key !== "pass");
  const blockedNode = blockRow ? <BlockedNote blockedAt={blockRow.created_at} onUnblock={() => setBlockRequest({ kind: "unblock", target: blockTarget })} /> : null;

  // The decision bar, in the order it reads. On a phone the first buttons
  // stay and the rest go behind "More" (at most three on screen); from md up
  // every one is on the bar.
  const messageAction: BarAction = { key: "message", text: "Message", icon: <MessageSquare className="h-4 w-4" />, variant: "outline", onClick: message };
  let actions: BarAction[];
  // The same actions on the desktop's decision card: the one to press, the
  // two beside each other, anything else, and the quiet danger-toned one.
  let cardActions: DecisionCardActions;
  if (isOffered) {
    const hireAction: BarAction = { key: "hire", text: "Hire", icon: <CheckCircle2 className="h-4 w-4" />, variant: "primary", onClick: () => setDialog("hire"), disabled: isUpdating };
    // Same words as the dialog it opens, so the decision reads the same twice.
    const takeBack: BarAction = { key: "takeBack", text: "Take back offer", variant: "danger", onClick: () => setDialog("reject"), disabled: isUpdating };
    actions = [hireAction, takeBack, messageAction];
    cardActions = { primary: hireAction, pair: [messageAction], extra: [], quiet: takeBack };
  } else if (isTerminal) {
    actions = [messageAction];
    cardActions = { primary: null, pair: [messageAction], extra: [], quiet: null };
  } else {
    const advanceAction: BarAction | null = canAdvance
      ? {
          key: "advance",
          text: advanceLabel ? `Move to ${advanceLabel}` : "Move forward",
          cardText: advanceLabel ? `Move to ${advanceLabel.toLowerCase()}` : undefined,
          variant: "outline",
          onClick: () => setDialog("advance"),
          disabled: isUpdating,
        }
      : null;
    const setupAction: BarAction = { key: "setup", text: "Set up interview", variant: "outline", onClick: () => setScheduleOpen(true), pulse: scheduleHint };
    // Once they are in the interview stage, booking the time is the next
    // thing; before that, moving them on is. The human still decides — both
    // stay live, never disabled or hidden — but when Ava recommends declining
    // neither is filled, so the page is not nudging toward what she warned against.
    const [lead, other]: [BarAction, BarAction | null] =
      status === "interview" || !advanceAction ? [setupAction, advanceAction] : [advanceAction, setupAction];
    if (!declineRecommended) lead.variant = "primary";
    // Opens their next STEP (quiz, typing test, chat practice…), which Ava
    // holds back when she recommends declining. "Move to …" only moves the
    // pipeline stage.
    const continueAction: BarAction | null = nextStep
      ? { key: "continue", text: "Let them take the next test", variant: "outline", onClick: () => setDialog("continue"), disabled: isUpdating }
      : null;
    const passAction: BarAction = { key: "pass", text: "Pass", cardText: `Pass on ${first}`, variant: "outline", onClick: () => setDialog("reject"), disabled: isUpdating };
    actions = [...(continueAction ? [continueAction] : []), lead, passAction, ...(other ? [other] : []), messageAction];
    cardActions = {
      primary: lead,
      pair: [...(other ? [other] : []), messageAction],
      extra: continueAction ? [continueAction] : [],
      quiet: passAction,
    };
  }
  // Last: on a phone it lands in More unless the bar has room.
  actions = [...actions, blockAction];
  const split = splitActionBar(actions, 3);

  const barNode = (
    <div
      ref={setBarEl}
      // Phone: full width, above the cockpit's tab bar (the team member's
      // shell has none). Wider: the 640px column of the cards it acts on.
      className={
        // Phone: every button as tall as the tallest, so a label that wraps
        // ("Move to / Interview") does not leave the bar ragged.
        isMobile
          ? "fixed inset-x-0 z-30 flex items-stretch gap-2 px-4 py-3"
          : "sticky z-30 mt-3 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3"
      }
      style={{
        bottom: isMobile ? `calc(env(safe-area-inset-bottom, 0px) + ${isTeamMember ? 0 : 64}px)` : stickyBottom,
        // Solid: the cards scroll under it, and must not read through it.
        background: "var(--hf-bg)",
        borderTop: "1px solid var(--hf-surface-raised)",
      }}
    >
      {isTerminal && (
        <div
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold"
          style={
            isHired
              ? { background: "color-mix(in srgb, var(--hf-green) 16%, transparent)", color: "var(--hf-text-soft)", border: "1px solid color-mix(in srgb, var(--hf-green) 30%, transparent)" }
              : { background: "color-mix(in srgb, var(--hf-danger) 12%, transparent)", color: "var(--hf-danger)", border: "1px solid color-mix(in srgb, var(--hf-danger) 25%, transparent)" }
          }
        >
          {isHired ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {isHired ? "Hired" : "Not moving forward"}
        </div>
      )}
      {actions.map((a, i) => {
        const onPhone = i < split.shown.length;
        return (
          <button
            key={a.key}
            type="button"
            className={[
              barClass(a.variant),
              // Phone: the bar's width shared out, the lead button (the one
              // decision on screen) with the larger share; a long label wraps
              // rather than pushing the bar off the screen.
              "min-h-[44px] min-w-0 flex-1 !whitespace-normal text-center !leading-[1.2]",
              i === 0 ? "max-md:flex-[1.4]" : "",
              // Desktop: every button, at its own width, on one line, and one
              // height (filled, outlined and with an icon used to be 34, 36, 38).
              "md:h-9 md:min-h-0 md:flex-auto md:!whitespace-nowrap",
              // ! because .ck-btn's display comes later in the cascade.
              onPhone ? "" : "max-md:!hidden",
              a.pulse ? "ck-node-pulse" : "",
            ].join(" ")}
            style={a.variant === "danger" ? DANGER_STYLE : undefined}
            onClick={a.onClick}
            disabled={a.disabled}
          >
            {a.icon}
            {a.text}
          </button>
        );
      })}
      {split.more.length > 0 && <MoreMenu items={split.more} pulse={split.more.some((a) => a.pulse)} />}
    </div>
  );

  const dialogs = (
    <>
        {/* Blocked from here: back to the list, which no longer shows them. */}
        <ApplicantActionDialogs
          request={blockRequest}
          onClose={() => setBlockRequest(null)}
          onDone={(request, ok) => {
            if (request.kind === "block" && ok) goBack();
          }}
        />

        <ApplicantDecisionDialogs
          open={dialog}
          candidate={c}
          status={status}
          nextStep={nextStep}
          busy={isUpdating}
          onClose={() => setDialog(null)}
          onAdvance={() => void doAdvance()}
          onContinue={() => void doContinue()}
          onHire={() => void doHire()}
          onReject={(reason) => void doReject(reason)}
        />

        <HiringDocumentPromptDialog
          open={hirePrompt}
          onOpenChange={setHirePrompt}
          candidateName={c.name}
          jobTitle={c.role}
          applicationId={c.id}
          onSkip={() => setHirePrompt(false)}
        />

        {scheduleOpen && (
          <InterviewSchedulingWizard
            open={scheduleOpen}
            onOpenChange={(o) => {
              if (!o) setScheduleOpen(false);
            }}
            applicationId={c.id}
            candidateName={c.name}
            candidateEmail={c.email ?? undefined}
            jobTitle={c.role}
          />
        )}

        <AssessmentRecordSheet
          open={!!openEntry}
          entry={openEntry}
          candidateName={c.name}
          applicationId={c.id}
          jobId={record?.jobId ?? null}
          focus={recordFocus}
          onClose={() => {
            setRecordKey(null);
            setRecordFocus(null);
          }}
          onOpenResume={() => {
            // One modal at a time: the resume viewer takes over from the sheet.
            setRecordKey(null);
            setResumeOpen(true);
          }}
        />

        {/* A plain fixed overlay: portalled, so the page's leftover transform
            cannot pin it to the page column instead of the screen. */}
        {createPortal(
          <ResumeViewerDialog
            open={resumeOpen}
            url={resumeUrl}
            candidateName={c.name}
            avaRead={analyzed ? c.read : undefined}
            onClose={() => setResumeOpen(false)}
          />,
          document.body,
        )}
    </>
  );

  // ── 768px and up: the desktop's sections (docs/APPLICANT-PROFILE.md) ──
  if (!isMobile) {
    const deskApp = application as {
      notes?: string | null;
      ai_scorecard?: unknown;
      jobs?: { title?: string | null; application_questions?: unknown; quiz_questions?: unknown; passing_score?: number | null } | null;
    } | null;
    const answers = parseApplicationNotes(deskApp?.notes ?? null).applicationAnswers;
    const questions = deskApp?.jobs?.application_questions;
    const tiles = record
      ? testTiles(record.entries, { passing: deskApp?.jobs?.passing_score ?? null, questions, answers, quizQuestions: deskApp?.jobs?.quiz_questions })
      : [];
    const words = inTheirWords(questions, answers, deskApp?.jobs?.title ?? c.role);
    const glance = atAGlance(questions, answers);
    const contact = contactFacts(answers, c.email);
    const applicationEntry = record?.entries.find((e) => e.kind === "application" && e.openable) ?? null;
    const suggestion = avaSuggests(deskApp?.ai_scorecard, status, advanceLabel);
    const line = listRow ? headerLine(listRow, record?.live ?? null, agoWords, now) : null;
    const country = listRow && listRow.country !== UNKNOWN_COUNTRY ? listRow.country : null;
    const tabWords = pager && listTab && listTab !== "all" && listTab in TAB_LABELS ? TAB_LABELS[listTab as ApplicantTab] : null;

    const chipNode = chip ? (
      <span className="ck-pill" style={chipStyle(chip.tone)}>
        {chip.label}
      </span>
    ) : record?.live?.stepType !== "application" && c.fillingInForm ? (
      <span className="ck-pill ck-pill-stage-neutral">
        <span className="ck-dot ck-dot-live" aria-hidden />
        Filling in the form
      </span>
    ) : null;

    // Back and the pager stay on screen while the page scrolls (as they
    // always have; the page used to lose them past the first screen). The
    // line covers the scroller's top padding, so nothing shows above it.
    const padTop = scrollerBox?.padTop ?? 0;
    const topLine = (
      <div className="ckp-topline" data-stuck={scrolled ? "" : undefined} style={{ top: -padTop, marginTop: -padTop, paddingTop: padTop }}>
        <div ref={setLineEl} className="flex items-center gap-3 py-1.5">
          <button onClick={goBack} className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] transition-opacity hover:opacity-80" style={{ color: "var(--ink-2)" }}>
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">
              Back to applicants
              {tabWords && <span style={{ color: "var(--ink-3)" }}> · {tabWords}</span>}
            </span>
          </button>
          {pager && <Pager {...pager} />}
          <span className={pager ? "shrink-0" : "ml-auto shrink-0"}>
            <ActionsMenu label={`More actions for ${c.name}`} items={profileMenuItems} />
          </span>
        </div>
      </div>
    );

    const header = (
      <ApplicantHeaderBand
        name={c.name}
        initials={getInitials(c.name)}
        avatarUrl={listRow?.avatarUrl ?? null}
        liveNow={!!listRow?.liveNow}
        chip={chipNode}
        role={c.role}
        country={country}
        applied={c.appliedAgo}
        line={line}
        suggestion={suggestion}
        score={score}
      />
    );

    // The wide rail only where every step's column has room for its longest
    // word; narrower (the team member's shell at a tablet's width), the
    // phone's rail, which hyphenates for its narrow columns.
    const wideRail = !measured || width >= Math.max(620, dots.length * WIDE_RAIL_PER_STEP);
    const journeyNode =
      dots.length > 0 ? (
        <section className="ckp-journey" aria-label="Where they are">
          <ApplicantJourneyRail
            dots={dots}
            status={status}
            name={c.name}
            liveStepId={record?.live?.stepId ?? null}
            line={{ live: record?.live ?? null, sessions, recommendedAction: c.recommendedAction, now }}
            wide={wideRail}
            showSummary={false}
            entrance={railEntrance}
          />
        </section>
      ) : null;
    const headSplit = measured && width < HEAD_SPLIT_BELOW ? "split" : undefined;

    const outcome = isHired ? "hired" : isRejected ? "rejected" : null;

    // The main column: Ava's read, the tests, their own words, and everything
    // else the profile has always shown, each its own open section.
    const main = (
      <>
        {interviewMoment && (
          <div className="ckp-sec">
            <InterviewMoment
              name={c.name}
              onPropose={() => {
                setScheduleOpen(true);
                setInterviewMoment(false);
              }}
              onLater={() => {
                setInterviewMoment(false);
                setScheduleHint(true);
              }}
            />
          </div>
        )}

        <AvasRead candidate={c} app={application as AvasReadApp | null} record={record} showScore={false} variant="open" />

        {tiles.length > 0 && (
          <ProfileSection title="Tests" sub="Open any one for every answer, the transcript and the timing">
            <ApplicantTestTiles tiles={tiles} onOpen={openRecord} />
            {!resumeUrl && !c.fillingInForm && (
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                No resume was attached.
              </p>
            )}
          </ProfileSection>
        )}

        <ApplicantInTheirWords words={words} onAll={applicationEntry ? () => openRecord(applicationEntry) : null} />

        {/* Real strengths only (see extractStrengths in mappers.ts). */}
        {c.strengths.length > 0 && (
          <ProfileSection title="Top strengths">
            <ul className="grid grid-cols-1 gap-x-7 gap-y-1 min-[900px]:grid-cols-2">
              {c.strengths.map((s, i) => {
                const Icon = STRENGTH_ICONS[i % STRENGTH_ICONS.length];
                return (
                  <li key={s} className="flex items-start gap-2.5 py-1.5 text-[13.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--hf-green-soft)", color: "var(--hf-green)" }}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">{s}</span>
                  </li>
                );
              })}
            </ul>
          </ProfileSection>
        )}

        <ProfileSection title="Risk factors">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-[1px] h-5 w-5 shrink-0" style={{ color: riskIconColor }} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>
                  {c.risk.level}
                </span>{" "}
                — {c.risk.note}
              </p>
              {riskFlags.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {riskFlags.map((flag) => (
                    <li key={flag} className="flex items-start gap-2.5 text-[13px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                      <span aria-hidden className="mt-[7px] block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--amber-fg)" }} />
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ProfileSection>
      </>
    );

    // At a glance, integrity and the timeline: the right column's, under the
    // decision card; in one column, their own section.
    const glancePanel = <ApplicantAtAGlance rows={glance} phone={contact.phone} email={contact.email} />;
    const integrityPanel = <ApplicantIntegrityPanel record={record} onOpen={openRecord} />;
    const timelinePanel = record && record.entries.length > 0 && (
      <section aria-label="Timeline">
        <PanelLabel>Timeline</PanelLabel>
        <ApplicantTimeline app={application as TimelineApp | null} record={record} layout="list" />
      </section>
    );

    if (isDesktop) {
      // The right column stays whole on screen when it fits between the top
      // line and the page's foot; otherwise only the decision card stays and
      // the panels scroll with the page (cockpit.css, .ckp-aside).
      const line = lineHeight ?? 36;
      const stickyTop = line + 12;
      const room = scrollerBox ? scrollerBox.height - scrollerBox.padTop - scrollerBox.padBottom - stickyTop - 8 : null;
      const columnHeight = decideHeight != null && panelsHeight != null ? decideHeight + 18 + panelsHeight : null;
      const fit = room != null && columnHeight != null && columnHeight > room ? "card" : "whole";
      return (
        <div data-profile-layout="desktop" data-ckp-head={headSplit}>
          {topLine}
          {header}
          {blockedNode && <div className="mt-4">{blockedNode}</div>}
          {journeyNode}
          <div className="ckp-body">
            <div className="min-w-0">{main}</div>
            <aside
              className="ckp-aside"
              data-fit={fit}
              aria-label="Your decision and the facts"
              style={{ "--ckp-line": `${line}px`, "--ckp-sticky-top": `${stickyTop}px` } as CSSProperties}
            >
              <div className="ckp-decide-wrap">
                <div ref={setDecideEl}>
                  <ApplicantDecisionCard actions={cardActions} outcome={outcome} />
                </div>
              </div>
              <div ref={setPanelsEl} className="ckp-panels">
                {glancePanel}
                {integrityPanel}
                {timelinePanel}
              </div>
            </aside>
          </div>
          {dialogs}
        </div>
      );
    }

    // One full-width column. The decision card right after the header; once
    // it has scrolled away, the same buttons (the card's own words and
    // styles) in a bar at the foot.
    return (
      <div className="pb-6" data-profile-layout="column" data-ckp-head={headSplit}>
        {topLine}
        {header}
        {blockedNode && <div className="mt-4">{blockedNode}</div>}
        <div ref={setCardEl} className="mt-5">
          <ApplicantDecisionCard actions={cardActions} outcome={outcome} layout={!measured || width >= CARD_ROW_FROM ? "row" : "stack"} />
        </div>
        {journeyNode}
        <div className="mt-[26px]">
          {main}
          <div className="ckp-sec">
            <div className={`grid gap-8 ${!measured || width >= 680 ? "grid-cols-2" : "grid-cols-1"}`}>
              {glancePanel}
              <div className="ckp-panels">
                {integrityPanel}
                {timelinePanel}
              </div>
            </div>
          </div>
        </div>
        <div
          ref={setBarEl}
          className="ckp-footbar sticky z-30 mt-3 rounded-2xl px-4 py-3"
          data-shown={cardGone ? "" : undefined}
          aria-hidden={!cardGone}
          style={{ bottom: stickyBottom, background: "var(--hf-bg)", borderTop: "1px solid var(--hf-surface-raised)" }}
        >
          <ApplicantDecisionCard actions={cardActions} outcome={outcome} layout="bar" />
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    // pb-36 on a phone keeps the last card clear of the fixed decision bar.
    <div className="mx-auto max-w-[640px] pb-36 md:pb-6">
      {/* Sticky back — stays pinned to the top of the profile while scrolling, so
          there's always a clear way back to the list (it used to scroll away).
          The pager sits at its other end when the list sent its order. */}
      <div
        className="sticky top-0 z-20 mb-3 flex items-center gap-3 py-2.5"
        style={{ background: "hsl(var(--ck-bg) / 0.85)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      >
        {/* desktop */}
        <button
          onClick={goBack}
          className="hidden items-center gap-1.5 text-[13.5px] transition-opacity hover:opacity-80 md:inline-flex"
          style={{ color: "var(--hf-text-soft)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to applicants
        </button>
        {/* mobile */}
        <button onClick={goBack} aria-label="Back to applicants" className="md:hidden" style={{ color: "var(--hf-text)" }}>
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="min-w-0 flex-1 truncate font-display text-[18px] md:hidden" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
          {c.name}
        </span>
        {pager && <Pager {...pager} />}
      </div>

      <div className="space-y-3">
        {blockedNode}
        <div className="ck-card flex items-center gap-4 p-4">
          {/* No score yet → no arc. The ring must not draw a 0 as a verdict. */}
          <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={72} score={score.value ?? undefined} rich variant="signal" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[24px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>{c.name}</div>
            <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>{c.role} · {c.appliedAgo}</div>
            {chip ? (
              <div className="mt-1.5">
                <span className="ck-pill" style={chipStyle(chip.tone)}>
                  {chip.label}
                </span>
              </div>
            ) : record?.live?.stepType !== "application" && c.fillingInForm ? (
              // Pressed Apply, still on the form: live, not "Application".
              // (Once the form saves as they type, the live line below says
              // it with the count: "Filling in the form · 6 of 11 answered".)
              <div className="mt-1.5">
                <span className="ck-pill ck-pill-stage-neutral">
                  <span className="ck-dot ck-dot-live" aria-hidden />
                  Filling in the form
                </span>
              </div>
            ) : null}
            {/* Part-way through a test right now, or gone from it. */}
            {record?.live && !isTerminal && (
              <div
                className="mt-1.5 flex items-start gap-1.5 text-[12px] font-semibold leading-[1.4]"
                style={{ color: record.live.state === "doing" ? "var(--hf-text-soft)" : liveTone(record.live.state) }}
              >
                <LiveDot state={record.live.state} className="mt-[4.5px]" />
                <span>{record.live.summary}</span>
              </div>
            )}
          </div>
          {/* The score once, in the list's colours: jade at 70 and up, brass
              50–69, ink under. Unscored is "—", not "0" — a 0 would be a claim. */}
          <div className="text-right">
            <div className="ck-num" style={{ fontSize: 38, fontWeight: 600, lineHeight: 0.85, color: scoreColor(score.band) }}>
              {score.value ?? "—"}
              {score.value != null && <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>/100</span>}
            </div>
            <div className="mt-1.5 text-[12px]" style={{ color: "var(--hf-text-muted)" }}>
              {score.value == null ? "not scored yet" : score.soFar ? "so far" : "match"}
            </div>
          </div>
        </div>

        {/* The guided next step after a move to Interview. */}
        {interviewMoment && (
          <InterviewMoment
            name={c.name}
            onPropose={() => {
              setScheduleOpen(true);
              setInterviewMoment(false);
            }}
            onLater={() => {
              setInterviewMoment(false);
              setScheduleHint(true);
            }}
          />
        )}

        {/* Where they are: one gem per step of THEIR job, each decided by
            their record, never by position. */}
        {dots.length > 0 && (
          <section className="ck-card px-4 pb-1 pt-3.5" aria-labelledby="ck-journey-label">
            <span
              id="ck-journey-label"
              className="block text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
              style={{ color: "var(--ink-3)" }}
            >
              Where they are
            </span>
            <ApplicantJourneyRail
              dots={dots}
              status={status}
              name={c.name}
              liveStepId={record?.live?.stepId ?? null}
              line={{ live: record?.live ?? null, sessions, recommendedAction: c.recommendedAction, now }}
              entrance={railEntrance}
            />
          </section>
        )}

        <div>
          <AvasRead candidate={c} app={application as AvasReadApp | null} record={record} showScore={false} />
          <ApplicantTimeline app={application as TimelineApp | null} record={record} />
        </div>

        {/* What they submitted — every test the job gives them, in order, each
            finished one opening its full record. Right under Ava's read, so
            her review and their own material sit side by side. */}
        {record && record.entries.length > 0 && (
          <div className="ck-card p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div className="font-display text-[16px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                What they submitted
              </div>
              {record.integrityTotal > 0 && (
                <span className="text-[12px] font-semibold" style={{ color: "var(--amber-fg)" }}>
                  {record.integrityTotal} {record.integrityTotal === 1 ? "flag" : "flags"}
                </span>
              )}
            </div>
            <AssessmentRecordList entries={record.entries} onOpen={openRecord} label={null} />
            {!resumeUrl && !c.fillingInForm && (
              <p className="mt-2.5 text-[12px]" style={{ color: "var(--hf-text-muted)" }}>
                No resume was attached.
              </p>
            )}
          </div>
        )}

        {/* Real strengths only (see extractStrengths in mappers.ts) — when Ava
            hasn't produced any worth showing, the card is left out entirely
            rather than rendering a heading over nothing, or worse, scaffolding. */}
        {c.strengths.length > 0 && (
          <div className="ck-card p-4">
            <div className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Top strengths</div>
            <div className="mt-2 space-y-1">
              {c.strengths.map((s, i) => {
                const Icon = STRENGTH_ICONS[i % STRENGTH_ICONS.length];
                return (
                  <div key={s} className="flex items-start gap-2.5 py-1.5 text-[13px]" style={{ color: "var(--hf-text)" }}>
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--hf-green-soft)", color: "var(--hf-green)" }}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1">{s}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="ck-card flex items-center gap-3 p-4">
          {/* Green means clean everywhere else in this cockpit — an elevated
              risk level gets the same amber treatment as the alert callouts,
              never a green "all clear" shield over a High risk. */}
          <ShieldCheck className="h-5 w-5 shrink-0 self-start" style={{ color: riskIconColor }} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Risk factors</div>
            <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>{c.risk.level} — {c.risk.note}</div>
            {riskFlags.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {riskFlags.map((flag) => (
                  <li key={flag} className="flex items-start gap-2.5 text-[12.5px] leading-[1.45]" style={{ color: "var(--hf-text-soft)" }}>
                    <span aria-hidden className="mt-[6px] block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--amber-fg)" }} />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {isMobile ? createPortal(barNode, document.body) : barNode}

      {dialogs}
    </div>
  );
}
