import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import { Check, Copy, Mic } from "lucide-react";
import { toast } from "sonner";
import AvaSeal from "@/components/ava/AvaSeal";
import { clearDraft } from "@/lib/avaEngine/draft";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import { SearchInput, FilterSelect } from "../components/controls";
import { ShareKitDialog } from "../components/ShareKitDialog";
import { useCockpitJobsData } from "../hooks/useCockpitData";
import type { JobRow, JobStatus } from "../data";

/**
 * Your jobs.
 *
 * One row per role: what state it is in, where it is listed, how many people
 * came through it, and the single next thing to do with it. Live roles carry a
 * jade edge because they are the ones costing you nothing and working right now.
 *
 * Every listing claim on this screen is something the app actually does: a
 * published role gets its own public page, carries JobPosting markup for Google
 * for Jobs, and sits in the employer's /jobs.xml feed. Nothing here implies a
 * board we do not actually post to.
 */

/** The three places a published role is listed automatically. Drafts show these dimmed. */
const LISTINGS = ["Your job page", "Google for Jobs", "Your job feed"] as const;

const CHIP: Record<JobStatus, { label: string; bg: string; fg: string }> = {
  live: { label: "Live", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" },
  draft: { label: "Draft", bg: "var(--amber-bg)", fg: "var(--amber-fg)" },
  closed: { label: "Closed", bg: "var(--surface-2)", fg: "var(--ink-2)" },
};

type SortKey = "recent" | "applicants" | "title";
type StatusKey = "all" | JobStatus;

const SORTS = [
  { value: "recent", label: "Newest" },
  { value: "applicants", label: "Most applicants" },
  { value: "title", label: "A–Z" },
];

function StatusChip({ status, filled }: { status: JobStatus; filled?: boolean }) {
  const chip = CHIP[status];
  return (
    <span
      className="ml-2 inline-block rounded-[5px] px-2 py-[3px] align-middle text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
      style={{ background: chip.bg, color: chip.fg, position: "relative", top: -1 }}
    >
      {status === "closed" && filled ? "Filled" : chip.label}
    </span>
  );
}

function JobStat({ label, value, tone }: { label: string; value: number; tone?: "jade" }) {
  return (
    <div className="min-w-[62px] shrink-0 text-right">
      <div
        className="ck-num leading-none"
        style={{ fontSize: 30, fontWeight: 600, color: tone === "jade" ? "var(--jade)" : "var(--ink)" }}
      >
        {value}
      </div>
      <div className="mt-[3px] text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone, index }: { label: string; value: string; sub: string; tone?: "jade"; index: number }) {
  return (
    <div className="ck-card ck-reveal px-3.5 py-3" style={{ ["--ck-i" as string]: index }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
      <div className="ck-num mt-1.5" style={{ fontSize: 20, fontWeight: 600, color: tone === "jade" ? "var(--jade)" : "var(--ink)" }}>
        {value}
      </div>
      <div className="mt-[3px] text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
        {sub}
      </div>
    </div>
  );
}

/** Status filter, in the mockup's pill idiom: a coloured dot, a count, one press state. */
function StatusPill({
  label,
  count,
  dot,
  active,
  onClick,
}: {
  label: string;
  count: number;
  dot: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[11px] py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] transition-colors"
      style={
        active
          ? { background: "var(--surface-2)", borderColor: "var(--hair)", color: "var(--ink)" }
          : { background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink-3)" }
      }
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {label} · {count}
    </button>
  );
}

// The amber job code is itself a copy button — the code is what an applicant
// types in, so copying it is the only thing anyone ever wants to do with it.
function JobCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Job code copied");
    } catch {
      toast.error("Could not copy");
    }
  }, [code]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      title="Copy job code"
      className="inline-flex items-center gap-1.5 font-mono text-[11.5px] transition-opacity hover:opacity-75"
      style={{ color: "var(--brass)" }}
    >
      {code}
      {copied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
    </button>
  );
}

interface RowExtras {
  /** "Posted 5 days ago" — real timestamps where we have them. */
  when: string;
  /** Who was hired out of this role, when we can name them honestly. */
  hiredName: string | null;
}

function JobListRow({
  job,
  extras,
  index,
  onOpen,
  onEdit,
  onBoost,
}: {
  job: JobRow;
  extras: RowExtras;
  index: number;
  onOpen: () => void;
  onEdit: () => void;
  onBoost: () => void;
}) {
  const live = job.status === "live";
  const draft = job.status === "draft";
  const filled = job.status === "closed" && job.stats.hired > 0;

  // Ava's line only where she actually has something to say (an unfinished draft).
  const meta = draft
    ? `${extras.when} · finish it and I'll put it live`
    : filled && extras.hiredName
      ? `Hired ${extras.hiredName} · ${extras.when.toLowerCase()}`
      : [extras.when, job.pay, job.location].filter(Boolean).join(" · ");

  // One jade number per row, and only when there is something real behind it.
  const second =
    job.stats.hired > 0
      ? { label: "Hired", value: job.stats.hired }
      : job.stats.interview > 0
        ? { label: "Interviewing", value: job.stats.interview }
        : job.stats.shortlist > 0
          ? { label: "In review", value: job.stats.shortlist }
          : null;

  const go = draft ? onEdit : onOpen;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      aria-label={draft ? `Finish ${job.title}` : `Open applicants for ${job.title}`}
      className="ck-row ck-reveal flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3"
      style={{
        ["--ck-i" as string]: index,
        // A live role carries a jade edge — it is the one that is working right now.
        boxShadow: live ? "inset 3px 0 0 var(--jade), var(--hf-shadow-soft)" : undefined,
      }}
    >
      {/* who / what */}
      <div className="min-w-0 flex-1 basis-[240px] sm:min-w-[240px]">
        <div className="text-[14px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
          {job.title}
          <StatusChip status={job.status} filled={filled} />
        </div>
        <div className="mt-[3px] text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
          {meta}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
          {job.roleCode && <JobCodeButton code={job.roleCode} />}
          {!draft && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="transition-colors hover:underline"
              style={{ color: "var(--ink-3)" }}
            >
              Edit
            </button>
          )}
          {live && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`${window.location.origin}/candidate/job/${job.id}`, "_blank", "noopener");
              }}
              className="transition-colors hover:underline"
              style={{ color: "var(--ink-3)" }}
            >
              See it live
            </button>
          )}
        </div>
      </div>

      {/* where it is listed — automatic on publish, dimmed while it is a draft */}
      {job.status !== "closed" && (
        <div
          className="hidden shrink-0 items-center gap-[5px] xl:flex"
          title={live ? "Listed here automatically" : "Where it will be listed once you publish"}
        >
          {LISTINGS.map((net) => (
            <span
              key={net}
              className="whitespace-nowrap rounded-[5px] px-2 py-[3px] text-[11px]"
              style={{ background: "var(--surface-2)", color: "var(--ink-2)", opacity: live ? 1 : 0.45 }}
            >
              {net}
            </span>
          ))}
        </div>
      )}

      {/* the numbers */}
      <div className="flex shrink-0 items-start gap-5">
        <JobStat label="Applied" value={job.applicants} />
        {second && <JobStat label={second.label} value={second.value} tone="jade" />}
      </div>

      {/* the one next thing */}
      <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
        {live && (
          <button
            type="button"
            // Brass and outlined: extra reach is bought on the boards themselves,
            // not from us — the kit hands over the link, post text and QR.
            title="Take it further — post it on Indeed, LinkedIn or ZipRecruiter"
            className="ck-btn ck-btn-paid !px-3.5 !py-2 !text-[12.5px]"
            onClick={(e) => {
              e.stopPropagation();
              onBoost();
            }}
          >
            Boost
          </button>
        )}
        {draft ? (
          <button
            type="button"
            className="ck-btn ck-btn-primary !px-3.5 !py-2 !text-[12.5px]"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            Finish &amp; publish
          </button>
        ) : live ? (
          <button
            type="button"
            className="ck-btn ck-btn-primary !px-3.5 !py-2 !text-[12.5px]"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            Open
          </button>
        ) : (
          <button
            type="button"
            className="ck-btn ck-btn-outline !px-3.5 !py-2 !text-[12.5px]"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            Post it again
          </button>
        )}
      </div>
    </div>
  );
}

/** "Marisol Reyes" → "Marisol R." — enough to recognise your own hire, no more. */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? full;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function CockpitJobs() {
  const navigate = useNavigate();
  const { jobs, rawJobs, applications, isLoading } = useCockpitJobsData();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusKey>("all");
  const [place, setPlace] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [kitJob, setKitJob] = useState<JobRow | null>(null);

  const startRole = useCallback(() => {
    clearDraft();
    sessionStorage.removeItem("ava-create-active");
    navigate("/jobs/create");
  }, [navigate]);

  const counts = useMemo(() => {
    const live = jobs.filter((j) => j.status === "live").length;
    const draft = jobs.filter((j) => j.status === "draft").length;
    const closed = jobs.filter((j) => j.status === "closed");
    const filled = closed.filter((j) => j.stats.hired > 0).length;
    return { live, draft, closed: closed.length, filled, shut: closed.length - filled };
  }, [jobs]);

  const totals = useMemo(
    () =>
      jobs.reduce(
        (acc, j) => ({
          applicants: acc.applicants + j.applicants,
          inPlay: acc.inPlay + j.stats.shortlist,
        }),
        { applicants: 0, inPlay: 0 },
      ),
    [jobs],
  );

  // Real timestamps live on the raw job rows; the showcase dataset has none, so
  // those rows fall back to whatever the mapper could give us.
  const extras = useMemo(() => {
    const rawById = new Map(rawJobs.map((r) => [r.id, r]));
    const map = new Map<string, RowExtras>();

    for (const job of jobs) {
      const raw = rawById.get(job.id);
      const stamp = raw ? (job.status === "draft" ? raw.updated_at : raw.created_at) : null;
      const when = stamp
        ? `${job.dateLabel} ${formatDistanceToNow(new Date(stamp), { addSuffix: true })}`
        : `${job.dateLabel} ${job.date === "Recently" ? "recently" : job.date}`;

      const hire = applications.find((a) => a.job_id === job.id && a.status === "hired");
      const hiredFull = hire?.profiles?.full_name?.trim();

      map.set(job.id, { when, hiredName: hiredFull ? shortName(hiredFull) : null });
    }
    return map;
  }, [jobs, rawJobs, applications]);

  // Time to hire, measured the way the rest of the app measures it: from the
  // day that person applied to the day you hired them.
  const lastHire = useMemo(() => {
    const hired = applications.filter((a) => a.status === "hired");
    if (hired.length === 0) return null;
    const latest = hired.reduce((a, b) => (new Date(a.updated_at) > new Date(b.updated_at) ? a : b));
    const days = Math.max(0, differenceInDays(new Date(latest.updated_at), new Date(latest.created_at)));
    return {
      days,
      role: latest.jobs?.title ?? "a role",
      month: format(new Date(latest.updated_at), "MMMM"),
    };
  }, [applications]);

  const tiles = useMemo(() => {
    const out: Array<{ label: string; value: string; sub: string; tone?: "jade" }> = [];
    if (totals.applicants === 0) return out;

    const busiest = [...jobs].sort((a, b) => b.applicants - a.applicants)[0];
    out.push({
      label: "Applicants so far",
      value: String(totals.applicants),
      sub:
        jobs.length > 1 && busiest && busiest.applicants > 0
          ? `${busiest.title} is pulling the most`
          : counts.live > 0
            ? `across ${counts.live} live ${counts.live === 1 ? "role" : "roles"}`
            : `across ${jobs.length} ${jobs.length === 1 ? "role" : "roles"}`,
    });

    if (totals.inPlay > 0) {
      out.push({
        label: "Applied → shortlist",
        value: `${Math.round((totals.inPlay / totals.applicants) * 100)}%`,
        tone: "jade",
        sub: `${totals.inPlay} of ${totals.applicants} moved past the first read`,
      });
    }

    if (lastHire) {
      out.push({
        label: "Your last hire",
        value: `${lastHire.days} ${lastHire.days === 1 ? "day" : "days"}`,
        sub: `${lastHire.role} · ${lastHire.month}`,
      });
    }

    return out;
  }, [jobs, totals, counts.live, lastHire]);

  const places = useMemo(() => {
    const set = new Set(jobs.map((j) => j.location).filter(Boolean));
    return [...set].sort();
  }, [jobs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = jobs.filter((j) => {
      if (status !== "all" && j.status !== status) return false;
      if (place !== "all" && j.location !== place) return false;
      if (!q) return true;
      return `${j.title} ${j.location} ${j.pay} ${j.roleCode ?? ""}`.toLowerCase().includes(q);
    });
    // "Newest" is the order the hooks already return, so it needs no sort.
    if (sort === "applicants") return [...rows].sort((a, b) => b.applicants - a.applicants);
    if (sort === "title") return [...rows].sort((a, b) => a.title.localeCompare(b.title));
    return rows;
  }, [jobs, query, status, place, sort]);

  const filtering = query.trim() !== "" || status !== "all" || place !== "all";

  const summary = [
    counts.live > 0 && `${counts.live} live`,
    counts.draft > 0 && `${counts.draft} draft`,
    counts.filled > 0 && `${counts.filled} filled`,
    counts.shut > 0 && `${counts.shut} closed`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="ck-reveal h-[46px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="ck-card ck-reveal h-[84px]" style={{ ["--ck-i" as string]: i, opacity: 0.55 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* ── The head ───────────────────────────────────────── */}
      <header className="ck-rise flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <h1
          className="font-display hidden md:block"
          style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15, color: "var(--ink)" }}
        >
          Jobs
        </h1>
        {summary && (
          <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            {summary}
          </span>
        )}
        <div className="ml-auto max-md:w-full">
          <button type="button" className="ck-btn ck-btn-primary !py-2 !text-[13px] max-md:w-full" onClick={startRole}>
            + New job
          </button>
        </div>
      </header>

      {jobs.length === 0 ? (
        /* ── Nothing posted yet. Say so, and point at the one action. ── */
        <section className="ck-card ck-reveal p-6 md:p-8">
          <div className="flex items-center gap-3">
            <AvaSeal size={26} />
            <h2 className="font-display text-[20px]" style={{ color: "var(--ink)", fontWeight: 500 }}>
              You haven&rsquo;t posted a role yet.
            </h2>
          </div>
          <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Tell me who you need. I&rsquo;ll write the post, put it on your job page and in your feed, then read
            everyone who applies and send you the ones worth your time.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="ck-btn ck-btn-primary" onClick={startRole}>
              <Mic className="h-4 w-4" /> Talk to Ava
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* ── What the roles are doing ─────────────────────── */}
          {tiles.length > 0 && (
            <div
              className={`grid gap-2.5 ${tiles.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : tiles.length === 2 ? "sm:grid-cols-2" : "sm:max-w-[300px]"}`}
            >
              {tiles.map((t, i) => (
                <Tile key={t.label} label={t.label} value={t.value} sub={t.sub} tone={t.tone} index={i} />
              ))}
            </div>
          )}

          {/* ── Find one ─────────────────────────────────────── */}
          {jobs.length > 1 && (
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
              <div
                role="group"
                aria-label="Filter roles by status"
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
              >
                <StatusPill label="All" count={jobs.length} dot="var(--ink-3)" active={status === "all"} onClick={() => setStatus("all")} />
                {counts.live > 0 && (
                  <StatusPill label="Live" count={counts.live} dot="var(--jade)" active={status === "live"} onClick={() => setStatus("live")} />
                )}
                {counts.draft > 0 && (
                  <StatusPill label="Draft" count={counts.draft} dot="var(--amber-fg)" active={status === "draft"} onClick={() => setStatus("draft")} />
                )}
                {counts.closed > 0 && (
                  <StatusPill label="Closed" count={counts.closed} dot="var(--ink-3)" active={status === "closed"} onClick={() => setStatus("closed")} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                <SearchInput
                  placeholder="Search roles"
                  className="min-w-[160px] flex-1 lg:w-[190px] lg:flex-none"
                  value={query}
                  onChange={setQuery}
                />
                {places.length > 1 && (
                  <FilterSelect
                    label="Location:"
                    value={place}
                    onChange={setPlace}
                    options={[{ label: "All", value: "all" }, ...places.map((p) => ({ label: p, value: p }))]}
                  />
                )}
                <FilterSelect
                  label="Sort:"
                  value={sort}
                  onChange={(v) => setSort(v as SortKey)}
                  options={SORTS}
                />
              </div>
            </div>
          )}

          {/* ── The roles ────────────────────────────────────── */}
          {visible.length === 0 ? (
            <div className="ck-card-flat px-4 py-8 text-center">
              <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                No roles match that.
              </p>
              <button
                type="button"
                className="ck-btn ck-btn-outline mt-3 !py-2 !text-[12.5px]"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setPlace("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((job, i) => (
                <JobListRow
                  key={job.id}
                  job={job}
                  index={i}
                  extras={extras.get(job.id) ?? { when: `${job.dateLabel} ${job.date}`, hiredName: null }}
                  onOpen={() => navigate(`/applicants?roleId=${job.id}`)}
                  onEdit={() => navigate(`/jobs/edit/${job.id}`)}
                  onBoost={() => setKitJob(job)}
                />
              ))}
            </div>
          )}

          {/* ── Where your live roles actually are ───────────── */}
          {counts.live > 0 && !filtering && (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-[12px] leading-snug"
              style={{ border: "1px dashed var(--line)", borderRadius: 10, color: "var(--ink-3)" }}
            >
              <span className="min-w-0 flex-1">
                <b style={{ color: "var(--ink-2)" }}>Every live role is listed in three places</b> — your own job
                page, tagged for Google for Jobs, and in your XML feed. Send that feed to Adzuna, Jooble or
                Talent.com and they list you free.
              </span>
              <a
                href={`${window.location.origin}/jobs.xml`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto font-semibold"
                style={{ color: "var(--brass)" }}
              >
                Open your feed →
              </a>
            </div>
          )}
        </>
      )}

      <ShareKitDialog
        open={!!kitJob}
        job={kitJob}
        applyUrl={
          kitJob
            ? kitJob.roleCode
              ? candidateApplyUrl(kitJob.roleCode)
              : `${window.location.origin}/candidate/job/${kitJob.id}`
            : ""
        }
        onClose={() => setKitJob(null)}
      />
    </div>
  );
}
