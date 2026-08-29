import { useEffect, useState, type ReactNode } from "react";
import { Download, ExternalLink, FileText, Minus, Plus, RotateCcw, X } from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import { isImageResumeUrl, isPdfResumeUrl } from "@/utils/resumeFiles";
import { resolveResumeUrl } from "@/utils/resumeSignedUrl";

/**
 * DocumentPreviewDialog — a premium, centered, letterhead-styled viewer for a
 * document on file (a resume today; the shape holds for whatever else lands
 * on this letterhead later). Opens IN the cockpit — never a new tab, unless
 * the employer explicitly asks for one.
 *
 * `sourceUrl` is the RAW stored value (a legacy public URL or a bare path in
 * the private `resumes` bucket) — the same value the record carries. It is
 * resolved to a short-lived signed URL here via `resolveResumeUrl`, the exact
 * signing path the rest of the app already trusts, so the private bucket
 * never becomes a public one just because this dialog exists.
 */
interface DocumentPreviewDialogProps {
  open: boolean;
  sourceUrl: string | null;
  candidateName: string;
  /** What's on the letterhead — defaults to "Resume". */
  label?: string;
  onClose: () => void;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;
/** A resume page, in CSS px, at 100% — used only to give the transform-scaled
 *  PDF frame a real footprint so the scroll area sizes correctly around it. */
const PAGE_W = 800;
const PAGE_H = 1035;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));
}

/** Filesystem-safe, so "Marisol Cruz" → "Marisol Cruz — Resume.pdf" downloads clean. */
function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "Candidate";
}

function extensionOf(url: string | null): string {
  if (isImageResumeUrl(url)) {
    const match = (url ?? "").toLowerCase().split("?")[0].match(/\.(png|jpe?g|webp|gif)$/);
    return match ? match[1] : "png";
  }
  return "pdf";
}

function IconBtn({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick?: () => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded-md transition-transform duration-150 hover:opacity-80 active:scale-90 disabled:opacity-30 disabled:active:scale-100"
      style={{ color: "var(--ink-2)" }}
    >
      {children}
    </button>
  );
}

export function DocumentPreviewDialog({
  open,
  sourceUrl,
  candidateName,
  label = "Resume",
  onClose,
}: DocumentPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);
  // `sourceUrl` is the stored value. Resolve it to a short-lived signed url on
  // open so the private bucket stays private.
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  // Anything that keeps the file off the page — no file on record, signing
  // threw, or the signed url was refused/expired by the time it loaded.
  const [failed, setFailed] = useState(false);
  // Bumped by "Try again" — a signed url is short-lived, so re-minting it is
  // the right fix for both a dead link and a connection that dropped.
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open) setZoom(1);
  }, [open, sourceUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!open) return;
    if (!sourceUrl) {
      setDisplayUrl(null);
      setFailed(true);
      return;
    }
    setDisplayUrl(null);
    setFailed(false);
    resolveResumeUrl(sourceUrl)
      .then((signed) => {
        if (cancelled) return;
        if (signed) setDisplayUrl(signed);
        else setFailed(true);
      })
      // createSignedUrl rejects outright when the network is down — say so
      // rather than holding "Opening…" forever.
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceUrl, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isImage = isImageResumeUrl(sourceUrl);
  const isPdf = !isImage && isPdfResumeUrl(sourceUrl);
  const unsupported = !isImage && !isPdf;
  const fileName = `${safeFileName(candidateName)} — ${label}.${extensionOf(sourceUrl)}`;

  const handleDownload = async () => {
    if (!displayUrl || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(displayUrl);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // The preview already rendered fine, so this is a transient fetch
      // failure rather than a missing file — "Open in new tab" is still
      // right there as a fallback path, no separate error state needed.
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-6">
      {/* scrim */}
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--ink) 45%, transparent)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${label} — ${candidateName}`}
        className="ck-card relative flex w-full max-w-[880px] flex-col overflow-hidden"
        style={{ height: "min(88vh, 980px)", animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        {/* the brass rule across the head of the letterhead */}
        <span
          aria-hidden
          className="absolute left-5 right-5 top-0 h-[2px] rounded-[1px]"
          style={{ background: "var(--brass-line)" }}
        />

        {/* header */}
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="ck-seal ck-seal-press shrink-0">
              <AvaSeal size={24} />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
                {label}
              </div>
              <div className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                {candidateName}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!failed && !unsupported && displayUrl && (
              <div
                className="ck-lift flex items-center gap-1 rounded-lg border px-1.5 py-1"
                style={{ borderColor: "var(--line-soft)", background: "var(--ground-2)" }}
              >
                <IconBtn label="Zoom out" onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN}>
                  <Minus className="h-3.5 w-3.5" />
                </IconBtn>
                <span className="ck-num w-11 text-center text-[12px]" style={{ color: "var(--ink-2)" }}>
                  {Math.round(zoom * 100)}%
                </span>
                <IconBtn label="Zoom in" onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX}>
                  <Plus className="h-3.5 w-3.5" />
                </IconBtn>
                {zoom !== 1 && (
                  <IconBtn label="Reset zoom" onClick={() => setZoom(1)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </IconBtn>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ck-btn ck-btn-ghost !h-8 !w-8 !p-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="ck-scroll relative flex-1 overflow-auto" style={{ background: "var(--ground-2)" }}>
          {failed ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="h-9 w-9" style={{ color: "var(--ink-3)" }} aria-hidden />
              <p className="max-w-[320px] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {sourceUrl
                  ? "I couldn't open this file. The secure link may have expired."
                  : "No resume is on file for this application."}
              </p>
              {sourceUrl && (
                <button type="button" className="ck-btn ck-btn-outline" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              )}
            </div>
          ) : !displayUrl ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="ck-seal-breathe">
                <AvaSeal size={30} />
              </span>
              <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                Opening the file…
              </p>
            </div>
          ) : unsupported ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="h-9 w-9" style={{ color: "var(--ink-3)" }} aria-hidden />
              <p className="max-w-[320px] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                This file can&rsquo;t be previewed inline — download it to open it.
              </p>
            </div>
          ) : isImage ? (
            <img
              src={displayUrl}
              alt={`${candidateName}'s ${label.toLowerCase()}`}
              onError={() => setFailed(true)}
              style={{
                display: "block",
                margin: "24px auto",
                width: `${zoom * 100}%`,
                maxWidth: zoom <= 1 ? 720 : "none",
                borderRadius: 8,
                boxShadow: "var(--hf-shadow-raised)",
              }}
            />
          ) : (
            <div className="flex justify-center py-6">
              {/* sizer reserves the real, scaled footprint so the scroll area
                  around it measures correctly; the inner box is transform-scaled
                  at its natural size, exactly as a zoom control should work. */}
              <div style={{ width: PAGE_W * zoom, minHeight: PAGE_H * zoom }}>
                <div
                  style={{
                    width: PAGE_W,
                    height: PAGE_H,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top center",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface)",
                    boxShadow: "var(--hf-shadow-raised)",
                  }}
                >
                  <iframe
                    src={`${displayUrl}#view=FitH`}
                    title={`${candidateName}'s ${label.toLowerCase()}`}
                    onError={() => setFailed(true)}
                    style={{ width: PAGE_W, height: PAGE_H, border: "none" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer — download here, or leave on your own terms */}
        <div
          className="flex items-center justify-between gap-3 border-t px-5 py-3.5"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <button
            type="button"
            onClick={() => displayUrl && window.open(displayUrl, "_blank", "noopener,noreferrer")}
            disabled={!displayUrl}
            className="inline-flex items-center gap-1.5 text-[12px] transition-opacity duration-150 hover:opacity-75 active:opacity-55 disabled:opacity-30"
            style={{ color: "var(--ink-3)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!displayUrl || downloading}
            className="ck-btn ck-btn-primary !py-2 !text-[12.5px]"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? "Preparing…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DocumentPreviewDialog;
