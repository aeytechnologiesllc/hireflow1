import { useEffect, useState, type ReactNode } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, FileText } from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import { isImageResumeUrl, isPdfResumeUrl } from "@/utils/resumeFiles";
import { resolveResumeUrl } from "@/utils/resumeSignedUrl";

/**
 * ResumeViewerDialog — a premium, theme-locked (Deep Jade) inline viewer for a
 * candidate's resume. Opens IN the cockpit (never navigates to a new tab or an
 * external app). Images get pinch-free zoom controls; PDFs render inline via the
 * browser's own viewer (FitH). An optional one-line Ava read sits at the bottom
 * so the employer keeps context while reading.
 */
interface ResumeViewerDialogProps {
  open: boolean;
  url: string | null;
  candidateName: string;
  /** Optional one-line Ava read shown as a slim strip at the bottom. */
  avaRead?: string;
  onClose: () => void;
}

function IconBtn({ onClick, label, children }: { onClick?: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
      style={{ color: "var(--hf-text-soft)", background: "color-mix(in srgb, var(--hf-surface-raised) 70%, transparent)", border: "1px solid color-mix(in srgb, var(--hf-border-strong) 80%, transparent)" }}
    >
      {children}
    </button>
  );
}

export function ResumeViewerDialog({ open, url, candidateName, avaRead, onClose }: ResumeViewerDialogProps) {
  const [zoom, setZoom] = useState(1);
  // `url` is the stored value (legacy public URL or bare path). Resolve it to a
  // short-lived signed URL on open so the private bucket stays private.
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  // Anything that stops the file reaching the panel — signing threw, or the
  // signed url was refused/expired by the time the browser fetched it.
  const [failed, setFailed] = useState(false);
  // Bumped by "Try again". A signed url only lives 300s, so re-minting it is
  // the right fix for both a dead link and a connection that dropped.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { if (open) setZoom(1); }, [open, url]);

  useEffect(() => {
    let cancelled = false;
    if (open && url) {
      setDisplayUrl(null);
      setFailed(false);
      resolveResumeUrl(url)
        .then((signed) => { if (!cancelled) { if (signed) setDisplayUrl(signed); else setFailed(true); } })
        // createSignedUrl rejects outright when the network is down — say so
        // rather than holding "Loading resume…" forever.
        .catch(() => { if (!cancelled) setFailed(true); });
    }
    return () => { cancelled = true; };
  }, [open, url, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  // Format detection uses the ORIGINAL stored url (stable extension); the signed
  // url carries a ?token but the path extension still resolves correctly too.
  const isImage = isImageResumeUrl(url);
  const isPdf = isPdfResumeUrl(url);
  const clamp = (z: number) => Math.min(3, Math.max(0.5, +z.toFixed(2)));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-6">
      {/* scrim */}
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--hf-bg) 82%, transparent)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Resume — ${candidateName}`}
        className="ck-card relative flex w-full max-w-[920px] flex-col overflow-hidden"
        style={{ height: "min(88vh, 1000px)", animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--hf-border-strong)" }}>
          <div className="flex min-w-0 items-center gap-2.5">
            <FileText className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--hf-green)" }} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Resume</div>
              <div className="truncate text-[12px]" style={{ color: "var(--hf-text-muted)" }}>{candidateName}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isImage && (
              <>
                <IconBtn label="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.25))}><ZoomOut className="h-4 w-4" /></IconBtn>
                <span className="w-11 text-center text-[12px] tabular-nums" style={{ color: "var(--hf-text-soft)" }}>{Math.round(zoom * 100)}%</span>
                <IconBtn label="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.25))}><ZoomIn className="h-4 w-4" /></IconBtn>
                <IconBtn label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw className="h-4 w-4" /></IconBtn>
              </>
            )}
            <IconBtn label="Close" onClick={onClose}><X className="h-4 w-4" /></IconBtn>
          </div>
        </div>

        {/* body */}
        <div className="ck-scroll relative flex-1 overflow-auto" style={{ background: "var(--hf-bg)" }}>
          {failed ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="h-10 w-10" style={{ color: "var(--hf-text-muted)" }} />
              <p className="max-w-[320px] text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
                I couldn’t open this resume. The secure link may have expired.
              </p>
              <button type="button" className="ck-btn ck-btn-outline" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : !displayUrl ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <AvaSeal size={30} />
              <p className="text-[13px]" style={{ color: "var(--hf-text-soft)" }}>Loading resume…</p>
            </div>
          ) : isImage ? (
            <img
              src={displayUrl}
              alt={`${candidateName}'s resume`}
              onError={() => setFailed(true)}
              style={{ display: "block", margin: "16px auto", width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? 760 : "none", borderRadius: 8 }}
            />
          ) : isPdf ? (
            <iframe
              src={`${displayUrl}#view=FitH`}
              title={`${candidateName}'s resume`}
              onError={() => setFailed(true)}
              className="h-full w-full"
              style={{ border: "none", background: "var(--hf-bg)" }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="h-10 w-10" style={{ color: "var(--hf-text-muted)" }} />
              <p className="text-[13px]" style={{ color: "var(--hf-text-soft)" }}>This resume can’t be previewed inline.</p>
            </div>
          )}
        </div>

        {/* optional Ava one-liner — keeps context while reading the resume */}
        {avaRead && (
          <div className="flex items-start gap-2.5 border-t px-4 py-3" style={{ borderColor: "var(--hf-border-strong)", background: "var(--hf-bg)" }}>
            <AvaSeal size={26} />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold" style={{ color: "var(--hf-text)" }}>Ava’s read</div>
              <p className="text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>{avaRead}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResumeViewerDialog;
