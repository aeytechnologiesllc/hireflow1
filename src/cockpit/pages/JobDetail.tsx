import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useUpdateJob } from "@/hooks/useJobs";
import { jobShareUrl } from "@/lib/jobLinks";
import { ShareKitDialog } from "../components/ShareKitDialog";
import { CockpitErrorCard } from "../components/ErrorCard";
import { JobStatusChip } from "../components/JobStatusChip";
import { useCockpitJobsData } from "../hooks/useCockpitData";
import { useJobScope } from "../lib/jobScope";
import CockpitApplicants from "./Applicants";

/**
 * One job, from the inside (2026-10-21).
 *
 * Opening a job used to land on Applicants with a job filter, and the menu
 * jumped to Applicants with it. The owner: "it should keep me in the job tab.
 * Take me inside. So when there's 4 or 5 jobs, when I go inside, I could only
 * see their applicants." So the job is the page: its name, its state and its
 * link on top, and below it only its applicants, in the same list (tabs,
 * filters, sort) the Applicants tab draws for everyone. A person opened from
 * here stays under Jobs too (lib/jobScope.ts). Applicants is still the place
 * to see every job's people at once.
 */
export default function CockpitJobDetail() {
  const jobId = useJobScope();
  const navigate = useNavigate();
  const { jobs, rawJobs, isLoading, isError, refetch } = useCockpitJobsData();
  const updateJob = useUpdateJob();
  const [shareOpen, setShareOpen] = useState(false);

  const job = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);

  // "Posted 2 months ago · USD 15 to 18 an hour · Springfield, IL", worked out
  // the way the Jobs list works it out, so the two never disagree.
  const meta = useMemo(() => {
    if (!job) return "";
    const raw = rawJobs.find((r) => r.id === job.id);
    const stamp = raw ? (job.status === "draft" ? raw.updated_at : raw.created_at) : null;
    const when = stamp
      ? `${job.dateLabel} ${formatDistanceToNow(new Date(stamp), { addSuffix: true })}`
      : `${job.dateLabel} ${job.date === "Recently" ? "recently" : job.date}`;
    return [when, job.pay, job.location].filter(Boolean).join(" · ");
  }, [job, rawJobs]);

  const back = (
    <Link
      to="/jobs"
      className="inline-flex items-center gap-1 text-[13px] transition-opacity hover:opacity-75"
      style={{ color: "var(--ink-3)" }}
    >
      <ChevronLeft className="h-4 w-4" />
      All jobs
    </Link>
  );

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="ck-reveal h-[74px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="ck-card ck-reveal h-[64px]" style={{ ["--ck-i" as string]: i, opacity: 0.55 }} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <CockpitErrorCard message="We couldn't load this job just now." onRetry={refetch} />;
  }

  // Deleted, or a job this team member isn't on. Said as such, with the way back.
  if (!job) {
    return (
      <div className="space-y-4">
        {back}
        <section className="ck-card ck-reveal p-6 md:p-8">
          <h1 className="font-display text-[22px]" style={{ color: "var(--ink)", fontWeight: 500 }}>
            This job isn&rsquo;t in your list.
          </h1>
          <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The link names a job that was deleted, or one you aren&rsquo;t on.
          </p>
          <div className="mt-5">
            <button type="button" className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => navigate("/jobs")}>
              See your jobs
            </button>
          </div>
        </section>
      </div>
    );
  }

  const live = job.status === "live";
  const draft = job.status === "draft";
  const filled = job.status === "closed" && job.stats.hired > 0;

  // Closing is the reversible way out ("Post it again" brings it back), so,
  // as on the Jobs list, it needs no dialog.
  const closeRole = async () => {
    try {
      await updateJob.mutateAsync({ id: job.id, status: "closed" });
      toast.success(`${job.title} is closed. Nobody new can apply; everyone who did is still here.`);
    } catch (error) {
      console.error("Failed to close job:", error);
      const said = error instanceof Error && /^Your team role|isn't there any more/.test(error.message) ? error.message : null;
      toast.error(said ?? "Couldn't close this role. Please try again.");
    }
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <div>
        {back}
        <header className="ck-rise mt-2 flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 basis-[260px]">
            <h1
              className="font-display"
              style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15, color: "var(--ink)" }}
            >
              {job.title}
              <JobStatusChip status={job.status} filled={filled} />
            </h1>
            {meta && (
              <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--ink-3)" }}>
                {meta}
              </p>
            )}
          </div>
          {/* The quiet ways out first, so the one next thing stays loudest. */}
          <div className="flex shrink-0 flex-wrap gap-2 max-md:w-full">
            {live && (
              <button
                type="button"
                title="Take it off your job page so nobody new can apply — you can post it again later"
                className="ck-btn ck-btn-ghost !px-3 !py-2 !text-[12.5px]"
                disabled={updateJob.isPending}
                onClick={() => void closeRole()}
              >
                Close role
              </button>
            )}
            {!draft && (
              <button
                type="button"
                className="ck-btn ck-btn-outline !px-3.5 !py-2 !text-[12.5px]"
                onClick={() => navigate(`/jobs/edit/${job.id}`)}
              >
                {live ? "Edit job" : "Post it again"}
              </button>
            )}
            {live && (
              <button
                type="button"
                title="Get the apply link, a QR code and a printable flyer for this job"
                className="ck-btn ck-btn-primary !px-3.5 !py-2 !text-[12.5px] max-md:flex-1"
                onClick={() => setShareOpen(true)}
              >
                Share link
              </button>
            )}
            {draft && (
              <button
                type="button"
                className="ck-btn ck-btn-primary !px-3.5 !py-2 !text-[12.5px] max-md:flex-1"
                onClick={() => navigate(`/jobs/edit/${job.id}`)}
              >
                Finish &amp; publish
              </button>
            )}
          </div>
        </header>
      </div>

      <CockpitApplicants jobId={job.id} />

      <ShareKitDialog open={shareOpen} job={job} applyUrl={jobShareUrl(job)} onClose={() => setShareOpen(false)} />
    </div>
  );
}
