import { useId } from "react";
import { AppWindow, Camera, ClipboardX, PauseCircle, RotateCw, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * The rules an applicant agrees to right before every timed test — the skills
 * check, the typing test, the player chat practice, the written interview and
 * the sales conversation. One component so the five tests can never word it
 * five ways.
 *
 * The owner's words: copy and paste are off; don't switch screens; every
 * switch is recorded and the hiring team is told. Screenshots are honest:
 * a browser cannot stop one, so the card says attempts "can be detected",
 * never that they are blocked. Start stays disabled until the box is ticked;
 * the page passes `accepted` to its Start button.
 *
 * Wave 1 shipped a one-line `TestRulesNotice` above each Start button; this
 * replaces it (useTestIntegrity is what makes each line true).
 */
export function TestRulesCard({
  accepted,
  onAcceptedChange,
  className,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  className?: string;
}) {
  const headingId = useId();
  const checkboxId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("space-y-3 rounded-lg border border-warning/25 bg-warning/[0.07] p-4 text-left sm:p-5", className)}
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <h3 id={headingId} className="font-display text-base text-foreground">
          Before you start: test rules
        </h3>
      </div>

      <ul className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
        <li className="flex items-start gap-2.5">
          <ClipboardX className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-foreground">Copy and paste are turned off.</strong> Type every
            answer yourself.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <AppWindow className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-foreground">Stay on this screen until you finish.</strong> Don't
            switch to another tab, window or app. Every switch is recorded with how long you were away, and the
            hiring team is told right away.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Camera className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-foreground">No screenshots or screen recording.</strong> Screenshot
            attempts can be detected, and the hiring team is told.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>Closing or reloading this page during the test is recorded too.</span>
        </li>
      </ul>

      <label
        htmlFor={checkboxId}
        className={cn(
          "flex min-h-[48px] cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors",
          accepted ? "border-primary/40 bg-primary/5" : "border-border bg-background/70",
        )}
      >
        <Checkbox
          id={checkboxId}
          checked={accepted}
          onCheckedChange={(value) => onAcceptedChange(value === true)}
          className="mt-0.5 h-5 w-5"
        />
        <span className="text-sm font-medium leading-snug text-foreground">
          I understand. I'll stay on this screen and type my own answers.
        </span>
      </label>
    </section>
  );
}

/**
 * The quiet strip shown while a test runs, in place of "N things flagged
 * during this session": what is on, and what has been recorded so far.
 */
export function TestRulesReminder({ recorded, className }: { recorded: number; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning",
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Copy and paste are off. Leaving this screen is recorded
        {recorded > 0 ? (
          <>
            {" "}
            — <span className="ck-num font-semibold">{recorded}</span> recorded so far.
          </>
        ) : (
          "."
        )}
      </span>
    </div>
  );
}

/**
 * Covers the test while focus is somewhere else but the page is still on
 * screen (a second window, split screen): the content is not readable from
 * the other window. Disappears the moment they click back.
 */
export function TestPausedOverlay({
  show,
  title = "Paused",
  body = "You're in another window — click back anywhere to carry on. Leaving the test is recorded.",
}: {
  show: boolean;
  title?: string;
  body?: string;
}) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-6 backdrop-blur-xl">
      <div className="max-w-sm p-8 text-center">
        <PauseCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-display mb-2 text-xl text-foreground">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/**
 * "End now — we'll send what you have": the confirm every conversation test
 * shows when the applicant ends before the usual number of replies. The End
 * button used to stay hidden until then, so the only way out was asking the
 * interviewer to stop (the owner, 2026-10-05: "can we cancel this
 * interview"). An in-page dialog, not window.confirm: a native dialog takes
 * focus from the window and would be recorded as leaving the test.
 */
export function EndEarlyDialog({
  open,
  onOpenChange,
  what,
  answered,
  usual,
  unit = "replies",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "conversation", "interview", "meeting". */
  what: string;
  answered: number;
  usual: number;
  unit?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>End the {what} now?</AlertDialogTitle>
          <AlertDialogDescription>
            We'll send what you have so far — <span className="ck-num">{answered}</span> of the usual{" "}
            <span className="ck-num">{usual}</span> {unit}. You can't come back to it afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>End now — send what I have</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
