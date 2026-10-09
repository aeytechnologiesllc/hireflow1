import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { differenceInCalendarDays, format, isValid, parse, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { clearDraft } from "@/lib/avaEngine/draft";
import AvaSeal from "@/components/ava/AvaSeal";
import { useEmployerJobs } from "@/hooks/useJobs";
import { useCareersTraffic, type CareersTrafficDay } from "@/hooks/useCareersTraffic";
import { zoneFromJob } from "@/lib/interviewSuggestion";
import { CockpitErrorCard } from "../components/ErrorCard";
import { ShareJobCompact } from "../components/ShareJobCard";
import { Reveal, RollingNumber } from "../components/analytics/AnalyticsMotion";
import { useApplicantList } from "../hooks/useApplicantList";
import { useCockpitJobsData } from "../hooks/useCockpitData";
import { buildAnalyticsView, hourWords, reasonsLine, spanParts, type AnalyticsView } from "../lib/analyticsView";
import "../analytics.css";

/**
 * Analytics: what happened to everyone who started an application
 * (docs/ANALYTICS.md).
 *
 * The owner, 2026-10-08, about the page this replaces: "this is the worst
 * analytics and the ugliest analytics I've ever seen. I want to see some
 * premiumness, nice animation, number rolling ... I need to see your best
 * work." He approved a mock-up built from his own totals; this is it, on
 * live numbers.
 *
 * Top to bottom: how many started and what is waiting for you; how far they
 * got, step by step; how good the finishers are and test by test; what holds
 * them back and when they apply; what Ava did; who is looking and how fast it
 * moves. Every number comes from lib/analyticsView.ts, which counts the same
 * rows the Applicants list shows, so the two pages cannot disagree. A section
 * with nothing to count is left out, never filled with a guess. There are no
 * industry averages and nothing to lose against.
 */

/** "Oct 4, 2026", as the jobs mapper words a date. */
function toDate(label: string | null | undefined): Date | null {
  if (!label) return null;
  const parsed = parse(label, "MMM d, yyyy", new Date());
  return isValid(parsed) ? parsed : null;
}

const people = (n: number) => (n === 1 ? "person" : "people");

/** "Asia/Manila" as people say it: "Philippine time". */
function clockName(zone: string): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
    const short = name.replace(/\s+Standard\b/i, "").replace(/\s+Time$/i, " time").trim();
    return short && !/^GMT/i.test(short) ? short : "Their time";
  } catch {
    return "Their time";
  }
}

/** "12 AM", for the axis under the hours. */
const axisHour = (hour: number) => hourWords(hour).replace(":00", "");

/** A smooth line through the points (x and y in the chart's own 0 to 100). */
function smoothLine(points: ReadonlyArray<readonly [number, number]>): string {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.22;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t} ${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t} ${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** The stream of the journey: as thick as the people still in it at each step, against everyone who started (`whole`). */
function streamShape(counts: readonly number[], whole: number): string {
  const MAX = 132;
  const MID = 108;
  const thick = (v: number) => (v / Math.max(1, whole)) * MAX;
  const cx = (i: number) => 50 + i * 100;
  const n = counts.length;
  let d = `M0 ${MID - thick(counts[0]) / 2} L${cx(0)} ${MID - thick(counts[0]) / 2}`;
  for (let i = 0; i < n - 1; i += 1) d += ` C${cx(i) + 52} ${MID - thick(counts[i]) / 2} ${cx(i + 1) - 52} ${MID - thick(counts[i + 1]) / 2} ${cx(i + 1)} ${MID - thick(counts[i + 1]) / 2}`;
  d += ` L${n * 100} ${MID - thick(counts[n - 1]) / 2} L${n * 100} ${MID + thick(counts[n - 1]) / 2} L${cx(n - 1)} ${MID + thick(counts[n - 1]) / 2}`;
  for (let i = n - 1; i > 0; i -= 1) d += ` C${cx(i) - 52} ${MID + thick(counts[i]) / 2} ${cx(i - 1) + 52} ${MID + thick(counts[i - 1]) / 2} ${cx(i - 1)} ${MID + thick(counts[i - 1]) / 2}`;
  return `${d} L0 ${MID + thick(counts[0]) / 2} Z`;
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/**
 * "Is anyone looking?" — candidate-side visits per day (public.get_careers_traffic),
 * so this page says something real before the first application lands
 * (2026-10-05: with a live role and no applicants it said "Nothing to measure yet").
 */
function TrafficSection({ days, applications, roles }: { days: CareersTrafficDay[]; applications: number; roles: number }) {
  const totals = days.reduce(
    (t, d) => ({ careers: t.careers + d.careers_views, job: t.job + d.job_views, apply: t.apply + d.apply_views }),
    { careers: 0, job: 0, apply: 0 },
  );
  const perDay = days.map((d) => ({ key: d.day, date: parseISO(d.day), total: d.careers_views + d.job_views + d.apply_views }));
  const peak = Math.max(1, ...perDay.map((d) => d.total));
  const since = perDay[0]?.date;
  const metrics: Array<{ label: string; value: number }> = [
    { label: "Careers page", value: totals.careers },
    { label: "Job page", value: totals.job },
    { label: "Apply and sign-up", value: totals.apply },
    { label: "Applications", value: applications },
  ];

  return (
    <section className="ck-card ck-reveal p-5 md:p-6">
      <h2 className="font-display text-[18px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
        People looking at your {roles === 1 ? "role" : "roles"}
      </h2>
      <p className="mt-1 max-w-[62ch] text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
        {since
          ? `Visits since ${format(since, "MMM d")}. Your own previews from the staff site are not counted.`
          : "Counting starts tomorrow, the first full day your role is live."}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-[10px] px-3.5 py-3" style={{ background: "var(--hf-surface-strong)", border: "1px solid var(--line)" }}>
            <div className="text-[12px] font-medium" style={{ color: "var(--hf-text-muted)" }}>
              {m.label}
            </div>
            <div className="font-display ck-num mt-0.5" style={{ fontSize: 26, lineHeight: 1.1, color: "var(--hf-text)", fontWeight: 600 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
      {perDay.length >= 2 && (
        <div className="mt-5" aria-label="Visits per day">
          {/* Columns are capped in width so two days of data read as two days,
              not two slabs across the card. Each carries its own number. */}
          <div className="flex items-end gap-2">
            {perDay.map((d) => (
              <div
                key={d.key}
                className="flex min-w-0 max-w-[52px] flex-1 flex-col items-center justify-end gap-1"
                title={`${format(d.date, "EEE MMM d")}: ${d.total}`}
              >
                <span className="ck-num text-[11px] font-semibold" style={{ color: "var(--hf-text-soft)" }}>
                  {d.total}
                </span>
                <div
                  className="w-full rounded-t-[4px]"
                  style={{
                    height: d.total === 0 ? 3 : Math.max(6, Math.round((d.total / peak) * 72)),
                    background: d.total === 0 ? "var(--line)" : "var(--jade)",
                    opacity: d.total === 0 ? 1 : 0.85,
                  }}
                />
                <span className="w-full truncate text-center text-[10.5px]" style={{ color: "var(--hf-text-muted)" }}>
                  {format(d.date, perDay.length > 7 ? "EEEEE" : "EEE")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function CockpitAnalytics() {
  const navigate = useNavigate();
  const list = useApplicantList();
  const { data: fullJobs } = useEmployerJobs();
  const { jobs } = useCockpitJobsData();
  const { data: traffic } = useCareersTraffic(14);
  const [picked, setPicked] = useState<string | null>(null);
  const liveJob = jobs.find((j) => j.status === "live") ?? null;

  // The jobs people have applied to, the busiest first. The page is about
  // one job at a time: each has its own steps.
  const counted = useMemo(() => {
    const by = new Map<string, number>();
    for (const row of list.rows) if (row.jobId) by.set(row.jobId, (by.get(row.jobId) ?? 0) + 1);
    return [...by.entries()]
      .map(([id, count]) => ({ id, count, title: list.rows.find((r) => r.jobId === id)?.jobTitle ?? "Job" }))
      .sort((a, b) => b.count - a.count);
  }, [list.rows]);
  const jobId = (picked && counted.some((j) => j.id === picked) ? picked : counted[0]?.id) ?? null;
  const job = useMemo(() => (fullJobs ?? []).find((j) => j.id === jobId) ?? null, [fullJobs, jobId]);
  const shownJob = jobs.find((j) => j.id === jobId) ?? null;

  // The clock only moves the view at the turn of an hour: the rows carry everything else.
  const hour = Math.floor(list.now / 3_600_000);
  const view = useMemo<AnalyticsView>(() => {
    const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const text = job ? [job.description, job.requirements, job.responsibilities].flat().filter((t) => typeof t === "string").join("\n") : "";
    return buildAnalyticsView({
      rows: list.rows.filter((r) => r.jobId === jobId),
      apps: list.apps,
      sessions: list.sessions,
      passingScore: job?.passing_score ?? null,
      now: hour * 3_600_000 + 1,
      viewerZone,
      applicantZone: job ? zoneFromJob({ countryCode: job.location_country_code, text }) : null,
      traffic: traffic ?? null,
    });
  }, [list.rows, list.apps, list.sessions, job, jobId, hour, traffic]);

  const analyticsLoading = list.isLoading;
  const analyticsFailed = list.isError;
  const refetchAnalytics = () => void list.refetch();

  const startRole = () => {
    clearDraft();
    sessionStorage.removeItem("ava-create-active");
    navigate("/jobs/create");
  };

  if (analyticsLoading) {
    return (
      <div className="space-y-4">
        <div className="ck-reveal h-[46px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        <div className="ck-card ck-reveal h-[320px]" style={{ ["--ck-i" as string]: 1, opacity: 0.55, borderRadius: 22 }} />
        <div className="ck-card ck-reveal h-[260px]" style={{ ["--ck-i" as string]: 2, opacity: 0.55, borderRadius: 22 }} />
      </div>
    );
  }

  // A failed load must never render as a zeroed, "publish a role to start
  // seeing funnel data" analytics page — that reads as a real answer for a
  // quiet account, not a fetch that never came back.
  if (analyticsFailed) {
    return <CockpitErrorCard message="We couldn't load your analytics just now." onRetry={refetchAnalytics} />;
  }

  const posted = toDate(shownJob?.date);
  const dayOpen = posted ? differenceInCalendarDays(new Date(), posted) + 1 : null;
  const liveRoles = jobs.filter((j) => j.status === "live").length;

  if (view.started === 0) {
    return (
      <div className="space-y-4 md:space-y-5">
        <header className="ck-rise flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {/* On a phone the top bar already says "Analytics" (same as Jobs). */}
          <h1 className="font-display hidden md:block" style={{ fontSize: "clamp(24px, 3vw, 30px)", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.025em", color: "var(--hf-text)" }}>
            Analytics
          </h1>
        </header>
        {traffic && <TrafficSection days={traffic} applications={0} roles={liveRoles} />}
        {/* ── No applications yet. Say what fills in, and hand over the link. ── */}
        <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
          <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            No applications yet.
          </h2>
          <p className="mt-2 max-w-[56ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
            The moment people start applying, the rest of this page fills in: how many came, how far each one got, how
            good they are and what is waiting for you. All of it counted from your own applicants.
          </p>
          {liveJob ? (
            <div className="mt-5">
              <ShareJobCompact job={liveJob} />
            </div>
          ) : (
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
          )}
        </section>
      </div>
    );
  }

  const { funnel, scores, hours, speed } = view;
  const n = funnel.length;
  const last = funnel[n - 1];
  const counts = funnel.map((s) => s.count);
  const stream = n >= 2 ? streamShape(counts, counts[0]) : "";
  // The bright core: the ones who finished, all the way through.
  const core = n >= 2 ? streamShape(counts.map(() => last.count), counts[0]) : "";

  // Applications by day: a line when there are at least two days to join.
  const dayTop = Math.max(1, ...view.days.map((d) => d.count)) * 1.16;
  const dayPts = view.days.map((d, i) => [4 + (i * 92) / Math.max(1, view.days.length - 1), 96 - (d.count / dayTop) * 86] as const);
  const dayLine = dayPts.length >= 2 ? smoothLine(dayPts) : "";
  const dayPeak = Math.max(0, ...view.days.map((d) => d.count));
  // On a long run only the ends, the peak and every other day are numbered.
  const dayNumbered = (i: number) => view.days.length <= 8 || i === 0 || i === view.days.length - 1 || view.days[i].count === dayPeak || i % 2 === 0;

  const avaHours = view.avaMinutes >= 90 ? Math.round(view.avaMinutes / 60) : null;
  const histTop = Math.max(1, ...scores.buckets);
  const afterTotal = view.after.waiting + view.after.declined + view.after.forward;
  const why = reasonsLine(view);
  const reasonTop = Math.max(1, ...view.reasons.map((r) => r.count));
  const peakForReader = hours.peakHour != null && hours.readerShift != null ? hours.peakHour + hours.readerShift : null;
  const visitsTop = view.visits ? Math.max(1, ...view.visits.days.map((d) => d.count)) : 1;
  const middle = speed.medianMinutes != null ? spanParts(speed.medianMinutes) : null;
  const tally = [
    { n: view.ava.scored, words: view.ava.scored === 1 ? "application read and scored" : "applications read and scored" },
    { n: view.ava.skills, words: view.ava.skills === 1 ? "skills check marked" : "skills checks marked" },
    { n: view.ava.chats, words: view.ava.chats === 1 ? "chat practice run" : "chat practices run" },
    { n: view.ava.interviews, words: view.ava.interviews === 1 ? "interview held" : "interviews held" },
    { n: view.ava.replies, words: view.ava.replies === 1 ? "reply sent in your name" : "replies sent in your name" },
  ].filter((t) => t.n > 0);

  return (
    <div className="an" data-analytics>
      {/* ── The record, named ──────────────────────────────── */}
      <header className="an-top ck-rise">
        {/* On a phone the top bar already says "Analytics" (same as Jobs). */}
        <h1 className="hidden md:block">Analytics</h1>
        {counted.length === 1 && shownJob && <span className="an-where">{shownJob.title}</span>}
        {shownJob?.status === "live" && (
          <span className="an-live">
            <i aria-hidden />
            {dayOpen ? `Live · day ${dayOpen}` : "Live"}
          </span>
        )}
        {counted.length > 1 && (
          <select className="an-pick" aria-label="Which job" value={jobId ?? ""} onChange={(e) => setPicked(e.target.value)} data-analytics-job>
            {counted.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {j.count}
              </option>
            ))}
          </select>
        )}
      </header>

      {/* ── The headline ───────────────────────────────────── */}
      <Reveal className="ck-card an-card an-hero" aria-label="The headline" data-analytics-hero>
        <div className="an-aura" aria-hidden />
        <div className="an-hero-in">
          <div className="an-hero-main">
            <span className="an-label">{view.firstAt != null ? `Since ${format(new Date(view.firstAt), "EEEE, MMM d")}` : "So far"}</span>
            <div className="an-big">
              <RollingNumber value={view.started} />
              <p>
                {people(view.started)} started an application
              </p>
            </div>
            <p className="an-story" data-analytics-story>
              {view.finished === 0 ? (
                "Nobody has finished every test yet."
              ) : (
                <>
                  <b>{view.finished}</b> finished every test.
                  {scores.of > 0 && (
                    <>
                      {" "}
                      <span className="an-jade">
                        {scores.atBar === 0 ? `None scored ${scores.bar} or more yet` : `${scores.atBar} of them scored ${scores.bar} or more`}
                      </span>
                      {view.waiting > 0 ? "," : "."}
                    </>
                  )}
                  {view.waiting > 0 && (
                    <>
                      {" "}
                      {scores.of > 0 ? "and " : ""}
                      <b>{view.waiting}</b> {view.waiting === 1 ? "is" : "are"} waiting for your decision.
                    </>
                  )}
                </>
              )}
            </p>

            {dayLine && (
              <>
                <div className="an-days" role="img" aria-label={`Applications by day: ${view.days.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                    <defs>
                      <linearGradient id="an-dayfill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--jade)" stopOpacity="0.34" />
                        <stop offset="1" stopColor="var(--jade)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="an-area" d={`${dayLine} L${dayPts[dayPts.length - 1][0]} 100 L${dayPts[0][0]} 100 Z`} />
                    <path className="an-stroke" d={dayLine} />
                  </svg>
                  {dayPts.map((p, i) => (
                    <span
                      key={view.days[i].key}
                      className={`an-pt${view.days[i].count === dayPeak ? " peak" : ""}`}
                      style={vars({ left: `${p[0]}%`, bottom: `${100 - p[1]}%`, "--d": `${(0.5 + (i * 1.1) / dayPts.length).toFixed(2)}s` })}
                      aria-hidden
                    >
                      {dayNumbered(i) && <b>{view.days[i].count}</b>}
                    </span>
                  ))}
                </div>
                <div className="an-day-axis an-label" aria-hidden>
                  {dayPts.map((p, i) => (dayNumbered(i) ? <span key={view.days[i].key} style={{ left: `${p[0]}%` }}>{view.days[i].label}</span> : null))}
                </div>
              </>
            )}
          </div>

          <div className="an-hero-side">
            <div className="an-stat you" data-analytics-waiting>
              <span className="an-label">Waiting for you</span>
              <div className="an-row">
                <span className="an-n">
                  <RollingNumber value={view.waiting} />
                </span>
                {view.waiting > 0 && (
                  <button className="an-go" type="button" onClick={() => navigate("/applicants?tab=needs-review")}>
                    Review them <span aria-hidden>→</span>
                  </button>
                )}
              </div>
              <p>{view.waiting > 0 ? "Finished every test and not decided yet." : "Nobody is waiting on your decision."}</p>
            </div>
            <div className="an-stat">
              <span className="an-label">Finished every test</span>
              <div className="an-row">
                <span className="an-n">
                  <RollingNumber value={view.finished} />
                </span>
                <span className="an-ring" style={vars({ "--pct": view.finishedPct })} role="img" aria-label={`${view.finishedPct} percent of everyone who started`}>
                  <svg viewBox="0 0 36 36" aria-hidden>
                    <circle className="an-track" cx="18" cy="18" r="15.915" />
                    <circle className="an-arc" cx="18" cy="18" r="15.915" pathLength={100} />
                  </svg>
                  <em>{view.finishedPct}%</em>
                </span>
              </div>
              <p>Of everyone who started, the share who went all the way.</p>
            </div>
            {view.avaMinutes > 0 && (
              <div className="an-stat">
                <span className="an-label">Time Ava spent with them</span>
                <div className="an-row">
                  <span className="an-n">
                    <RollingNumber value={avaHours ?? view.avaMinutes} />
                    <small>{avaHours != null ? "hours" : "minutes"}</small>
                  </span>
                  <AvaSeal size={46} tilt={-6} />
                </div>
                <p>Chat practice and interviews you did not have to sit through.</p>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* ── How far they got ───────────────────────────────── */}
      {n >= 2 && (
        <Reveal className="ck-card an-card" data-analytics-journey>
          <div className="an-head">
            <h2>How far they got</h2>
            <span className="an-sub">Each step, and how many have not gone past it yet</span>
          </div>

          <div className="an-flow-art">
            <div className="an-wipe">
              <svg viewBox={`0 0 ${n * 100} 200`} preserveAspectRatio="none" aria-hidden style={vars({ "--an-run": `${n * 100 + 40}px` })}>
                <defs>
                  <linearGradient id="an-core" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="var(--an-jade-2)" />
                    <stop offset="1" stopColor="var(--jade)" />
                  </linearGradient>
                  <linearGradient id="an-outer" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="var(--jade)" stopOpacity="0.5" />
                    <stop offset="0.45" stopColor="var(--jade)" stopOpacity="0.3" />
                    <stop offset="1" stopColor="var(--jade)" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="an-shine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#fff" stopOpacity="0.28" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="an-gloss" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
                    <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
                    <stop offset="1" stopColor="#000" stopOpacity="0.16" />
                  </linearGradient>
                  <clipPath id="an-core-clip">
                    <path d={core} />
                  </clipPath>
                </defs>
                <path className="an-flow-outer" d={stream} />
                {last.count > 0 && (
                  <>
                    <path className="an-flow-core" d={core} />
                    <path d={core} fill="url(#an-gloss)" />
                    <g clipPath="url(#an-core-clip)">
                      <rect className="an-flow-shine" x="0" y="0" width="200" height="200" />
                    </g>
                  </>
                )}
              </svg>
            </div>
            <div className="an-cols" style={vars({ "--n": n })}>
              {funnel.map((stage, i) => (
                <div key={stage.key} className="an-col" tabIndex={0}>
                  {i > 0 && stage.lost > 0 && (
                    <span className={`an-drop${view.biggestDrop === i ? " most" : ""}`} style={vars({ "--d": `${(0.85 + i * 0.15).toFixed(2)}s` })}>
                      −{stage.lost}
                      {view.biggestDrop === i ? " · biggest drop" : ""}
                    </span>
                  )}
                  <span className="an-tip">
                    <b>{stage.count}</b>{" "}
                    {i === 0 ? `${people(stage.count)} opened the application.` : `got past “${stage.label}”.${stage.lost > 0 ? ` ${stage.lost} ${stage.lost === 1 ? "has" : "have"} not yet.` : ""}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="an-stages" style={vars({ "--n": n })}>
            {funnel.map((stage, i) => (
              <div key={stage.key} className="an-stage" data-analytics-stage={stage.key}>
                <span className="an-n">
                  <RollingNumber value={stage.count} />
                </span>
                <span className="an-t">{stage.label}</span>
                <span className="an-p">
                  {stage.pct}%{i === n - 1 && i > 0 ? " · finished" : ""}
                </span>
              </div>
            ))}
          </div>

          {/* On a phone: the same steps as rows. */}
          <div className="an-rows">
            {funnel.map((stage, i) => (
              <div key={stage.key} className="an-frow">
                <span className="an-t">
                  {stage.label}
                  {i === n - 1 && i > 0 ? " · finished" : ""}
                </span>
                <span className="an-n">
                  <RollingNumber value={stage.count} />
                </span>
                <span className="an-bar" style={vars({ "--w": `${stage.pct}%`, "--d": `${(i * 0.1).toFixed(1)}s` })}>
                  <i />
                </span>
                {stage.lost > 0 && (
                  <span className={`an-lost${view.biggestDrop === i ? " most" : ""}`}>
                    {stage.lost} {stage.lost === 1 ? "has" : "have"} not got this far yet
                    {view.biggestDrop === i ? " · biggest drop" : ""}
                  </span>
                )}
              </div>
            ))}
          </div>

          {view.finished > 0 && afterTotal > 0 && (
            <div className="an-after" data-analytics-after>
              <span className="an-label">What became of the {view.finished} who finished</span>
              <div className="an-split" aria-hidden>
                {view.after.waiting > 0 && <i className="brass" style={vars({ "--w": view.after.waiting, "--d": "0.2s" })} />}
                {view.after.declined > 0 && <i className="mute" style={vars({ "--w": view.after.declined, "--d": "0.45s" })} />}
                {view.after.forward > 0 && <i className="jade" style={vars({ "--w": view.after.forward, "--d": "0.7s" })} />}
              </div>
              <div className="an-legend">
                <span>
                  <i style={{ background: "var(--brass)" }} />
                  <b>{view.after.waiting}</b> waiting for you
                </span>
                <span>
                  <i style={{ background: "var(--an-mute)" }} />
                  <b>{view.after.declined}</b> declined
                </span>
                <span>
                  <i style={{ background: "var(--jade)" }} />
                  <b>{view.after.forward}</b> moved to interview
                </span>
              </div>
            </div>
          )}
        </Reveal>
      )}

      {/* ── How good they are, and test by test ────────────── */}
      {(scores.of > 0 || view.tests.length > 0) && (
        <div className="an-grid">
          {scores.of > 0 && (
            <Reveal className="ck-card an-card" data-analytics-scores>
              <div className="an-head">
                <h2>How good they are</h2>
                <span className="an-sub">
                  Final score of the {scores.of} who finished
                </span>
              </div>
              <div className="an-hist" role="img" aria-label={`Final scores in tens: ${scores.buckets.map((c, i) => (c ? `${c} in the ${i * 10}s` : "")).filter(Boolean).join(", ")}`}>
                {scores.buckets.map((count, i) => (
                  <div key={i} className={`an-hb${i * 10 >= scores.bar ? " good" : ""}`} style={vars({ "--h": `${(count / histTop) * 100}%`, "--d": `${(i * 0.06).toFixed(2)}s` })} title={`${count} scored ${i * 10} to ${i === 9 ? 100 : i * 10 + 9}`}>
                    {count > 0 && (
                      <>
                        <b>{count}</b>
                        <i />
                      </>
                    )}
                  </div>
                ))}
                {scores.median != null && scores.of >= 3 && (
                  <span className={`an-median${scores.median > 66 ? " flip" : ""}`} style={vars({ "--at": `${scores.median}%` })}>
                    <em>middle score {scores.median}</em>
                  </span>
                )}
              </div>
              <div className="an-axis" aria-hidden>
                {scores.buckets.map((_, i) => (
                  <span key={i}>{i * 10}</span>
                ))}
              </div>
              <div className="an-chips">
                <span className="an-chip jade">
                  <b>{scores.atBar}</b> scored {scores.bar} or more
                </span>
                {scores.top != null && (
                  <span className="an-chip">
                    <b>{scores.top}</b> top score
                  </span>
                )}
                {scores.average != null && (
                  <span className="an-chip">
                    <b>{scores.average}</b> average
                  </span>
                )}
              </div>
              {view.advice && (
                <div className="an-advice" data-analytics-advice>
                  <span className="an-label">Ava's advice on them</span>
                  <div className="an-split" aria-hidden>
                    {view.advice.look > 0 && <i className="jade" style={vars({ "--w": view.advice.look, "--d": "0.5s" })} />}
                    {view.advice.decline > 0 && <i className="mute" style={vars({ "--w": view.advice.decline, "--d": "0.75s" })} />}
                  </div>
                  <div className="an-legend">
                    <span>
                      <i style={{ background: "var(--jade)" }} />
                      <b>{view.advice.look}</b> worth a closer look
                    </span>
                    <span>
                      <i style={{ background: "var(--an-mute)" }} />
                      <b>{view.advice.decline}</b> she would decline
                    </span>
                  </div>
                </div>
              )}
            </Reveal>
          )}

          {view.tests.length > 0 && (
            <Reveal className="ck-card an-card" data-analytics-tests>
              <div className="an-head">
                <h2>Test by test</h2>
                <span className="an-sub">Where they are strong, and where they are not</span>
              </div>
              <div className="an-meters">
                {view.tests.map((test, i) => (
                  <div key={test.key} className={`an-meter${test.warn ? " warn" : ""}`} data-analytics-test={test.key}>
                    <div className="an-line">
                      <span className="an-t">{test.label}</span>
                      <span className="an-v">
                        <RollingNumber value={test.value} />
                        <small>{test.unit}</small>
                      </span>
                    </div>
                    <div className="an-track" style={vars({ "--w": `${test.fill}%`, "--d": `${(i * 0.1).toFixed(1)}s`, ...(test.barAt != null ? { "--at": `${test.barAt}%` } : {}) })}>
                      <i />
                      {test.barAt != null && <u />}
                    </div>
                    {(test.barWords || test.note) && (
                      <p className="an-note">
                        {test.barWords && <span className="brass">{test.barWords}</span>} {test.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      )}

      {/* ── What holds them back, and when they apply ──────── */}
      <div className="an-grid">
        {view.reasons.length > 0 && (
          <Reveal className="ck-card an-card" data-analytics-reasons>
            <div className="an-head">
              <h2>What holds them back</h2>
              <span className="an-sub">
                Ava's most common marks against the {view.reasonsOf} who finished
              </span>
            </div>
            <div className="an-ranks">
              {view.reasons.map((reason, i) => (
                <div key={reason.label} className="an-rank">
                  <span className="an-t">{reason.label}</span>
                  <span className="an-c">{reason.count}</span>
                  <span className="an-rank-bar" style={vars({ "--w": `${(reason.count / reasonTop) * 100}%`, "--d": `${(i * 0.07).toFixed(2)}s` })}>
                    <i />
                  </span>
                </div>
              ))}
            </div>
            {why && (
              <div className="an-say">
                <AvaSeal size={30} tilt={-6} />
                <p>
                  The most common mark: <b>{why.label}</b>, on {why.count} of the {why.of}. Worth asking about in the interview.
                </p>
              </div>
            )}
          </Reveal>
        )}

        {hours.peakHour != null && (
          <Reveal className="ck-card an-card" data-analytics-hours>
            <div className="an-head">
              <h2>When they apply</h2>
              <span className="an-sub">{hours.theirs ? "Hour of the day, on their clock" : "Hour of the day"}</span>
            </div>
            <div className="an-hours" role="img" aria-label={`Applications by hour of the day. The busiest hour is ${hourWords(hours.peakHour)} with ${hours.peakCount}.`}>
              {hours.counts.map((count, h) => (
                <div
                  key={h}
                  className={`an-hr${h === hours.peakHour ? " top" : ""}`}
                  data-n={count}
                  title={`${count} at ${hourWords(h)}`}
                  style={vars({ "--h": `${(count / Math.max(1, hours.peakCount)) * 82}%`, "--k": count / Math.max(1, hours.peakCount), "--d": `${(h * 0.025).toFixed(3)}s` })}
                >
                  <i />
                </div>
              ))}
            </div>
            <div className="an-clock" aria-hidden>
              {[0, 6, 12, 18].map((h) => (
                <span key={h}>{axisHour(h)}</span>
              ))}
            </div>
            {hours.readerShift != null && (
              <>
                <div className="an-clock you" aria-hidden>
                  {[0, 6, 12, 18].map((h) => (
                    <span key={h}>{axisHour(h + (hours.readerShift as number))}</span>
                  ))}
                </div>
                <div className="an-clock-key">
                  <span>
                    <i style={{ background: "var(--ink-3)" }} />
                    {clockName(hours.zone)}
                  </span>
                  <span>
                    <i style={{ background: "var(--brass)" }} />
                    Your time
                  </span>
                </div>
              </>
            )}
            <div className="an-chips">
              <span className="an-chip jade">
                <b>{hourWords(hours.peakHour)}</b> {hours.theirs ? "their busiest hour" : "the busiest hour"}
              </span>
              {peakForReader != null && (
                <span className="an-chip">
                  <b>{hourWords(peakForReader)}</b> for you{peakForReader < 0 ? ", the day before" : peakForReader >= 24 ? ", the next day" : ""}
                </span>
              )}
            </div>
            {hours.rush && view.started >= 4 && (
              <p className="an-sub" style={{ marginTop: 14 }}>
                {hours.rush.count} of the {view.started} applied between {hourWords(hours.rush.from)} and {hourWords(hours.rush.from + 2)}
                {hours.theirs ? " their time" : ""}.
              </p>
            )}
          </Reveal>
        )}
      </div>

      {/* ── What Ava did ───────────────────────────────────── */}
      {tally.length > 0 && (
        <Reveal className="ck-card an-card an-ava" data-analytics-ava>
          <div className="an-ava-in">
            <div className="an-ava-who">
              <AvaSeal size={46} tilt={-6} />
              <div>
                <h2>Ava did this for you</h2>
                <p className="an-sub">None of it took your time</p>
              </div>
            </div>
            <div className="an-tally" style={vars({ "--n": tally.length })}>
              {tally.map((t) => (
                <div key={t.words}>
                  <b>
                    <RollingNumber value={t.n} />
                  </b>
                  <span>{t.words}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* ── Who is looking, and how fast it moves ──────────── */}
      <div className="an-grid">
        {view.visits && (
          <Reveal className="ck-card an-card" data-analytics-visits>
            <div className="an-head">
              <h2>People looking at your {liveRoles === 1 ? "role" : "roles"}</h2>
              <span className="an-sub">Visits in the last two weeks. Your own are not counted.</span>
            </div>
            <div className="an-doors">
              <div className="an-door">
                <span className="an-label">Careers page</span>
                <b>
                  <RollingNumber value={view.visits.careers} />
                </b>
              </div>
              <div className="an-door">
                <span className="an-label">Job page</span>
                <b>
                  <RollingNumber value={view.visits.job} />
                </b>
              </div>
              <div className="an-door">
                <span className="an-label">Apply and sign-up</span>
                <b>
                  <RollingNumber value={view.visits.apply} />
                </b>
              </div>
              <div className="an-door end">
                <span className="an-label">Applications</span>
                <b>
                  <RollingNumber value={list.rows.length} />
                </b>
              </div>
            </div>
            {view.visits.days.length >= 2 && (
              <>
                <div className="an-mini" style={vars({ "--n": view.visits.days.length })} role="img" aria-label={`Visits by day: ${view.visits.days.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
                  {view.visits.days.map((d, i) => (
                    <div key={d.key} className={d.count === visitsTop && d.count > 0 ? "peak" : undefined} style={vars({ "--h": `${(d.count / visitsTop) * 100}%`, "--d": `${(i * 0.08).toFixed(2)}s` })}>
                      <b>{d.count}</b>
                      <i />
                    </div>
                  ))}
                </div>
                <div className="an-mini-axis" style={vars({ "--n": view.visits.days.length })} aria-hidden>
                  {view.visits.days.map((d) => (
                    <span key={d.key}>{d.label}</span>
                  ))}
                </div>
              </>
            )}
          </Reveal>
        )}

        {middle && speed.of > 0 && (
          <Reveal className="ck-card an-card" data-analytics-speed>
            <div className="an-head">
              <h2>How fast it moves</h2>
              <span className="an-sub">From pressing Apply to the last test</span>
            </div>
            <div className="an-speeds">
              <div className="an-speed">
                <b>
                  {middle.days > 0 && (
                    <>
                      <RollingNumber value={middle.days} />
                      <small>{middle.days === 1 ? "day" : "days"}</small>
                    </>
                  )}
                  {(middle.hours > 0 || middle.days > 0) && (
                    <>
                      <RollingNumber value={middle.hours} />
                      <small>h</small>
                    </>
                  )}
                  {middle.days === 0 && (
                    <>
                      <RollingNumber value={middle.minutes} />
                      <small>min</small>
                    </>
                  )}
                </b>
                <span>is the middle time to finish every test, start to end.</span>
              </div>
              <div className="an-speed">
                <b>
                  <RollingNumber value={speed.withinDay} />
                  <small>of {speed.of}</small>
                </b>
                <span>finished within a day of starting.</span>
              </div>
              <div className="an-speed">
                <b>
                  <RollingNumber value={speed.withinTwoHours} />
                  <small>of {speed.of}</small>
                </b>
                <span>did it all inside two hours.</span>
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
