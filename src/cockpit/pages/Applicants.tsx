import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Navigate, useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { CheckSquare, ChevronRight } from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile, useMinWidth } from "@/hooks/use-mobile";
import { useEmployerJobs } from "@/hooks/useJobs";
import { clearDraft } from "@/lib/avaEngine/draft";
import { SearchInput } from "../components/controls";
import { CockpitErrorCard } from "../components/ErrorCard";
import { ShareJobCompact, applyLinkFor } from "../components/ShareJobCard";
import { ShareKitDialog } from "../components/ShareKitDialog";
import { APPLICANT_TABLE_MIN, ApplicantCard, ApplicantTableHeader, ApplicantTableRow, DotLegend } from "../components/ApplicantRow";
import {
  ApplicantFilterBar,
  ApplicantFilterSheet,
  FiltersButton,
  SortControl,
  type FilterGroup,
  type FilterKey,
} from "../components/ApplicantFilters";
import { ListUpdatesBar } from "../components/ListUpdatesBar";
import { useApplicantList, useHeldApplicantList } from "../hooks/useApplicantList";
import { mapJobRow } from "../lib/mappers";
// Remove and block, and picking several at once (docs/APPLICANTS-LIST.md §6).
import { ActionsMenu, ApplicantActionDialogs, applicantMenuItems, type ApplicantActionRequest } from "../components/ApplicantRowMenu";
import { ApplicantBulkBar, ApplicantRowFrame, SelectMark } from "../components/ApplicantBulkBar";
import { useBlockedApplicants } from "../hooks/useApplicantBlocks";
import { markBlocked } from "../lib/blockedApplicants";
import { writeApplicantOrder, writeApplicantTab } from "../lib/applicantProfile";
import {
  APPLIED_OPTIONS,
  BELOW_OPTIONS,
  FLAG_OPTIONS,
  PAGE_SIZE,
  SCORE_OPTIONS,
  SORT_OPTIONS,
  TAB_OPTIONS,
  activeFilterCount,
  applyListState,
  countryOptions,
  optionCounts,
  parseListState,
  profileRedirectFor,
  serializeListState,
  whereOptions,
  type ApplicantListRow,
  type ApplicantListState,
  type ApplicantTab,
  type SortKey,
} from "../lib/applicantList";

/**
 * Applicants: a list, and nothing else (docs/APPLICANTS-LIST.md, approved by
 * the owner on 2026-10-06 from docs/mockups/applicants-list-*.png). His words:
 * "when I click on applicants, it only should show me the applicants … Just a
 * list of applicants. I can click through … Imagine I have 105 applicants …
 * I can actually filter those out."
 *
 * One row per person: who, where they are in the job's own steps (the dots),
 * when they last did something, their flags and Ava's score. A row opens the
 * full profile at /applicants/:id, which holds everything they submitted and
 * every decision; nothing on this page decides anything.
 *
 * Tab, filters, sort, search and how many are shown live in the URL (written
 * with replace), so Back from a profile lands on the same view, at the same
 * scroll. The order on screen is handed to the profile for its "3 of 64 ‹ ›"
 * pager. Every row comes from useApplicantList (one slim load per job, kept
 * live by the shell's sync) and lib/applicantList.ts, which builds each one
 * with the same record reader the profile uses, so the two never disagree.
 */

/** Where the list keeps its scroll for the way back from a profile. */
const SCROLL_KEY = "applicantList.scroll.v1";
/** A saved scroll older than this is someone else's visit. */
const SCROLL_FRESH_MS = 60 * 60 * 1000;

const TAB_EMPTY: Record<ApplicantTab, string> = {
  all: "Nobody here yet.",
  "needs-review": "Nobody is waiting on your decision right now.",
  "taking-tests": "Nobody is taking a test right now.",
  "part-way": "Nobody is part-way through.",
  interview: "Nobody has been moved to interview yet.",
  declined: "You haven't declined anyone.",
  blocked: "Nobody is blocked.",
};

/** The phone's tab strip, faded on the side that has more pills behind it. */
function pillsFade(more: { left: boolean; right: boolean }): CSSProperties | undefined {
  if (!more.left && !more.right) return undefined;
  const mask = `linear-gradient(to right, ${more.left ? "transparent 0, #000 24px" : "#000 0"}, ${more.right ? "#000 calc(100% - 24px), transparent 100%" : "#000 100%"})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/** The phone's one word for each sort. */
const SORT_SHORT: Record<SortKey, string> = { score: "Score", newest: "Newest", "last-active": "Last active" };

/** True when the list itself has room for the table's columns. Measured on
 *  the page, not the window: the team member's shell has a wider sidebar than
 *  the owner's, and at 1024 its table would cut the Score column off. Until
 *  the page is on screen the window's width is the guess; the measurement
 *  lands before the first paint, so the table never flashes in as cards. */
function useFitsTable(el: HTMLElement | null): boolean {
  const guess = useMinWidth(1024);
  const [fits, setFits] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setFits(el.clientWidth >= APPLICANT_TABLE_MIN);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return fits ?? guess;
}

/** How long the rows' first rise-in runs: 0.48 s, plus up to 12 × 0.05 s of
 *  stagger (src/styles/motion.css), plus a margin. */
const REVEAL_MS = 1300;

/** What the page scrolls in: the shell's <main class="ck-scroll"> for the
 *  owner, whatever ancestor actually scrolls in the team member's shell, or
 *  null for the window. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n && n !== document.body; n = n.parentElement) {
    const { overflowY } = window.getComputedStyle(n);
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

function saveScroll(el: HTMLElement | null, search: string) {
  const parent = scrollParent(el);
  const top = parent ? parent.scrollTop : window.scrollY;
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ search, top, savedAt: Date.now() }));
  } catch {
    // Blocked storage: Back simply lands at the top.
  }
}

function readScroll(search: string): number | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "null") as { search?: string; top?: number; savedAt?: number } | null;
    if (!saved || saved.search !== search || typeof saved.top !== "number") return null;
    if (!saved.savedAt || Date.now() - saved.savedAt > SCROLL_FRESH_MS) return null;
    return saved.top;
  } catch {
    return null;
  }
}

/** Shaped like the page it becomes — head, tabs, filters, rows — so nothing
 *  slides at the moment the data lands. Ava's seal breathes at the head so
 *  the blocks read as pending, not as cards that failed to paint. */
function ListSkeleton() {
  const block = (w: number | string, h: number, i: number, extra = "", key?: number) => (
    <div key={key} className={`ck-reveal rounded-lg ${extra}`} style={{ ["--ck-i" as string]: i, width: w, height: h, background: "var(--surface)", opacity: 0.55 }} />
  );
  return (
    <div className="space-y-4" aria-busy="true">
      <header className="ck-rise flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="ck-seal-breathe">
          <AvaSeal size={22} title="I'm pulling up your applicants" />
        </span>
        {block(200, 26, 0)}
        {block(104, 13, 0)}
        {block(300, 42, 0, "ml-auto hidden md:block")}
      </header>
      <div className="flex gap-4">{[54, 104, 128, 76, 82, 76].map((w, i) => block(w, 13, i + 1, "", i))}</div>
      <div className="flex flex-wrap gap-2">{[150, 136, 100, 128, 112, 140].map((w, i) => block(w, 34, i + 1, "", i))}</div>
      <div className="flex flex-col gap-1.5">{[0, 1, 2, 3, 4].map((i) => block("100%", 74, i + 2, "rounded-[12px]", i))}</div>
    </div>
  );
}

/** The applications an action is about. */
function actionIds(request: ApplicantActionRequest): string[] {
  return request.kind === "block" ? request.targets.map((t) => t.applicationId) : [request.target.applicationId];
}

/** What a row can ask of the page. One object for the page's lifetime, so a
 *  row redraws only when its own applicant, pick or position changes. */
interface RowActions {
  /** The row's link was clicked: on cards in Select mode a tap picks; else
   *  the page keeps its scroll for the way back. */
  open: (row: ApplicantListRow, event: MouseEvent) => void;
  toggle: (id: string, range: boolean) => void;
  openProfile: (id: string) => void;
  select: (id: string) => void;
  request: (request: ApplicantActionRequest) => void;
}

/**
 * One applicant on the list, in the frame that carries its checkbox and ⋯
 * beside the link (ApplicantRowFrame); the frame takes the entrance fade so
 * they rise together. Memoised: during a flood every realtime event renders
 * the page, and redrawing 300 rows with their menus each time was a long
 * main-thread task per event (2026-10-07). The row object keeps its identity
 * while it says the same thing (createApplicantRowBuilder, markBlocked), and
 * the ⋯ menu builds its items only while it is open.
 */
const ApplicantListItem = memo(function ApplicantListItem({
  row,
  index,
  wide,
  picked,
  selecting,
  reveal,
  actions,
}: {
  row: ApplicantListRow;
  index: number;
  wide: boolean;
  picked: boolean;
  selecting: boolean;
  reveal: boolean;
  actions: RowActions;
}) {
  const pickable = row.tab !== "blocked";
  const select = pickable
    ? { checked: picked, label: `Select ${row.name}`, onToggle: (e: MouseEvent<HTMLButtonElement>) => actions.toggle(row.id, e.shiftKey) }
    : null;
  const menu = (
    <ActionsMenu
      size={wide ? 32 : 36}
      label={`More actions for ${row.name}`}
      items={() =>
        applicantMenuItems({
          target: { applicationId: row.id, candidateId: row.candidateId, name: row.name },
          status: row.status,
          blocked: !!row.blocked,
          jobTitle: row.jobTitle,
          onOpenProfile: () => actions.openProfile(row.id),
          onSelect: () => actions.select(row.id),
          onRequest: actions.request,
        })
      }
    />
  );
  return (
    <ApplicantRowFrame variant={wide ? "table" : "card"} menu={menu} select={select} selecting={selecting} selected={picked} reveal={reveal} index={index}>
      {wide ? <ApplicantTableRow row={row} index={index} onOpen={actions.open} reveal={false} /> : <ApplicantCard row={row} index={index} onOpen={actions.open} reveal={false} />}
    </ApplicantRowFrame>
  );
});

export default function CockpitApplicants() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isTeamMember } = useAuth();
  const isPhone = useIsMobile();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // A callback ref as well, so the table-or-cards measure follows the list
  // in and out (the skeleton, the empty state and the error have no list).
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const attachRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
    setRootEl(el);
  }, []);
  const wide = useFitsTable(rootEl);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // The sheet is the phone's; a window widened past it closes it for good.
  useEffect(() => {
    if (!isPhone) setSheetOpen(false);
  }, [isPhone]);

  const { rows: listRows, journeys, now, isLoading: listLoading, isError: loadFailed, partial, showcase, refetch } = useApplicantList();
  // Remove and block (lib/blockedApplicants.ts): a blocked person is on the
  // Blocked tab only, off All and every other tab and count. The list waits
  // for who is blocked, so a blocked row never shows for a moment and leaves.
  const blocks = useBlockedApplicants();
  const rows = useMemo(() => markBlocked(listRows, blocks.blocked), [listRows, blocks.blocked]);
  const isLoading = listLoading || blocks.isLoading;
  // The same cached query the list's hook reads; mapped only for the job's
  // name, its link and the share kit, never for counts.
  const { data: rawJobs } = useEmployerJobs();
  const jobRows = useMemo(() => (rawJobs ?? []).map((j) => mapJobRow(j, [], null)), [rawJobs]);

  /* ── The list's state is the URL ───────────────────────────────────── */
  const state = useMemo(() => parseListState(searchParams), [searchParams]);
  /** Any change but "Show 25 more" starts again from the first 25. Replace,
   *  not push: Back leaves the page, it does not undo a filter. */
  const update = useCallback(
    (patch: Partial<ApplicantListState>) => {
      setSearchParams(
        (current) => serializeListState({ ...parseListState(current), shown: PAGE_SIZE, ...patch }, current),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const stepTitles = useMemo(() => {
    const titles = new Map<string, string>();
    for (const journey of journeys.values()) for (const step of journey) if (!titles.has(step.id)) titles.set(step.id, step.title);
    return titles;
  }, [journeys]);
  const stepTitle = useCallback((id: string) => stepTitles.get(id), [stepTitles]);

  /* ── The list holds still while it is read (2026-10-07) ──────────────
     `live` is the list as it is this second; `view` is what is drawn: the
     order held since the list landed (or since his last tab, filter, sort,
     search or Show), each row with its facts as they are now, the tab counts
     as held, and what is waiting for the update bar (view.updates). The
     owner: "the page is doing this weird refresh thing" — a heartbeat every
     two seconds re-sorted it, and every moved row replayed its fade. */
  const live = useMemo(() => applyListState(rows, state, now, stepTitle), [rows, state, now, stepTitle]);
  const held = useHeldApplicantList(rows, live, state, !isLoading);
  const view = held.view;
  // The rows rise in once, as the list first lands; after that, never: the
  // browser replays a CSS animation on any node React moves, so on Show a row
  // that changed place would blink out and fade back in.
  const [revealDone, setRevealDone] = useState(false);
  useEffect(() => {
    if (isLoading || revealDone) return;
    const timer = window.setTimeout(() => setRevealDone(true), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading, revealDone]);
  const reveal = !revealDone && held.generation <= 1;

  /* ── Picking applicants, and acting on them (Remove and block) ───────
     On the table a checkbox sits over each avatar (on hover, and on every
     row once one is picked) with "all on this page" in the header; on cards
     there is a Select mode. What is picked is acted on from one bar at the
     foot. A pick lasts while its applicant is on this list (this tab,
     these filters), drawn or not: Show, or the list being taken afresh, can
     push a picked row past the 25 drawn, and that must not quietly drop it
     from "Remove and block 3". */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [actionRequest, setActionRequest] = useState<ApplicantActionRequest | null>(null);
  const lastPicked = useRef<string | null>(null);
  const onBlockedTab = state.tab === "blocked";
  const pageIds = useMemo(() => view.shown.filter((r) => r.tab !== "blocked").map((r) => r.id), [view.shown]);
  const listIdsKey = view.matched
    .filter((r) => r.tab !== "blocked")
    .map((r) => r.id)
    .join(",");
  useEffect(() => {
    setPicked((was) => {
      if (was.size === 0) return was;
      const onList = new Set(listIdsKey.split(","));
      const next = new Set([...was].filter((id) => onList.has(id)));
      return next.size === was.size ? was : next;
    });
  }, [listIdsKey]);
  useEffect(() => {
    if (!onBlockedTab) return;
    setPicked(new Set());
    setSelectMode(false);
  }, [onBlockedTab]);
  const togglePick = useCallback(
    (id: string, range: boolean) => {
      setPicked((was) => {
        const next = new Set(was);
        const on = !next.has(id);
        const from = lastPicked.current ? pageIds.indexOf(lastPicked.current) : -1;
        const to = pageIds.indexOf(id);
        // Shift-click: everything from the last one picked to this one.
        const span = range && from >= 0 && to >= 0 ? pageIds.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
        for (const x of span) {
          if (on) next.add(x);
          else next.delete(x);
        }
        return next;
      });
      lastPicked.current = id;
    },
    [pageIds],
  );
  const clearPicks = useCallback(() => {
    setPicked(new Set());
    setSelectMode(false);
    lastPicked.current = null;
  }, []);
  // Escape lets go of the selection (not while a menu or a dialog is open).
  useEffect(() => {
    if (picked.size === 0 && !selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=menu], [role=dialog]")) return;
      clearPicks();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked.size, selectMode, clearPicks]);
  const settle = held.settle;
  // His own click shows at once, never in the update bar: settled as he
  // confirms, before anything is sent, so a realtime update that lands
  // ahead of the round trip shows at once too (settling a row that then
  // does not change is a no-op: a failed action leaves it where it is).
  const onActionStart = useCallback((request: ApplicantActionRequest) => settle(actionIds(request)), [settle]);
  const onActionDone = useCallback(
    (request: ApplicantActionRequest, ok: boolean) => {
      const ids = actionIds(request);
      settle(ids);
      if (request.kind !== "block" || !ok) return;
      // The blocked let go of their checkboxes; the rest stay picked. With
      // nobody left picked, a phone's Select mode ends too.
      const gone = new Set(ids);
      const rest = new Set([...picked].filter((id) => !gone.has(id)));
      setPicked(rest);
      if (rest.size === 0) setSelectMode(false);
    },
    [settle, picked],
  );

  /* ── The filters, described once for the dropdowns and the sheet ───── */
  const groups = useMemo<FilterGroup[]>(() => {
    // Only the steps of jobs someone in view applied to, in each job's order.
    const inScope = new Set(view.scoped.map((r) => r.jobId));
    const scopedJourneys = [...journeys.entries()].filter(([id]) => inScope.has(id)).map(([, j]) => j);
    const scoreCounts = optionCounts(rows, state, "score", SCORE_OPTIONS.map((o) => o.value), now);
    const countryCounts = optionCounts(rows, state, "country", countryOptions(view.scoped).map((o) => o.value), now);
    const list: FilterGroup[] = [
      { key: "where", label: "Where they are", sheetLabel: "Where they are", value: state.where, anyValue: "any", options: whereOptions(scopedJourneys) },
      {
        key: "score",
        label: "Score",
        sheetLabel: "Score",
        value: state.score,
        anyValue: "any",
        options: SCORE_OPTIONS.map((o) => ({ ...o, count: o.value === "any" ? undefined : scoreCounts[o.value] })),
        counts: true,
      },
      { key: "flags", label: "Flags", sheetLabel: "Flags", value: state.flags, anyValue: "any", options: FLAG_OPTIONS },
      { key: "below", label: "Below a bar", sheetLabel: "Below the job's bar on", value: state.below, anyValue: "any", options: BELOW_OPTIONS },
      {
        key: "country",
        label: "Country",
        sheetLabel: "Country",
        value: state.country,
        anyValue: "all",
        // Every country in view; each count is what picking it would show,
        // the other filters as they stand (as the score's counts are).
        options: countryOptions(view.scoped).map((o) => ({ value: o.value, label: o.label, count: o.value === "all" ? undefined : countryCounts[o.value] })),
        counts: true,
      },
      { key: "applied", label: "Applied", sheetLabel: "Applied", value: state.applied, anyValue: "any", options: APPLIED_OPTIONS },
    ];
    // ?roleId= is this same filter; the menu only when there is a choice.
    if (jobRows.length > 1) {
      list.push({
        key: "job",
        label: "Job",
        sheetLabel: "Job",
        value: state.job ?? "",
        anyValue: "",
        options: [{ value: "", label: "All jobs" }, ...jobRows.map((j) => ({ value: j.id, label: j.title }))],
      });
    }
    return list;
  }, [journeys, jobRows, rows, state, now, view.scoped]);

  const pick = useCallback(
    (key: FilterKey, value: string) => {
      if (key === "job") update({ job: value || null });
      else update({ [key]: value } as Partial<ApplicantListState>);
    },
    [update],
  );
  const clearFilters = useCallback(
    (alsoSearch: boolean) =>
      update({ where: "any", score: "any", flags: "any", below: "any", country: "all", applied: "any", ...(alsoSearch ? { q: "" } : null) }),
    [update],
  );
  const filtersInUse = activeFilterCount(state);

  /* ── The order on screen, for the profile's pager ──────────────────── */
  const writtenOrder = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const ids = view.matched.map((r) => r.id);
    const key = ids.join(",");
    if (key === writtenOrder.current) return;
    writtenOrder.current = key;
    writeApplicantOrder(ids);
  }, [isLoading, view.matched]);
  // …and the tab it is on, for the profile's "Back to applicants · Needs review".
  useEffect(() => {
    writeApplicantTab(state.tab);
  }, [state.tab]);

  /* ── Scroll: kept on the way out to a profile, put back on the way in ─ */
  const openRow = useCallback(() => saveScroll(rootRef.current, location.search), [location.search]);
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || isLoading || rows.length === 0) return;
    restored.current = true;
    // Only Back (a POP) returns to where they were; a fresh visit starts at the top.
    if (navigationType !== "POP") return;
    const top = readScroll(location.search);
    if (top == null) return;
    const parent = scrollParent(rootRef.current);
    // "instant": .ck-scroll asks for smooth scrolling, which would animate the jump.
    if (parent) parent.scrollTo({ top, behavior: "instant" });
    else window.scrollTo({ top, behavior: "instant" });
  }, [isLoading, rows.length, navigationType, location.search]);

  /* ── The phone's tab pills scroll sideways: keep the chosen one in view
     (an old ?tab=applying link opens on Part-way, off the right edge), and
     fade the edge that has more behind it. At 360 the next pill can start
     exactly at the screen's edge, and three tabs would look like none. ── */
  const pillsRef = useRef<HTMLDivElement | null>(null);
  const [pillsMore, setPillsMore] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const measurePills = useCallback(() => {
    const strip = pillsRef.current;
    if (!strip) return;
    const left = strip.scrollLeft > 2;
    const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
    setPillsMore((was) => (was.left === left && was.right === right ? was : { left, right }));
  }, []);
  useLayoutEffect(() => {
    const strip = pillsRef.current;
    const pill = strip?.querySelector<HTMLElement>("[aria-selected=true]");
    if (strip && pill) {
      const left = pill.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
      const right = left + pill.offsetWidth;
      if (left < strip.scrollLeft + 16 || right > strip.scrollLeft + strip.clientWidth - 16) {
        strip.scrollTo({ left: Math.max(0, left - 16), behavior: "instant" });
      }
    }
    measurePills();
  }, [state.tab, isPhone, isLoading, measurePills]);
  useEffect(() => {
    if (!isPhone) return;
    window.addEventListener("resize", measurePills);
    return () => window.removeEventListener("resize", measurePills);
  }, [isPhone, measurePills]);

  /* ── One object the rows call back through, for the page's lifetime
     (ApplicantListItem is memoised on it): it reads the page's latest
     state from a ref, so no row redraws because a callback was rebuilt. ── */
  const latest = useRef({ wide, selectMode, togglePick, openRow, navigate });
  useLayoutEffect(() => {
    latest.current = { wide, selectMode, togglePick, openRow, navigate };
  });
  const rowActions = useMemo<RowActions>(
    () => ({
      open: (r, e) => {
        const now = latest.current;
        if (!now.wide && now.selectMode && r.tab !== "blocked") {
          e.preventDefault();
          now.togglePick(r.id, false);
          return;
        }
        now.openRow();
      },
      toggle: (id, range) => latest.current.togglePick(id, range),
      openProfile: (id) => {
        latest.current.openRow();
        latest.current.navigate(`/applicants/${id}`);
      },
      select: (id) => {
        if (!latest.current.wide) setSelectMode(true);
        setPicked((was) => new Set(was).add(id));
        lastPicked.current = id;
      },
      request: setActionRequest,
    }),
    [],
  );

  /* ── Everything above is hooks; what follows is what to draw ───────── */

  // An older notification links /applicants?applicationId=<id>: that person.
  const redirect = profileRedirectFor(searchParams);
  if (redirect) return <Navigate to={redirect} replace />;

  if (isLoading) return <ListSkeleton />;

  // A failed load must never read as "nobody has applied yet" — that is a
  // claim about the pipeline, not the network. (A refetch that fails while
  // rows are on screen keeps them.)
  const isError = loadFailed && rows.length === 0;
  if (isError) {
    return <CockpitErrorCard message="We couldn't load your applicants just now." onRetry={refetch} />;
  }

  // The older demo schema has no applications of this shape: say so, never
  // "Nobody has applied yet" (a claim about the pipeline).
  if (showcase) {
    return (
      <div className="space-y-4">
        <section className="ck-card ck-reveal p-6 md:p-8">
          <p className="max-w-[56ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The applicant list reads live hiring data, and this account's database is the older demo one, which doesn't have it.
          </p>
          <div className="mt-5">
            <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => navigate("/jobs")}>
              See your jobs
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    );
  }

  const shareJob = state.job ? jobRows.find((j) => j.id === state.job) ?? null : null;
  // A ?roleId= link to a job that is not in the list: deleted, or not one
  // this team member is on. Said as such, with a way back to everyone.
  const jobMissing = !!state.job && !shareJob;
  // The job's name beside the count when one job is shown.
  const shownJob = shareJob ?? (jobRows.length === 1 ? jobRows[0] : null);

  /* ── Nothing has come in yet ───────────────────────────────────────────
     With a live role this page used to say "Publish a role… Post your first
     job" (2026-10-05, the owner: "the dashboard says there's a job, but then
     the job says there is no job"). Now: the role it was opened for (or the
     first live one), and its link. "Post your first job" only when there
     genuinely is no role. */
  if (view.scoped.length === 0 && jobMissing) {
    return (
      <div className="space-y-4">
        <header className="ck-rise">
          <h1 className="font-display text-[30px] font-semibold leading-[1.15]" style={{ color: "var(--ink)", letterSpacing: "-0.025em" }}>
            This job isn't in your list.
          </h1>
        </header>
        <section className="ck-card ck-reveal p-6 md:p-8">
          <p className="max-w-[56ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The link names a job that was deleted, or one you aren't on.
            {rows.length > 0 ? " Everyone who applied to your other jobs is still here." : ""}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {rows.length > 0 && (
              <button className="ck-btn ck-btn-primary !py-2 !text-[12.5px]" onClick={() => update({ job: null })}>
                See everyone who applied
              </button>
            )}
            <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => navigate("/jobs")}>
              See your jobs
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (view.scoped.length === 0) {
    const emptyJob = shareJob ?? jobRows.find((j) => j.status === "live") ?? null;
    const startRole = () => {
      clearDraft();
      sessionStorage.removeItem("ava-create-active");
      navigate("/jobs/create");
    };
    return (
      <div className="space-y-4">
        <header className="ck-rise">
          <h1 className="font-display text-[30px] font-semibold leading-[1.15]" style={{ color: "var(--ink)", letterSpacing: "-0.025em" }}>
            {shareJob ? `Nobody has applied to ${shareJob.title} yet.` : "Nobody has applied yet."}
          </h1>
        </header>
        <section className="ck-card ck-reveal p-6 md:p-8">
          {emptyJob ? (
            <>
              <p className="max-w-[56ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                The moment someone applies I read them, score them against the job, and they show up here, already sealed, with
                my working shown.
              </p>
              <div className="mt-5">
                <ShareJobCompact job={emptyJob} lead={shareJob ? "It's live. Share its link:" : undefined} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {state.job && rows.length > 0 && (
                  <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => update({ job: null })}>
                    See everyone who applied
                  </button>
                )}
                <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => navigate("/jobs")}>
                  See your jobs
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="max-w-[52ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Publish a role and share its link. The moment someone applies I read them, score them against the job, and they
                show up here, already sealed, with my working shown.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="ck-btn ck-btn-primary !py-2 !text-[12.5px]" onClick={startRole}>
                  Post your first job
                </button>
                <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => navigate("/jobs")}>
                  See your jobs
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  // The blocked are not "applied": they are off every count but Blocked's.
  const people = view.scoped.filter((r) => r.tab !== "blocked");
  const onForm = people.filter((r) => r.onForm).length;
  const applied = people.length - onForm;
  // Blocked shows only when someone is (or it is the tab open).
  const visibleTabs = TAB_OPTIONS.filter((t) => t.value !== "blocked" || view.tabCounts.blocked > 0 || onBlockedTab);
  const selecting = wide ? picked.size > 0 : selectMode;
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const targetOf = (row: ApplicantListRow) => ({ applicationId: row.id, candidateId: row.candidateId, name: row.name });
  // Everyone picked on this list, drawn or further down it.
  const blockPicked = () => {
    const chosen = view.matched.filter((r) => picked.has(r.id) && r.tab !== "blocked");
    if (chosen.length > 0) setActionRequest({ kind: "block", targets: chosen.map(targetOf) });
  };
  // Cards: picking several starts with Select (a tap then picks, not opens).
  const selectButton =
    !wide && !onBlockedTab && !selectMode && pageIds.length > 0 ? (
      <button type="button" className="ck-btn ck-btn-ghost -my-2 min-h-[36px] shrink-0 !px-2.5 !text-[13px]" onClick={() => setSelectMode(true)}>
        <CheckSquare aria-hidden className="h-4 w-4" />
        Select
      </button>
    ) : null;
  const headerLead =
    !onBlockedTab && pageIds.length > 0 ? (
      <SelectMark
        quiet
        size={28}
        checked={allOnPage}
        mixed={!allOnPage && picked.size > 0}
        label={allOnPage ? "Clear the selection" : `Select all ${pageIds.length} on this page`}
        onToggle={() => (allOnPage ? clearPicks() : setPicked(new Set(pageIds)))}
      />
    ) : undefined;
  const words = view.words.length > 0 ? ` · ${view.words.join(" · ")}` : "";
  const searching = state.q.trim().length > 0;
  const narrowed = filtersInUse > 0 || searching;
  const more = Math.min(PAGE_SIZE, view.total - view.shown.length);
  const showing = view.hasMore ? `Showing ${view.shown.length} of ${view.total}` : view.total === 1 ? "Showing 1" : `Showing all ${view.total}`;
  const sortControl = (compact: boolean) => (
    <SortControl
      options={SORT_OPTIONS}
      value={state.sort}
      onPick={(v) => update({ sort: v as SortKey })}
      compact={compact}
      shortLabel={SORT_SHORT[state.sort]}
    />
  );

  /** Nobody on this tab, or nobody through the filters. */
  const emptyList = (
    <div className="px-5 py-8 text-center">
      <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
        {narrowed ? "No one matches." : TAB_EMPTY[state.tab]}
      </p>
      {narrowed && (
        <>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {[...(searching ? [`"${state.q.trim()}"`] : []), ...view.words].join(" · ")}
          </p>
          <button className="ck-btn ck-btn-outline mt-4 !py-2 !text-[12.5px]" onClick={() => clearFilters(true)}>
            Clear filters
          </button>
        </>
      )}
    </div>
  );

  // Each row in a frame that carries its checkbox and ⋯ beside the link
  // (ApplicantListItem, memoised). On cards in Select mode a tap picks
  // rather than opens.
  const renderRow = (row: ApplicantListRow, i: number) => (
    <ApplicantListItem key={row.id} row={row} index={i} wide={wide} picked={picked.has(row.id)} selecting={selecting} reveal={reveal} actions={rowActions} />
  );
  // What is waiting (new applicants, rows that would move): one quiet bar,
  // under the tabs on a phone, at the top of the list on a computer.
  // Tucked close to what it belongs to: the tabs above it on a phone, the
  // list below it on a computer.
  const updatesBar = <ListUpdatesBar updates={view.updates} onShow={held.apply} phone={isPhone} className={isPhone ? "!mt-2" : "!mt-3 -mb-1"} />;

  return (
    <div ref={attachRoot} className="space-y-4">
      {/* ── The head: one route title per viewport. On a phone the shell's
          top bar carries "Applicants"; in the team member's shell its header
          does at every width. ─────────────────────────────────────────── */}
      <header className="ck-rise flex flex-wrap items-end gap-x-4 gap-y-3">
        {!isTeamMember && (
          <h1 className="hidden font-display text-[34px] font-medium leading-[1.05] md:block" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>
            Applicants
          </h1>
        )}
        {/* Wraps to a second line rather than cutting the job's name off. */}
        <p className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[1.4] md:pb-[5px] md:text-[14px]" style={{ color: "var(--ink-3)" }}>
          {applied} applied
          {onForm > 0 && ` · ${onForm} on the form`}
          {shownJob && (
            <>
              {" · "}
              <span style={{ color: "var(--jade-soft-fg)", fontWeight: 500 }}>{shownJob.title}</span>
            </>
          )}
        </p>
        {/* The search shares the title's row only when there is room for both
            (lg); below that it takes a row of its own. */}
        <div className="flex w-full items-center gap-2 lg:w-auto lg:shrink-0">
          {shareJob && (
            <button type="button" className="ck-btn ck-btn-outline shrink-0 !py-2 !text-[12.5px]" onClick={() => setShareOpen(true)}>
              Share job
            </button>
          )}
          <SearchInput
            placeholder="Search a name, email or country"
            className="min-w-0 flex-1 lg:w-[300px] lg:flex-none"
            value={state.q}
            onChange={(q) => update({ q })}
          />
        </div>
      </header>

      {/* ── Tabs: each person is on exactly one; counts ignore the filters ─ */}
      {isPhone ? (
        <div
          ref={pillsRef}
          role="tablist"
          aria-label="Applicant groups"
          onScroll={measurePills}
          className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={pillsFade(pillsMore)}
        >
          {visibleTabs.map((t) => {
            const on = state.tab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="ck-applicant-list"
                onClick={() => update({ tab: t.value })}
                className="shrink-0"
                style={{
                  fontSize: 13,
                  // Snug enough that at 360 the pill after "Taking tests now"
                  // shows its start under the fade.
                  padding: "7px 10px",
                  minHeight: 36,
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  border: `1px solid ${on ? "var(--ink)" : "var(--line-soft)"}`,
                  background: on ? "var(--ink)" : "var(--hf-surface)",
                  color: on ? "var(--ground)" : "var(--ink-2)",
                  fontWeight: on ? 500 : 400,
                }}
              >
                {t.label}
                {/* Dimmed only on the chosen (ink) pill; on the others --ink-3
                    keeps 4.5:1 in DAY, where 70% of --ink-2 did not. */}
                <span className="tnum ml-1" style={on ? { opacity: 0.7 } : { color: "var(--ink-3)" }}>
                  {view.tabCounts[t.value]}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div role="tablist" aria-label="Applicant groups" className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: "var(--line-soft)" }}>
          {visibleTabs.map((t) => {
            const on = state.tab === t.value;
            const count = view.tabCounts[t.value];
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="ck-applicant-list"
                onClick={() => update({ tab: t.value })}
                className="relative shrink-0 transition-colors hover:text-[var(--ink)]"
                style={{ fontSize: 13.5, padding: "10px 14px 11px", whiteSpace: "nowrap", color: on ? "var(--ink)" : "var(--ink-3)" }}
              >
                {t.label}
                <span className="tnum ml-1.5 text-[12px]" style={{ color: t.value === "needs-review" && count > 0 ? "var(--amber-fg)" : "var(--ink-3)" }}>
                  {count}
                </span>
                {on && <span aria-hidden className="absolute bottom-0 left-3 right-3 h-[2px] rounded-[2px]" style={{ background: "var(--jade)" }} />}
              </button>
            );
          })}
        </div>
      )}

      {isPhone && updatesBar}

      {/* ── Filters: dropdowns on a computer, one button and a sheet on a phone ─ */}
      {isPhone ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <FiltersButton count={filtersInUse} open={sheetOpen} onClick={() => setSheetOpen(true)} />
            {sortControl(true)}
          </div>
          {/* The count, and Select at its end (picking several, then Remove and block). */}
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--ink-3)" }} aria-live="polite">
              {view.total} {view.total === 1 ? "applicant" : "applicants"}
              {words}
            </p>
            {selectButton}
          </div>
        </>
      ) : (
        <ApplicantFilterBar groups={groups} onPick={pick} sort={sortControl(false)} />
      )}

      {/* The attempts did not load: the rows stand, without their live lines. */}
      {partial && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]" style={{ color: "var(--ink-3)" }} role="status">
          <span>Test progress, flags and last active didn't load, so those columns may be behind.</span>
          <button type="button" className="ck-btn ck-btn-ghost !px-2 !py-1 !text-[12.5px]" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      )}

      {!isPhone && updatesBar}

      {/* Blocked: what it means, once, above them. */}
      {onBlockedTab && (
        <p className="text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
          People you removed and blocked. They can't apply to your jobs again with the same account or email, and they weren't told; anyone
          who applies with one of their phones is flagged on your list. Unblock lets them apply again; their application stays declined.
        </p>
      )}
      {/* Cards wider than a phone (no count line): Select on a line of its own. */}
      {!isPhone && selectButton && <div className="-mt-2 flex justify-end">{selectButton}</div>}

      {/* ── The list ─────────────────────────────────────────────────────── */}
      <div id="ck-applicant-list" role="tabpanel">
        {wide ? (
          <div className="ck-card overflow-hidden !rounded-[18px]">
            <ApplicantTableHeader lead={headerLead} />
            {view.shown.length === 0 ? emptyList : view.shown.map(renderRow)}
            {view.total > 0 && (
              <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5 text-[13px]" style={{ borderColor: "var(--line-soft)", color: "var(--ink-3)" }}>
                <span aria-live="polite">
                  {showing}
                  {words}
                </span>
                {view.hasMore && (
                  <button type="button" className="ck-btn ck-btn-outline !text-[13px]" onClick={() => update({ shown: state.shown + PAGE_SIZE })}>
                    Show {more} more
                  </button>
                )}
              </div>
            )}
          </div>
        ) : view.shown.length === 0 ? (
          <div className="ck-card !rounded-[16px]">{emptyList}</div>
        ) : (
          <>
            <div className="grid gap-2.5 md:grid-cols-2">{view.shown.map(renderRow)}</div>
            <div className="mt-3 flex flex-col items-center gap-2.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {view.hasMore && (
                <button type="button" className="ck-btn ck-btn-outline w-full !py-3 !text-[13px] md:w-auto" onClick={() => update({ shown: state.shown + PAGE_SIZE })}>
                  Show {more} more
                </button>
              )}
              <span>{showing}</span>
            </div>
          </>
        )}
      </div>

      {wide && <DotLegend className="pt-0.5" />}

      {/* What is picked, and Remove and block: one bar at the foot. The
          spacer keeps the last row and "Show more" clear of it. */}
      {selecting && !onBlockedTab && (
        <>
          <div aria-hidden style={{ height: isPhone ? 112 : 64 }} />
          <ApplicantBulkBar
            count={picked.size}
            pageCount={pageIds.length}
            allOnPage={allOnPage}
            onSelectPage={() => setPicked(new Set(pageIds))}
            onClear={clearPicks}
            onBlock={blockPicked}
            anchor={rootEl}
            phone={isPhone}
            aboveTabBar={!isTeamMember}
          />
        </>
      )}
      <ApplicantActionDialogs request={actionRequest} onClose={() => setActionRequest(null)} onStart={onActionStart} onDone={onActionDone} />

      <ApplicantFilterSheet
        open={sheetOpen && isPhone}
        onClose={() => setSheetOpen(false)}
        groups={groups}
        onPick={pick}
        onClearAll={() => clearFilters(false)}
        matchCount={view.total}
      />
      {shareJob && <ShareKitDialog open={shareOpen} job={shareJob} applyUrl={applyLinkFor(shareJob)} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
