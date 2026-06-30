import { useEffect, useState, type ReactNode } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, FileText } from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { isImageResumeUrl, isPdfResumeUrl } from "@/utils/resumeFiles";

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
      style={{ color: "hsl(150 14% 68%)", background: "hsl(156 16% 11% / 0.7)", border: "1px solid hsl(150 12% 16% / 0.8)" }}
    >
      {children}
    </button>
  );
}

export function ResumeViewerDialog({ open, url, candidateName, avaRead, onClose }: ResumeViewerDialogProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => { if (open) setZoom(1); }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  const isImage = isImageResumeUrl(url);
  const isPdf = isPdfResumeUrl(url);
  const clamp = (z: number) => Math.min(3, Math.max(0.5, +z.toFixed(2)));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-6">
      {/* scrim */}
      <div
        className="absolute inset-0"
        style={{ background: "hsl(156 40% 3% / 0.82)", backdropFilter: "blur(3px)" }}
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
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "hsl(150 12% 14%)" }}>
          <div className="flex min-w-0 items-center gap-2.5">
            <FileText className="h-[18px] w-[18px] shrink-0" style={{ color: "hsl(152 46% 58%)" }} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold" style={{ color: "hsl(150 28% 90%)" }}>Resume</div>
              <div className="truncate text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>{candidateName}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isImage && (
              <>
                <IconBtn label="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.25))}><ZoomOut className="h-4 w-4" /></IconBtn>
                <span className="w-11 text-center text-[12px] tabular-nums" style={{ color: "hsl(150 14% 64%)" }}>{Math.round(zoom * 100)}%</span>
                <IconBtn label="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.25))}><ZoomIn className="h-4 w-4" /></IconBtn>
                <IconBtn label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw className="h-4 w-4" /></IconBtn>
              </>
            )}
            <IconBtn label="Close" onClick={onClose}><X className="h-4 w-4" /></IconBtn>
          </div>
        </div>

        {/* body */}
        <div className="ck-scroll relative flex-1 overflow-auto" style={{ background: "hsl(156 24% 7%)" }}>
          {isImage ? (
            <img
              src={url}
              alt={`${candidateName}'s resume`}
              style={{ display: "block", margin: "16px auto", width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? 760 : "none", borderRadius: 8 }}
            />
          ) : isPdf ? (
            <iframe
              src={`${url}#view=FitH`}
              title={`${candidateName}'s resume`}
              className="h-full w-full"
              style={{ border: "none", background: "hsl(156 24% 7%)" }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="h-10 w-10" style={{ color: "hsl(150 12% 50%)" }} />
              <p className="text-[13px]" style={{ color: "hsl(150 12% 62%)" }}>This resume can’t be previewed inline.</p>
            </div>
          )}
        </div>

        {/* optional Ava one-liner — keeps context while reading the resume */}
        {avaRead && (
          <div className="flex items-start gap-2.5 border-t px-4 py-3" style={{ borderColor: "hsl(150 12% 14%)", background: "hsl(156 22% 6%)" }}>
            <AvaOrb size={32} reflection={false} glow={false} amp={0.22} flow={0.5} />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold" style={{ color: "hsl(150 26% 82%)" }}>Ava’s read</div>
              <p className="text-[12.5px] leading-snug" style={{ color: "hsl(150 12% 64%)" }}>{avaRead}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResumeViewerDialog;
