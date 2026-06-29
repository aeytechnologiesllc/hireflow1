import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * ActionDialog — a small, theme-locked (Deep Jade) confirm/reason modal for
 * cockpit decisions (Hire, Decline Offer, Pass). Keeps the cockpit's own dark
 * jade styling rather than the app's lighter shadcn dialog. Optional reason
 * textarea turns it into a "give a reason" prompt.
 */
interface ActionDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  /** brass = positive (hire), danger = destructive (pass/decline). */
  tone?: "brass" | "danger";
  busy?: boolean;
  /** Show a reason textarea; the entered text is passed to onConfirm. */
  withReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  onConfirm: (reason?: string) => void;
  onClose: () => void;
}

export function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "brass",
  busy = false,
  withReason = false,
  reasonLabel = "Reason (optional)",
  reasonPlaceholder = "",
  reasonRequired = false,
  onConfirm,
  onClose,
}: ActionDialogProps) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset the reason whenever the dialog re-opens.
  useEffect(() => {
    if (open) {
      setReason("");
      const t = setTimeout(() => textareaRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const confirmDisabled = busy || (withReason && reasonRequired && reason.trim().length === 0);
  const dangerStyle = tone === "danger";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* scrim */}
      <div
        className="absolute inset-0"
        style={{ background: "hsl(156 40% 3% / 0.7)", backdropFilter: "blur(2px)" }}
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="ck-card relative w-full max-w-[420px] p-5"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <button
          onClick={() => !busy && onClose()}
          className="absolute right-3 top-3"
          style={{ color: "hsl(150 10% 56%)" }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="font-display text-[19px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>
          {title}
        </div>
        {description && (
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "hsl(150 12% 64%)" }}>
            {description}
          </p>
        )}

        {withReason && (
          <div className="mt-4">
            <label className="text-[12.5px]" style={{ color: "hsl(150 12% 62%)" }}>
              {reasonLabel}
            </label>
            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="ck-input mt-1.5 w-full resize-none px-3 py-2"
              style={{ minHeight: 76 }}
            />
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="ck-btn ck-btn-ghost" onClick={() => !busy && onClose()} disabled={busy}>
            Cancel
          </button>
          <button
            className={`ck-btn ${dangerStyle ? "ck-btn-outline" : "ck-btn-brass"}`}
            style={dangerStyle ? { color: "hsl(8 66% 66%)", borderColor: "hsl(8 50% 40% / 0.5)" } : undefined}
            onClick={() => onConfirm(withReason ? reason : undefined)}
            disabled={confirmDisabled}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ActionDialog;
