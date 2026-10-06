import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import InterviewSchedulingWizard from "@/components/InterviewSchedulingWizard";
import { CandidateMark } from "../components/CandidateMark";
import { CockpitErrorCard } from "../components/ErrorCard";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { useApplicationSessions, useNow } from "../hooks/useAssessmentSessions";
import { buildAssessmentRecord, liveTone, type AssessmentAppInput, type AssessmentEntry } from "../lib/assessmentRecord";
import {
  applicantChip,
  applicantScore,
  finishedEveryTest,
  journeyDots,
  pagerFor,
  readApplicantOrder,
  scoreColor,
  splitActionBar,
  type ApplicantChip,
} from "../lib/applicantProfile";

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];

/**
 * The full profile, /applicants/:id — everything one applicant submitted and
 * every decision about them. Since the Applicants page became a list
 * (docs/APPLICANTS-LIST.md §4) this page carries what that page's side panel
 * used to: where they are on the job's journey (the same dot rule as the
 * list's), Ava's read with their own words, the timeline, Set up interview,
 * and "3 of 64 ‹ ›" through the list they came from.
 */

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

export default function CockpitCandidateDetail() {
  const { id } = useParams();
  const top = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollToTopOf(top.current);
  }, [id]);
  // One person per mount. The pager moves between people on this same route,
  // and the team member's shell does not remount the page on a new id the way
  // the cockpit's does — so an open sheet or dialog never follows to the next.
  return (
    <div ref={top}>
      <CandidateProfile key={id ?? ""} id={id} />
    </div>
  );
}

/** One button on the decision bar. */
interface BarAction {
  key: "continue" | "advance" | "setup" | "pass" | "message" | "hire" | "takeBack";
  text: string;
  icon?: ReactNode;
  variant: "primary" | "outline" | "danger";
  onClick: () => void;
  disabled?: boolean;
  pulse?: boolean;
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
function Pager({ position, total, prevId, nextId }: { position: number; total: number; prevId: string | null; nextId: string | null }) {
  const navigate = useNavigate();
  const go = (target: string | null) => {
    if (target) navigate(`/applicants/${target}`, { replace: true });
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

function CandidateProfile({ id }: { id: string | undefined }) {
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
  const now = useNow(30_000);
  // The server's record of every attempt (live through useEmployerLiveSync).
  const { data: sessions } = useApplicationSessions(id ?? null);
  // The list's order, read once: this page remounts for every person it shows.
  const [order] = useState(() => readApplicantOrder());
  const pager = pagerFor(order, id);
  // The decision bar. On a phone it is fixed to the foot of the screen and
  // portalled to <body>: a transformed ancestor (the cockpit's entrance
  // animations leave one behind) turns `fixed` into "fixed to the page
  // column" (it sat at the end of the profile, off screen). On a wider
  // screen it is sticky at the foot of the 640px column, inside whatever
  // scrolls the page; sticky measures from inside the scroller's padding, so
  // the offset takes that padding back off.
  const isMobile = useIsMobile();
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

  // The decision bar, in the order it reads. On a phone the first buttons
  // stay and the rest go behind "More" (at most three on screen); from md up
  // every one is on the bar.
  const messageAction: BarAction = { key: "message", text: "Message", icon: <MessageSquare className="h-4 w-4" />, variant: "outline", onClick: message };
  let actions: BarAction[];
  if (isOffered) {
    actions = [
      { key: "hire", text: "Hire", icon: <CheckCircle2 className="h-4 w-4" />, variant: "primary", onClick: () => setDialog("hire"), disabled: isUpdating },
      // Same words as the dialog it opens, so the decision reads the same twice.
      { key: "takeBack", text: "Take back offer", variant: "danger", onClick: () => setDialog("reject"), disabled: isUpdating },
      messageAction,
    ];
  } else if (isTerminal) {
    actions = [messageAction];
  } else {
    const advanceAction: BarAction | null = canAdvance
      ? { key: "advance", text: advanceLabel ? `Move to ${advanceLabel}` : "Move forward", variant: "outline", onClick: () => setDialog("advance"), disabled: isUpdating }
      : null;
    const setupAction: BarAction = { key: "setup", text: "Set up interview", variant: "outline", onClick: () => setScheduleOpen(true), pulse: scheduleHint };
    // Once they are in the interview stage, booking the time is the next
    // thing; before that, moving them on is. The human still decides — both
    // stay live, never disabled or hidden — but when Ava recommends declining
    // neither is filled, so the page is not nudging toward what she warned against.
    const [lead, other]: [BarAction, BarAction | null] =
      status === "interview" || !advanceAction ? [setupAction, advanceAction] : [advanceAction, setupAction];
    if (!declineRecommended) lead.variant = "primary";
    actions = [
      // Opens their next STEP (quiz, typing test, chat practice…), which Ava
      // holds back when she recommends declining. "Move to …" only moves the
      // pipeline stage.
      ...(nextStep ? [{ key: "continue", text: "Let them take the next test", variant: "outline", onClick: () => setDialog("continue"), disabled: isUpdating } as BarAction] : []),
      lead,
      { key: "pass", text: "Pass", variant: "outline", onClick: () => setDialog("reject"), disabled: isUpdating },
      ...(other ? [other] : []),
      messageAction,
    ];
  }
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
    </div>
  );
}
