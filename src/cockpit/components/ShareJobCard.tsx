import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import AvaSeal from "@/components/ava/AvaSeal";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import { candidateOrigin } from "@/lib/hosts";

/**
 * The one way a live role's link is shown and shared, on every staff page
 * that needs it (Dashboard, Applicants, Interviews, Analytics). Before
 * 2026-10-05 the Dashboard had its own copy and the other pages had none:
 * they told an owner with a live role to "Post your first job".
 */

export interface ShareableJob {
  id: string;
  title: string;
  roleCode?: string | null;
}

/** The link a candidate applies through: the role code when there is one. */
export function applyLinkFor(job: ShareableJob): string {
  return job.roleCode ? candidateApplyUrl(job.roleCode) : `${candidateOrigin()}/candidate/job/${job.id}`;
}

/**
 * Opens the role the way a candidate sees it: on the candidates' site, in a
 * new tab. The referrer is kept on purpose (no `noreferrer`): it marks the
 * visit as the team's own, so it is not counted as candidate traffic.
 */
export function openAsCandidate(job: ShareableJob) {
  window.open(`${candidateOrigin()}/candidate/job/${job.id}`, "_blank", "noopener");
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }, [text]);
  return { copied, copy };
}

function LinkRow({ url, copied, onCopy }: { url: string; copied: boolean; onCopy: () => void }) {
  return (
    <div
      className="flex w-full max-w-[56ch] flex-wrap items-center gap-3 rounded-[10px] px-4 py-3"
      style={{ background: "var(--hf-surface-strong)", border: "1px solid var(--line)" }}
    >
      <span
        className="min-w-0 flex-1 truncate text-[13px]"
        style={{ color: "var(--hf-text)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
      >
        {url}
      </span>
      <button className="ck-btn ck-btn-primary shrink-0 !py-2 !text-[13px]" onClick={onCopy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

/** The live role, front and centre: what the owner does while nobody has applied yet. */
export function ShareJobHero({ job }: { job: ShareableJob }) {
  const url = applyLinkFor(job);
  const { copied, copy } = useCopy(url);
  return (
    <section
      className="ck-card ck-reveal flex flex-col items-start gap-5 p-6 text-left md:p-10"
      style={{ ["--ck-i" as string]: 1, borderTop: "3px solid var(--hf-gold-border)" }}
    >
      <span className="ck-seal-breathe">
        <AvaSeal size={44} />
      </span>
      <div className="max-w-[56ch]">
        <h2
          className="font-display"
          style={{ fontSize: "clamp(21px, 2.4vw, 28px)", lineHeight: 1.2, color: "var(--hf-text)", fontWeight: 500 }}
        >
          {job.title} is live.
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6]" style={{ color: "var(--hf-text-soft)" }}>
          Share this link anywhere people will see it. The moment someone applies, I read them and seal them right
          here, scored, with the evidence behind it.
        </p>
      </div>
      <LinkRow url={url} copied={copied} onCopy={() => void copy()} />
      <button
        type="button"
        className="text-[13px] font-semibold transition-opacity hover:opacity-75"
        style={{ color: "var(--hf-gold)" }}
        onClick={() => openAsCandidate(job)}
      >
        See it the way a candidate does →
      </button>
    </section>
  );
}

/** The same link, quietly: for pages whose own subject is something else. */
export function ShareJobCompact({ job, lead }: { job: ShareableJob; lead?: string }) {
  const url = applyLinkFor(job);
  const { copied, copy } = useCopy(url);
  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
        {lead ?? (
          <>
            <span style={{ color: "var(--hf-text)", fontWeight: 600 }}>{job.title}</span> is live. Share its link:
          </>
        )}
      </p>
      <LinkRow url={url} copied={copied} onCopy={() => void copy()} />
      <button
        type="button"
        className="self-start text-[13px] font-semibold transition-opacity hover:opacity-75"
        style={{ color: "var(--hf-gold)" }}
        onClick={() => openAsCandidate(job)}
      >
        See it the way a candidate does →
      </button>
    </div>
  );
}
