import { useEffect, useRef, useState } from "react";
import { X, Copy, Check, ExternalLink, Printer } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

/**
 * ShareKitDialog — theme-locked (Deep Jade) per-job share kit: apply link +
 * QR code, ready-to-paste post text, one-tap job-board posters, and a
 * printable "We're hiring" QR flyer for the shop window. Opens from the Jobs
 * list so an employer can re-share any job long after publish day.
 */
interface ShareKitJob {
  id: string;
  title: string;
  location: string;
  pay: string;
  roleCode?: string | null;
}

interface ShareKitDialogProps {
  open: boolean;
  job: ShareKitJob | null;
  /** Public apply URL for this job (already mode-aware: role code or job id). */
  applyUrl: string;
  onClose: () => void;
}

function buildPostText(job: ShareKitJob, applyUrl: string): string {
  const lines = [
    `We're hiring: ${job.title}`,
    [job.location, job.pay].filter(Boolean).join(" · "),
    "",
    "Apply in about 3 minutes — no account needed:",
    applyUrl,
  ];
  return lines.filter((l, i) => l !== "" || i === 2).join("\n");
}

/** Open a print-ready flyer in a new window using the QR canvas as a PNG. */
function printFlyer(job: ShareKitJob, applyUrl: string, qrCanvas: HTMLCanvasElement | null) {
  const qrPng = qrCanvas?.toDataURL("image/png") ?? "";
  const w = window.open("", "_blank", "noopener,width=800,height=1000");
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
  .url { font-size: 14px; color: #6b7f77; margin-top: 22px; word-break: break-all; }
  .foot { margin-top: 44px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #9aa8a2; }
</style></head><body>
  <div class="kicker">We're Hiring</div>
  <h1>${esc(job.title)}</h1>
  <div class="meta">${esc([job.location, job.pay].filter(Boolean).join(" · "))}</div>
  ${qrPng ? `<img class="qr" src="${qrPng}" alt="QR code to apply" />` : ""}
  <div class="scan">Scan to apply — takes about 3 minutes</div>
  <div class="sub">No account needed. Apply right from your phone.</div>
  <div class="url">${esc(applyUrl)}</div>
  <div class="foot">Powered by HireFlow</div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`);
  w.document.close();
}

export function ShareKitDialog({ open, job, applyUrl, onClose }: ShareKitDialogProps) {
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

  const boards = [
    { label: "Indeed", href: "https://employers.indeed.com/p/post-job" },
    { label: "LinkedIn", href: "https://www.linkedin.com/talent/post-a-job" },
    { label: "ZipRecruiter", href: "https://www.ziprecruiter.com/post-job" },
  ];

  return (
    // Rendered inside a clickable job tile — swallow clicks so the tile's
    // whole-card navigation never fires while the kit is open.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      {/* scrim */}
      <div
        className="absolute inset-0"
        style={{ background: "hsl(156 40% 3% / 0.7)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="ck-card relative w-full max-w-[460px] p-5"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <button onClick={onClose} className="absolute right-3 top-3" style={{ color: "hsl(150 10% 56%)" }} aria-label="Close">
          <X className="h-4 w-4" />
        </button>

        <div className="font-display text-[19px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>
          Share this job
        </div>
        <p className="mt-0.5 truncate text-[13px]" style={{ color: "hsl(150 12% 62%)" }}>
          {job.title}
        </p>

        {/* ── Apply link ─────────────────────────────── */}
        <div className="mt-5 flex items-start gap-4">
          <div
            ref={qrWrapRef}
            className="shrink-0 rounded-xl p-2.5"
            style={{ background: "hsl(45 40% 96%)" }}
            aria-label="QR code for the apply link"
          >
            <QRCodeCanvas value={applyUrl} size={112} bgColor="#f7f4ea" fgColor="#10201a" level="M" />
          </div>
          <div className="min-w-0 flex-1 self-center">
            <div className="text-[11px] uppercase" style={{ color: "hsl(150 10% 55%)", letterSpacing: "0.12em" }}>
              Apply link
            </div>
            <div
              className="mt-1.5 break-all font-mono text-[12.5px] leading-relaxed"
              style={{ color: "hsl(150 26% 82%)" }}
            >
              {applyUrl.replace(/^https?:\/\//, "")}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="ck-btn ck-btn-brass !px-3 !text-[12.5px]" onClick={() => void copy(applyUrl, "link")}>
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
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid hsl(150 12% 16%)" }}>
          <div className="text-[11px] uppercase" style={{ color: "hsl(150 10% 55%)", letterSpacing: "0.12em" }}>
            Ready-to-paste post
          </div>
          <div className="relative mt-2">
            <pre
              className="overflow-x-auto whitespace-pre-wrap rounded-xl px-3.5 py-3 pr-24 text-[12.5px] leading-relaxed"
              style={{ background: "hsl(150 16% 11%)", border: "1px solid hsl(150 12% 17%)", color: "hsl(150 18% 74%)", fontFamily: "inherit" }}
            >
              {postText}
            </pre>
            <button
              className="ck-btn ck-btn-outline absolute right-2 top-2 !px-2.5 !py-1.5 !text-[12px]"
              onClick={() => void copy(postText, "post")}
            >
              {copiedPost ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
            </button>
          </div>
        </div>

        {/* ── Job boards ─────────────────────────────── */}
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid hsl(150 12% 16%)" }}>
          <div className="text-[11px] uppercase" style={{ color: "hsl(150 10% 55%)", letterSpacing: "0.12em" }}>
            Post it free on job boards
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {boards.map((b) => (
              <a
                key={b.label}
                href={b.href}
                target="_blank"
                rel="noreferrer"
                className="ck-btn ck-btn-outline justify-center !px-2 !text-[12.5px]"
              >
                {b.label} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: "hsl(152 40% 62%)" }}>
            <Check className="h-3.5 w-3.5" /> Already live on Google for Jobs and partner feeds.
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShareKitDialog;
