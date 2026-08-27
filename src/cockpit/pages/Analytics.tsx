import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { differenceInCalendarDays, format, isValid, parse, subDays } from "date-fns";
import { ChevronRight } from "lucide-react";
import { clearDraft } from "@/lib/avaEngine/draft";
import AvaSeal from "@/components/ava/AvaSeal";
import { useCockpitAnalytics, useCockpitCandidates, useCockpitJobsData } from "../hooks/useCockpitData";

/**
 * The record.
 *
 * Four numbers that say what happened, then three pictures of it: which days
 * people came, how long each role has been open, and where each applicant
 * entered. The funnel is drawn as bars because a funnel IS a set of heights —
 * only the step Ava sealed is saturated, the rest are the neutral ground.
 *
 * Everything here is counted from this account's own applicants. There are no
 * industry averages on this page and no benchmark to lose against: the only
 * comparison offered is your roles against each other. Where the app cannot
 * honestly supply a number, the element is absent rather than estimated.
 */

/** The spec's small-caps label: 10px, heavy, wide. Used on every axis and tile. */
const LBL: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  lineHeight: 1.2,
  textTransform: "uppercase",
  color: "var(--hf-text-muted)",
};

const DAY_H = 88; // tallest bar in "Applications by day", per the spec
const FUNNEL_H = 110; // tallest bar in the funnel, per the spec
const DAY_WINDOW = 7;

/**
 * Dates reach this page already formatted by the mappers, and the showcase
 * dataset has no real dates at all — it says "Recently". Parse defensively: a
 * day-by-day chart drawn from unparseable dates would be an invented one.
 */
function toDate(label: string | null | undefined): Date | null {
  if (!label) return null;
  const parsed = parse(label, "MMM d, yyyy", new Date());
  return isValid(parsed) ? parsed : null;
}

/** Ava has a read on this person — a score, a skills check or a voice interview. */
function screenedByAva(c: { overall: number; quiz: number | null; voice: number | null }) {
  return c.overall > 0 || c.quiz != null || c.voice != null;
}

/** "a", "a and b", "a, b and c" — Ava writes sentences, not comma lists. */
function joinClauses(parts: string[]) {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="font-display mb-2 text-[16px]"
      style={{ fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.01em", color: "var(--hf-text)" }}
    >
      {children}
    </h2>
  );
}

function Tile({
  label,
  value,
  sub,
  index,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  index: number;
  tone?: "jade";
}) {
  return (
    <div className="ck-card ck-reveal px-[14px] py-3" style={{ ["--ck-i" as string]: index }}>
      <div style={LBL}>{label}</div>
      <div
        className="ck-num mt-1.5"
        style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.15, color: tone === "jade" ? "var(--jade)" : "var(--hf-text)" }}
      >
        {value}
      </div>
      <div className="mt-[3px] text-[11px]" style={{ color: "var(--hf-text-muted)" }}>
        {sub}
      </div>
    </div>
  );
}

/** One labelled bar, scaled against the largest row — never against the total,
 *  which would flatten every row into an unreadable sliver. */
function BarRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="mt-2.5 flex items-center gap-3 first:mt-0">
      <span className="w-[104px] shrink-0 truncate text-[12px] sm:w-[150px]" style={{ color: "var(--hf-text-soft)" }}>
        {label}
      </span>
      <div
        className="h-[13px] min-w-0 flex-1 overflow-hidden rounded-[5px]"
        style={{ background: "var(--track)", boxShadow: "inset 0 0 0 1px var(--line-soft)" }}
      >
        <div className="h-full rounded-[5px]" style={{ width: `${pct}%`, background: "var(--jade)", opacity: 0.8 }} />
      </div>
      <span className="ck-num w-[38px] shrink-0 text-right text-[14px]" style={{ fontWeight: 600, color: "var(--hf-text)" }}>
        {value}
      </span>
    </div>
  );
}

function Footnote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2.5 text-[11px]" style={{ color: "var(--hf-text-muted)", lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

export default function CockpitAnalytics() {
  const navigate = useNavigate();
  const { analytics, isLoading: analyticsLoading } = useCockpitAnalytics();
  const { candidates, isLoading: candidatesLoading } = useCockpitCandidates();
  const { jobs } = useCockpitJobsData();

  const view = useMemo(() => {
    const today = new Date();

    const total = candidates.length;
    const screened = candidates.filter(screenedByAva).length;
    const voiced = candidates.filter((c) => c.voice != null).length;
    const skillsChecked = candidates.filter((c) => c.quiz != null).length;
    // "Sealed" is the mark Ava presses on someone worth your time — in the data
    // that is a candidate who has been moved onto the shortlist or beyond.
    const isSealed = (c: (typeof candidates)[number]) => c.stage === "Shortlist" || c.stage === "Hired";
    const sealed = candidates.filter(isSealed).length;
    const hired = candidates.filter((c) => c.stage === "Hired").length;
    const passed = candidates.filter((c) => c.stage === "Rejected").length;

    const sealedScores = candidates.filter((c) => isSealed(c) && c.overall > 0).map((c) => c.overall);
    const avgSealed = sealedScores.length
      ? Math.round(sealedScores.reduce((a, b) => a + b, 0) / sealedScores.length)
      : null;

    const appliedDates = candidates
      .map((c) => toDate(c.appliedDate))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    const earliest = appliedDates[0] ?? null;
    const latest = appliedDates[appliedDates.length - 1] ?? null;
    const sinceDays = earliest ? differenceInCalendarDays(today, earliest) + 1 : null;

    // The window ends today while there is fresh activity; if the last applicant
    // arrived weeks ago it ends on their day instead, so the chart is never a
    // row of empty columns pretending to be data.
    let dayBars: Array<{ key: string; label: string; count: number; height: number }> | null = null;
    if (latest && earliest) {
      const end = differenceInCalendarDays(today, latest) <= DAY_WINDOW - 1 ? today : latest;
      const span = differenceInCalendarDays(end, earliest) + 1;
      const columns = Math.min(DAY_WINDOW, span);
      if (columns >= 2) {
        const counts = Array.from({ length: columns }, (_, i) => {
          const day = subDays(end, columns - 1 - i);
          return {
            key: format(day, "yyyy-MM-dd"),
            label: format(day, "EEE"),
            count: appliedDates.filter((d) => differenceInCalendarDays(d, day) === 0).length,
          };
        });
        const peak = Math.max(...counts.map((c) => c.count), 1);
        if (counts.some((c) => c.count > 0)) {
          dayBars = counts.map((c) => ({ ...c, height: Math.max(2, Math.round((c.count / peak) * DAY_H)) }));
        }
      }
    }

    // Your roles against each other: how long each has been open. The only
    // comparison on this page, and it is entirely your own.
    const liveRoles = jobs
      .filter((j) => j.status === "live")
      .map((j) => {
        const posted = toDate(j.date);
        return posted
          ? { id: j.id, title: j.title, applicants: j.applicants, days: differenceInCalendarDays(today, posted) + 1 }
          : null;
      })
      .filter((r): r is { id: string; title: string; applicants: number; days: number } => r !== null)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
    const longestOpen = liveRoles[0] ?? null;
    const maxDaysOpen = Math.max(...liveRoles.map((r) => r.days), 1);

    // Cumulative, in the order the app actually runs: apply, skills check,
    // voice interview, sealed, hired. Heights scale to the widest step.
    const funnel = [
      { label: "Applied", count: total, hot: false },
      { label: "Skills check", count: skillsChecked, hot: false },
      { label: "Interviewed", count: voiced, hot: false },
      { label: "Sealed", count: sealed, hot: true },
      { label: "Hired", count: hired, hot: false },
    ];
    const funnelPeak = Math.max(...funnel.map((s) => s.count), 1);

    const sources = analytics.sources;
    const sourcePeak = Math.max(...sources.map((s) => s.value), 1);
    const sourceTotal = sources.reduce((sum, s) => sum + s.value, 0);

    const liveCount = jobs.filter((j) => j.status === "live").length;
    let subtitle: string | null = null;
    if (liveCount === 1 && liveRoles.length === 1) subtitle = `${liveRoles[0].title} · day ${liveRoles[0].days}`;
    else if (liveCount > 1) subtitle = `${liveCount} live roles · ${total} ${total === 1 ? "applicant" : "applicants"}`;
    else if (total > 0) subtitle = `${total} ${total === 1 ? "applicant" : "applicants"} so far`;

    const workClauses = joinClauses(
      [
        voiced > 0 ? `${voiced} voice ${voiced === 1 ? "interview" : "interviews"} run` : null,
        skillsChecked > 0 ? `${skillsChecked} skills ${skillsChecked === 1 ? "check" : "checks"} marked` : null,
        passed > 0 ? `${passed} ${passed === 1 ? "reply" : "replies"} written in your name` : null,
      ].filter((c): c is string => c !== null),
    );

    return {
      total,
      screened,
      voiced,
      sealed,
      hired,
      passed,
      avgSealed,
      sinceDays,
      dayBars,
      liveRoles,
      longestOpen,
      maxDaysOpen,
      funnel,
      funnelPeak,
      sources,
      sourcePeak,
      sourceTotal,
      subtitle,
      workClauses,
    };
  }, [analytics.sources, candidates, jobs]);

  const startRole = () => {
    clearDraft();
    sessionStorage.removeItem("ava-create-active");
    navigate("/jobs/create");
  };

  if (analyticsLoading || candidatesLoading) {
    return (
      <div className="space-y-4">
        <div className="ck-reveal h-[46px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ck-card ck-reveal h-[86px]" style={{ ["--ck-i" as string]: i, opacity: 0.55 }} />
          ))}
        </div>
        <div className="ck-card ck-reveal h-[180px]" style={{ ["--ck-i" as string]: 4, opacity: 0.55 }} />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* ── The record, named ──────────────────────────────── */}
      <header className="ck-rise flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <h1
          className="font-display"
          style={{
            fontSize: "clamp(24px, 3vw, 30px)",
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
            color: "var(--hf-text)",
          }}
        >
          Analytics
        </h1>
        {view.subtitle && (
          <span className="text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
            {view.subtitle}
          </span>
        )}
      </header>

      {view.total === 0 ? (
        /* ── Nothing has been measured yet. Say so plainly. ── */
        <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
          <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Nothing to measure yet.
          </h2>
          <p className="mt-2 max-w-[54ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
            The moment people start applying, this page fills in: how many came, which days they came,
            how far each one got, and how long your role took to fill. All of it counted from your own
            applicants — nothing borrowed from anywhere else.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {jobs.length === 0 ? (
              <button className="ck-btn ck-btn-primary" onClick={startRole}>
                Post your first job
              </button>
            ) : (
              <button className="ck-btn ck-btn-primary" onClick={() => navigate("/jobs")}>
                See your jobs
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* ── What Ava carried, in one line ───────────────── */}
          {view.screened > 0 && (
            <section
              className="ck-rise flex items-center gap-[13px] rounded-[10px] px-[15px] py-2.5"
              style={{ background: "var(--slab)", boxShadow: "var(--hf-shadow-raised)" }}
            >
              <AvaSeal size={28} />
              <span
                className="font-display shrink-0"
                style={{
                  fontSize: 30,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  color: "var(--jade-bright)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {view.screened}
              </span>
              <p className="line-clamp-2 min-w-0 text-[13px] leading-snug md:line-clamp-1" style={{ color: "var(--slab-ink-2)" }}>
                <b style={{ color: "var(--slab-ink)", fontWeight: 600 }}>read and scored</b>
                {view.workClauses ? ` — ${view.workClauses}.` : "."} None of it took your time.
              </p>
            </section>
          )}

          {/* ── The four numbers ────────────────────────────── */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              index={0}
              label="Applied"
              value={String(view.total)}
              sub={view.sinceDays ? `${view.sinceDays} ${view.sinceDays === 1 ? "day" : "days"}` : "All time"}
            />
            <Tile
              index={1}
              label="Interviewed by Ava"
              value={String(view.voiced)}
              sub={
                view.voiced === 0
                  ? "Nobody has reached the interview yet"
                  : view.voiced === view.total
                    ? "100% — nobody skipped"
                    : `${Math.round((view.voiced / view.total) * 100)}% of applicants`
              }
            />
            <Tile
              index={2}
              tone="jade"
              label="Sealed"
              value={String(view.sealed)}
              sub={
                view.sealed === 0
                  ? "Nobody sealed yet"
                  : view.avgSealed != null
                    ? `Avg score ${view.avgSealed}`
                    : "Awaiting scores"
              }
            />
            <Tile
              index={3}
              label="Passed"
              value={String(view.passed)}
              sub={view.passed === 0 ? "Nobody turned away yet" : "Each one already got a reply"}
            />
          </div>

          {/* ── When they came, and how long you have been open ── */}
          {(view.dayBars || view.liveRoles.length > 0) && (
            <div className={view.dayBars && view.liveRoles.length > 0 ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
              {view.dayBars && (
                <section>
                  <SectionTitle>Applications by day</SectionTitle>
                  <div className="ck-card p-4">
                    <div className="flex items-end gap-2">
                      {view.dayBars.map((d) => (
                        <div key={d.key} className="min-w-0 flex-1 text-center">
                          <div
                            className="mx-auto mb-1.5 max-w-[44px] rounded-t-[5px] rounded-b-[2px]"
                            style={{ height: d.height, background: "var(--jade)", opacity: 0.75 }}
                          />
                          <div className="ck-num text-[14px]" style={{ fontWeight: 600, lineHeight: 1.15, color: "var(--hf-text)" }}>
                            {d.count}
                          </div>
                          <div className="mt-0.5" style={LBL}>
                            {d.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {view.liveRoles.length > 0 && (
                <section>
                  <SectionTitle>{view.liveRoles.length === 1 ? "Filling this role" : "Filling your roles"}</SectionTitle>
                  <div className="ck-card p-4">
                    {view.liveRoles.map((r) => (
                      <BarRow
                        key={r.id}
                        label={r.title}
                        value={`${r.days}d`}
                        pct={(r.days / view.maxDaysOpen) * 100}
                      />
                    ))}
                    {view.longestOpen && (
                      <Footnote>
                        {view.liveRoles.length === 1
                          ? `Day ${view.longestOpen.days}. ${view.longestOpen.applicants} ${
                              view.longestOpen.applicants === 1 ? "person has" : "people have"
                            } applied.`
                          : `${view.longestOpen.title} has been open longest — ${view.longestOpen.days} days, ${
                              view.longestOpen.applicants
                            } ${view.longestOpen.applicants === 1 ? "applicant" : "applicants"}.`}
                      </Footnote>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── Where they came from ────────────────────────── */}
          <section>
            <SectionTitle>Where they came from</SectionTitle>
            <div className="ck-card p-4">
              {view.sources.length > 0 ? (
                <>
                  {view.sources.map((s) => (
                    <BarRow
                      key={s.label}
                      label={s.label}
                      value={String(s.value)}
                      pct={(s.value / view.sourcePeak) * 100}
                    />
                  ))}
                  {view.sources.length === 1 && (
                    <Footnote>
                      All {view.sourceTotal} arrived through your apply link — there is no second channel
                      to split out yet.
                    </Footnote>
                  )}
                </>
              ) : (
                <p className="text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
                  Everyone so far has arrived through your apply link. Once a second channel sends someone,
                  the split shows up here.
                </p>
              )}
            </div>
          </section>

          {/* ── The funnel ──────────────────────────────────── */}
          <section>
            <SectionTitle>The funnel</SectionTitle>
            <div className="ck-card p-4">
              <div className="flex items-end gap-2">
                {view.funnel.map((step) => {
                  const empty = step.count === 0;
                  const height = empty ? 6 : Math.max(6, Math.round((step.count / view.funnelPeak) * FUNNEL_H));
                  return (
                    <div key={step.label} className="min-w-0 flex-1 text-center">
                      <div
                        className="mx-auto mb-[7px] max-w-[62px] rounded-t-[6px] rounded-b-[3px]"
                        style={{
                          height,
                          background: empty ? "transparent" : step.hot ? "var(--jade)" : "var(--ground-2)",
                          border: empty
                            ? "1px dashed var(--hair)"
                            : step.hot
                              ? "1px solid var(--jade)"
                              : "1px solid var(--line-soft)",
                          opacity: step.hot && !empty ? 0.9 : 1,
                        }}
                      />
                      <div
                        className="ck-num text-[16px]"
                        style={{
                          fontWeight: 600,
                          lineHeight: 1.15,
                          color: step.hot && !empty ? "var(--jade)" : "var(--hf-text)",
                        }}
                      >
                        {empty ? "—" : step.count}
                      </div>
                      <div className="mt-0.5" style={LBL}>
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
