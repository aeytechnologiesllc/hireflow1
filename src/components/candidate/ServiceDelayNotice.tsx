import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVICE_DELAY_LINE } from "@/lib/serviceDelay";

/**
 * The one calm line a conversation test shows while our side cannot answer
 * (src/lib/serviceDelay.ts), with Try again. Same quiet treatment as the
 * chat practice's "isn't responding" line: muted text and an outline button,
 * no toast, no alert colours. The applicant's text stays in the reply box;
 * Try again does the step that was refused (sends that message, asks again
 * for the reply, or sends the conversation).
 */
export function ServiceDelayNotice({
  onRetry,
  busy = false,
  disabled = false,
}: {
  onRetry: () => void;
  /** The retry is on its way. */
  busy?: boolean;
  /** Nothing to retry yet (the reply box was emptied). */
  disabled?: boolean;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-2 pt-2 text-center">
      <p className="text-sm text-muted-foreground">{SERVICE_DELAY_LINE}</p>
      <Button variant="outline" onClick={onRetry} disabled={busy || disabled} className="gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Try again
      </Button>
    </div>
  );
}
