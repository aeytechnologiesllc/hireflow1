import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Printer } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { jobShareUrl } from "@/lib/jobLinks";
import { shortLinkFor } from "@/lib/jobSlug";

/**
 * ShareKitDialog — theme-locked (Deep Jade) per-job share kit: apply link +
 * QR code, ready-to-paste post text, and a printable "We're hiring" QR flyer
 * for the shop window. Opens from the Jobs list so an employer can re-share
 * any job long after publish day. Everything here shares HireFlow's own
 * link — it never sends anyone to post the job by hand on an outside board.
 */
interface ShareKitJob {
  id: string;
  title: string;
  location: string;
  pay: string;
  roleCode?: string | null;
  /** The short link name: hireflownow.com/<slug> (docs/SHORT-JOB-LINKS.md). */
  slug?: string | null;
  /** The job has steps done at a computer (a connection check, a typing test,
   *  a chat practice, an interview: docs/COMPUTER-ONLY-TESTS.md). Only then do
   *  the post and flyer say "on your computer". */
  onComputer?: boolean;
}

interface ShareKitDialogProps {
  open: boolean;
  job: ShareKitJob | null;
  /** The caller's link for this job (role code or job id). A job with a short
   *  link is shared by that instead, whichever page opened the kit. */
  applyUrl: string;
  onClose: () => void;
}

/**
 * The words the kit hands out, true to what applying is (owner, 2026-10-06:
 * "It's all online, on your computer"). They used to promise "about 3
 * minutes" and "no account needed": applying makes an account, and the steps
 * after it (a typing test, a chat practice, a written interview) take far
 * longer and are done on a computer.
 *
 * The computer line is true only for a job with computer steps, so a job
 * without them (an in-person cafe role, say) gets the plain line instead.
 */
export const SHARE_POST_LEAD = "It's all online, on your computer. Apply here:";
export const SHARE_POST_LEAD_PLAIN = "Apply here:";
export const FLYER_SCAN_LINE = "Scan to see the job and apply";
export const FLYER_SUB_LINE = "It's all online, on your computer.";

export function buildPostText(job: Pick<ShareKitJob, "title" | "location" | "pay" | "onComputer">, applyUrl: string): string {
  const lines = [
    `We're hiring: ${job.title}`,
    [job.location, job.pay].filter(Boolean).join(" · "),
    "",
    job.onComputer ? SHARE_POST_LEAD : SHARE_POST_LEAD_PLAIN,
    applyUrl,
  ];
  return lines.filter((l, i) => l !== "" || i === 2).join("\n");
}

/**
 * A link that breaks only where a person would break it: after the last "/"
 * (hireflownow.com/ | team-lead), never inside the job's name. The name is one
 * unbreakable piece unless it is wider than the whole line on its own.
 */
function LinkText({ url }: { url: string }) {
  const cut = url.lastIndexOf("/") + 1;
  const head = url.slice(0, cut);
  const tail = url.slice(cut);
  return (
    <>
      <span className="[overflow-wrap:anywhere]">{head}</span>
      <wbr />
      {/* One piece: it moves to the next line whole, and breaks inside only
          when it is wider than the line by itself. */}
      <span className="inline-block max-w-full [overflow-wrap:anywhere]">{tail}</span>
    </>
  );
}

/** Open a print-ready flyer in a new window using the QR canvas as a PNG. */
function printFlyer(job: ShareKitJob, applyUrl: string, qrCanvas: HTMLCanvasElement | null) {
  const qrPng = qrCanvas?.toDataURL("image/png") ?? "";
  // No "noopener" in the features: with it window.open returns null, so the
  // flyer was never written (a blank window, and a false "pop-up blocked").
  // The window is ours and only ever gets the document below; the link back
  // to this page is cut once it is written.
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) {
    toast.error("Pop-up blocked — allow pop-ups to print the flyer");
    return;
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  w.document.write(`<!doctype html><html><head><title>We're hiring — ${esc(job.title)}</title>
<style>
  @page { margin: 0.75in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #10201a; text-align: center; padding: 48px 32px; }
  .kicker { font-size: 20px; letter-spacing: 0.35em; text-transform: uppercase; color: #8a6d2f; }
  h1 { font-size: 44px; line-height: 1.15; margin: 20px 0 8px; }
  .meta { font-size: 20px; color: #3d554b; margin-bottom: 36px; }
  .qr { width: 300px; height: 300px; margin: 0 auto; }
  .scan { font-size: 22px; margin-top: 28px; font-weight: bold; }
  .sub { font-size: 16px; color: #3d554b; margin-top: 8px; }
  .url { font-size: 14px; color: #6b7f77; margin-top: 22px; overflow-wrap: anywhere; }
  .foot { margin-top: 44px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #9aa8a2; }
</style></head><body>
  <div class="kicker">We're Hiring</div>
  <h1>${esc(job.title)}</h1>
  <div class="meta">${esc([job.location, job.pay].filter(Boolean).join(" · "))}</div>
  ${qrPng ? `<img class="qr" src="${qrPng}" alt="QR code to apply" />` : ""}
  <div class="scan">${esc(FLYER_SCAN_LINE)}</div>
  ${job.onComputer ? `<div class="sub">${esc(FLYER_SUB_LINE)}</div>` : ""}
  <div class="url">${esc(applyUrl)}</div>
  <div class="foot">Powered by HireFlow</div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`);
  w.document.close();
  w.opener = null;
}

export function ShareKitDialog({ open, job, applyUrl: callerUrl, onClose }: ShareKitDialogProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPost, setCopiedPost] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setCopiedLink(false);
      setCopiedPost(false);
    }
  }, [open]);

  if (!open || !job) return null;

  // One link for the copy button, the QR code, the flyer and the post.
  const applyUrl = shortLinkFor(job) ? jobShareUrl(job) : callerUrl;
  const postText = buildPostText(job, applyUrl);

  const copy = async (text: string, which: "link" | "post") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "link") {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedPost(true);
        setTimeout(() => setCopiedPost(false), 2000);
      }
      toast.success(which === "link" ? "Apply link copied" : "Job post copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const getQrCanvas = () => qrWrapRef.current?.querySelector("canvas") ?? null;

  return createPortal(
    // Portalled to <body>. It is opened from inside a job tile, and the tile's
    // entrance animation leaves a transform on it, which makes `fixed` mean
    // "fixed to the tile": the kit opened 111px above the top of the screen
    // on a laptop (owner, 2026-10-06: "it needs to open up center"). React
    // events still bubble through the portal to the tile, so clicks are
    // swallowed here and the tile's whole-card navigation never fires.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      {/* scrim: a blur over a light dark tint, never a pale wash (same as the
          record panel; --slab stays dark in both themes) */}
      <div
        className="absolute inset-0"
        style={{
          background: "color-mix(in srgb, var(--slab) 22%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${job.title}`}
        className="ck-card relative max-h-[calc(100dvh-2rem)] w-full max-w-[460px] overflow-y-auto p-5"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <button onClick={onClose} className="absolute right-3 top-3" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
          <X className="h-4 w-4" />
        </button>

        <div className="font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
          Share this job
        </div>
        <p className="mt-0.5 truncate text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
          {job.title}
        </p>

        {/* ── Apply link ─────────────────────────────── */}
        <div className="mt-5 flex items-start gap-4">
          <div
            ref={qrWrapRef}
            className="shrink-0 rounded-xl p-2.5"
            style={{ background: "var(--hf-gold)" }}
            aria-label="QR code for the apply link"
          >
            <QRCodeCanvas value={applyUrl} size={112} bgColor="#f7f4ea" fgColor="#10201a" level="M" />
          </div>
          <div className="min-w-0 flex-1 self-center">
            <div className="text-[11px] uppercase" style={{ color: "var(--hf-text-muted)", letterSpacing: "0.12em" }}>
              Apply link
            </div>
            <div
              className="mt-1.5 font-mono text-[12.5px] leading-relaxed"
              style={{ color: "var(--hf-text)" }}
            >
              <LinkText url={applyUrl.replace(/^https?:\/\//, "")} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="ck-btn ck-btn-primary !px-3 !text-[12.5px]" onClick={() => void copy(applyUrl, "link")}>
                {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy link
              </button>
              <button
                className="ck-btn ck-btn-outline !px-3 !text-[12.5px]"
                onClick={() => printFlyer(job, applyUrl, getQrCanvas())}
              >
                <Printer className="h-3.5 w-3.5" /> Print flyer
              </button>
            </div>
          </div>
        </div>

        {/* ── Post text ──────────────────────────────── */}
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--hf-border-strong)" }}>
          <div className="text-[11px] uppercase" style={{ color: "var(--hf-text-muted)", letterSpacing: "0.12em" }}>
            Ready-to-paste post
          </div>
          <div className="relative mt-2">
            <pre
              className="overflow-x-auto whitespace-pre-wrap rounded-xl px-3.5 py-3 pr-24 text-[12.5px] leading-relaxed"
              style={{ background: "var(--hf-surface-raised)", border: "1px solid var(--hf-border-strong)", color: "var(--hf-text-soft)", fontFamily: "inherit" }}
            >
              {/* The post as text, with its link drawn by LinkText so the job's
                  name never splits across lines (the copy button copies
                  postText itself, unchanged). */}
              {postText.endsWith(applyUrl) ? (
                <>
                  {postText.slice(0, postText.length - applyUrl.length)}
                  <LinkText url={applyUrl} />
                </>
              ) : (
                postText
              )}
            </pre>
            <button
              className="ck-btn ck-btn-outline absolute right-2 top-2 !px-2.5 !py-1.5 !text-[12px]"
              onClick={() => void copy(postText, "post")}
            >
              {copiedPost ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
            </button>
          </div>
        </div>

        {/* ── Status note ────────────────────────────── */}
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--hf-border-strong)" }}>
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--hf-text-soft)" }}>
            <Check className="h-3.5 w-3.5" /> Your page is live: anyone with the link can open it.
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ShareKitDialog;
