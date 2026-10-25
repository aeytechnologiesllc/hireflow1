import { useTheme } from "next-themes";
import { Toaster as Sonner, useSonner } from "sonner";
import "@/styles/toasts.css";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Sonner's own default: how long a notification stays unless the call says otherwise. */
const DEFAULT_MS = 4000;

/**
 * The notifications (2026-10-11, approved by the owner from a mock-up: "the
 * black box becomes a warm card"). Same place, same words; each one sits on
 * the app's raised surface with a soft shadow, an ink check (a soft red
 * mark for an error), "Undo" as an ink word instead of a white slab, and a
 * thin line along the bottom that runs out once, for as long as it stays.
 * The look lives in src/styles/toasts.css, on the app's own color tokens, so
 * it follows the dark and Paper themes.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <ToastTimes />
      <Sonner
        theme={theme as ToasterProps["theme"]}
        position="top-center"
        className="toaster group hf-toaster"
        closeButton
        icons={{
          success: <Mark tone="ok" />,
          error: <Mark tone="crit" />,
          warning: <Mark tone="warn" />,
          info: <Mark tone="info" />,
          loading: <Mark tone="busy" />,
        }}
        toastOptions={{
          classNames: {
            toast: "hf-toast",
            title: "hf-toast-title",
            description: "hf-toast-description",
            actionButton: "hf-toast-action",
            cancelButton: "hf-toast-cancel",
            closeButton: "hf-toast-close",
          },
        }}
        {...props}
      />
    </>
  );
};

/** The round mark at a notification's left, and (for any that leaves on its
 *  own) the line along its bottom, which is drawn from here because Sonner
 *  uses both of the card's own ::before and ::after. */
function Mark({ tone }: { tone: "ok" | "crit" | "warn" | "info" | "busy" }) {
  return (
    <span className="hf-toast-mark" data-tone={tone} aria-hidden="true">
      {tone === "ok" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path className="hf-toast-tick" d="M20 6 9 17l-5-5" />
        </svg>
      ) : tone === "busy" ? (
        <svg className="hf-toast-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : tone === "info" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 11v6" />
          <path d="M12 7h.01" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 7v6" />
          <path d="M12 17h.01" />
        </svg>
      )}
      {tone !== "busy" && <span className="hf-toast-time" />}
    </span>
  );
}

/** Each notification's line runs for that notification's own time: Sonner
 *  numbers the cards on screen (data-index, newest 0), so the times of the
 *  ones that differ from the default are written against those numbers. A
 *  notification that stays until closed has no line. */
function ToastTimes() {
  const { toasts } = useSonner();
  const rules = toasts
    .map((t, index) => {
      const ms = t.duration ?? DEFAULT_MS;
      if (ms === DEFAULT_MS) return null;
      const value = Number.isFinite(ms) && ms > 0 ? `--hf-toast-ms: ${Math.round(ms)}ms;` : "--hf-toast-line: none;";
      return `.hf-toaster [data-sonner-toast][data-index="${index}"] { ${value} }`;
    })
    .filter(Boolean);
  return rules.length > 0 ? <style>{rules.join("\n")}</style> : null;
}

export { Toaster };
