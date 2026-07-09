import { useNavigate } from "react-router-dom";
import { useState, useCallback } from "react";
import {
  Coffee,
  Star,
  Store,
  Utensils,
  ChefHat,
  MapPin,
  Clock,
  Plus,
  Share2,
  Pencil,
  Copy,
  Check,
  Mic,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/PageHeader";
import { SearchInput, FilterSelect } from "../components/controls";
import { AvaCard } from "../components/AvaCard";
import { AvaOrb } from "@/components/ava/AvaOrb";
import { useCockpitJobsData, useCockpitAccount, useCockpitCandidates } from "../hooks/useCockpitData";
import { ShareKitDialog } from "../components/ShareKitDialog";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import { clearDraft } from "@/lib/avaEngine/draft";
import type { JobRow, JobStatus } from "../data";

const ROLE_ICONS = { coffee: Coffee, star: Star, register: Store, tray: Utensils, chef: ChefHat };

function StatusPill({ status }: { status: JobStatus }) {
  if (status === "live") return <span className="ck-pill ck-pill-live"><span className="ck-dot ck-dot-live" />Live</span>;
  if (status === "draft") return <span className="ck-pill ck-pill-draft"><span className="ck-dot ck-dot-draft" />Draft</span>;
  return <span className="ck-pill ck-pill-closed"><span className="ck-dot ck-dot-closed" />Closed</span>;
}

function SubStat({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(value > 0 ? 14 : 0, (value / max) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px]" style={{ color: "hsl(150 10% 52%)" }}>{label}</span>
        <span className="ck-num text-[13px]" style={{ color: "hsl(150 26% 84%)" }}>{value}</span>
      </div>
      <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full" style={{ background: "hsl(150 12% 16%)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "hsl(152 46% 46%)" }} />
      </div>
    </div>
  );
}

// The amber job code on the card — now itself a copy button (no separate
// "copy code" action needed in the action rail). Stops propagation so it never
// triggers the whole-tile navigation.
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
      onClick={(e) => { e.stopPropagation(); void copy(); }}
      title="Copy job code"
      className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] transition-opacity hover:opacity-75"
      style={{ color: "hsl(38 60% 62%)" }}
    >
      {code}
      {copied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
    </button>
  );
}

function JobActions({ job, row }: { job: JobRow; row?: boolean }) {
  const navigate = useNavigate();
  const [kitOpen, setKitOpen] = useState(false);

  // Mode-aware public apply URL: showcase roles share by role code; real
  // (hireflow1) jobs share the public job page, which works for any deployment.
  const applyLink = job.roleCode
    ? candidateApplyUrl(job.roleCode)
    : `${window.location.origin}/candidate/job/${job.id}`;

  const items = [
    {
      icon: ExternalLink,
      label: "See live",
      onClick: () => window.open(`${window.location.origin}/candidate/job/${job.id}`, "_blank", "noopener"),
      disabled: false,
    },
    {
      icon: Share2,
      label: "Share kit",
      onClick: () => setKitOpen(true),
      disabled: false,
    },
    {
      icon: Pencil,
      label: "Edit",
      onClick: () => navigate(`/jobs/edit/${job.id}`),
      disabled: false,
    },
  ] as const;

  return (
    <div className={row ? "flex flex-wrap items-center gap-4 text-[13px]" : "flex shrink-0 flex-col gap-2.5 text-[13px]"}>
      {items.map(({ icon: Icon, label, onClick, disabled }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="flex items-center gap-2 transition-colors hover:opacity-80 disabled:opacity-40"
          style={{ color: "hsl(150 12% 62%)" }}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </button>
      ))}
      <ShareKitDialog open={kitOpen} job={job} applyUrl={applyLink} onClose={() => setKitOpen(false)} />
    </div>
  );
}

function SubStats({ job }: { job: JobRow }) {
  const maxStat = Math.max(1, job.stats.voice, job.stats.shortlist, job.stats.interview, job.stats.hired);
  return (
    <div className="grid grid-cols-4 gap-4" style={{ maxWidth: 380 }}>
      <SubStat label="Voice" value={job.stats.voice} max={maxStat} />
      <SubStat label="Shortlist" value={job.stats.shortlist} max={maxStat} />
      <SubStat label="Interview" value={job.stats.interview} max={maxStat} />
      <SubStat label="Hired" value={job.stats.hired} max={maxStat} />
    </div>
  );
}

function RoleIcon({ job }: { job: JobRow }) {
  const Icon = ROLE_ICONS[job.icon];
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full md:h-12 md:w-12"
      style={{ border: "1px solid hsl(150 16% 22% / 0.7)", color: "hsl(150 20% 70%)", background: "hsl(156 18% 9%)" }}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const navigate = useNavigate();
  // The whole tile is the primary "open" affordance — clicking it goes to the
  // role's applicants (what the old "View" action did). Inner buttons stop
  // propagation so they don't trigger this.
  const open = () => navigate(`/applicants?roleId=${job.id}`);
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        aria-label={`View applicants for ${job.title}`}
        className="ck-row hidden cursor-pointer items-center gap-4 p-4 md:flex"
      >
        <RoleIcon job={job} />
        <div className="w-[180px] shrink-0">
          <div className="font-display text-[20px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>{job.title}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{job.location}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>
            <Clock className="h-3 w-3 shrink-0" />
            <span className="truncate">{job.pay}</span>
          </div>
          {job.roleCode && <JobCodeButton code={job.roleCode} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          <div className="flex items-center gap-6">
            <StatusPill status={job.status} />
            <div className="flex items-baseline gap-1.5">
              <span className="ck-num text-[20px]" style={{ color: "hsl(150 30% 92%)" }}>{job.applicants}</span>
              <span className="text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>applicants</span>
            </div>
            <div className="text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>{job.dateLabel} {job.date}</div>
          </div>
          <SubStats job={job} />
        </div>
        <JobActions job={job} />
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        aria-label={`View applicants for ${job.title}`}
        className="ck-row cursor-pointer p-4 md:hidden"
      >
        <div className="flex items-start gap-3">
          <RoleIcon job={job} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-[18px] leading-tight" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>
                {job.title}
              </span>
              <StatusPill status={job.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{job.location}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" />{job.pay}</span>
            </div>
            {job.roleCode && <JobCodeButton code={job.roleCode} />}
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="ck-num text-[18px]" style={{ color: "hsl(150 30% 92%)" }}>{job.applicants}</span>
            <span className="text-[11px]" style={{ color: "hsl(150 10% 56%)" }}>applicants</span>
          </div>
        </div>

        <div className="mt-3.5">
          <SubStats job={job} />
        </div>

        <div className="mt-3.5 flex items-center justify-between border-t pt-3" style={{ borderColor: "hsl(150 12% 14% / 0.8)" }}>
          <span className="text-[11.5px]" style={{ color: "hsl(150 10% 50%)" }}>{job.dateLabel} {job.date}</span>
          <JobActions job={job} row />
        </div>
      </div>
    </>
  );
}

export default function CockpitJobs() {
  const navigate = useNavigate();
  const { account } = useCockpitAccount();
  const { jobs, isLoading } = useCockpitJobsData();
  const { pipeline } = useCockpitCandidates();

  // Real, data-derived recommendation (never a hardcoded role).
  const bottleneck = pipeline.find((p) => p.tone === "bottleneck");
  const avaText = bottleneck
    ? `Ava sees your biggest drop-off at the ${bottleneck.label.toLowerCase()} stage — worth a look.`
    : "Ava is screening your applicants and surfacing your strongest candidates.";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Jobs"
        subtitle={`Open roles at ${account.name}`}
        actions={
          <button className="ck-btn ck-btn-brass max-md:w-full" onClick={() => { clearDraft(); sessionStorage.removeItem("ava-create-active"); navigate("/jobs/create"); }}>
            <Plus className="h-4 w-4" />
            New role
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput placeholder="Search roles" className="min-w-[180px] flex-1" />
            <FilterSelect label="Status:" value="All" />
            <FilterSelect label="Location:" value="All" />
            <FilterSelect label="Sort:" value="Newest" />
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="ck-card p-8 text-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>Loading roles…</div>
            ) : jobs.length === 0 ? (
              <div className="ck-card flex flex-col items-center gap-4 p-10 text-center">
                <AvaOrb size={132} reflection={false} />
                <div>
                  <div className="font-display text-[20px]" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>Create your first role with Ava</div>
                  <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed" style={{ color: "hsl(150 10% 60%)" }}>
                    Just tell her who you need to hire — she'll shape it into a complete hiring flow.
                  </p>
                </div>
                <button className="ck-btn ck-btn-brass inline-flex items-center gap-2" onClick={() => { clearDraft(); navigate("/jobs/create"); }}>
                  <Mic className="h-4 w-4" /> Talk to Ava
                </button>
              </div>
            ) : (
              jobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="hidden lg:block">
            <AvaCard
              text={avaText}
              ctaLabel="View insight"
              orbSize={132}
              onCta={() => navigate("/analytics")}
            />
          </div>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="lg:hidden">
          <AvaCard variant="wide" text={avaText} onCta={() => navigate("/analytics")} />
        </div>
      )}
    </div>
  );
}
