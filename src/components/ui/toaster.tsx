import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import "@/styles/toasts.css";

/** The older notifications, drawn as the same warm card as the main ones
 *  (src/components/ui/sonner.tsx): a mark at the left (a soft red one for an
 *  error), the words, an action as an ink word, and the line that runs out. */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const tone = variant === "destructive" ? "crit" : variant === "warning" ? "warn" : "ok";
        return (
          <Toast key={id} variant={variant} {...props}>
            <span className="hf-toast-mark shrink-0" data-tone={tone} aria-hidden="true">
              {tone === "ok" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path className="hf-toast-tick" d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M12 7v6" />
                  <path d="M12 17h.01" />
                </svg>
              )}
            </span>
            <div className="grid min-w-0 flex-1 gap-0.5 pt-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
            <span className="hf-toast-time text-[var(--action)] group-[.destructive]:text-[var(--crit)] group-[.warning]:text-[var(--hf-warning)]" aria-hidden="true" />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
