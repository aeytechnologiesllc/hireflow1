import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWebPush, type PushUiStatus } from "@/hooks/useWebPush";

/**
 * "Notifications on this device" (Settings; 2026-10-21, docs/PUSH-NOTIFICATIONS.md).
 *
 * The second way to turn phone notifications on, for anyone who missed the
 * first-time card: the status in plain words, and the one button that fits it
 * ("Turn on", or "Send a test" with a small "Turn off"). Used in the hiring
 * side's Notifications card and in the applicant's Settings.
 */

type Audience = "staff" | "applicant";

const WORDS: Record<Audience, { on: string; off: string }> = {
  staff: {
    on: "You'll get a notification here when someone applies, finishes their tests or replies.",
    off: "Turn on to know the moment someone applies.",
  },
  applicant: {
    on: "You'll get a notification here when a business writes to you or updates your application.",
    off: "Turn on to hear back the moment a business writes to you.",
  },
};

function onTouchDevice(): boolean {
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

function describe(status: PushUiStatus, audience: Audience): { word: string; detail: string; tone: "on" | "off" | "warn" } {
  switch (status) {
    case "on":
      return { word: "On", detail: WORDS[audience].on, tone: "on" };
    case "off":
      return { word: "Off", detail: WORDS[audience].off, tone: "off" };
    case "blocked":
      return {
        word: "Blocked",
        detail: onTouchDevice() ? "Turn them on for HireFlow in your phone's Settings." : "Turn them on for HireFlow in your browser's site settings.",
        tone: "warn",
      };
    case "needs-home-screen":
      return { word: "Add HireFlow to your Home Screen first", detail: "Tap Share, then Add to Home Screen, then open HireFlow from there.", tone: "warn" };
    case "unsupported":
      return { word: "This browser can't show notifications", detail: "", tone: "off" };
    default:
      return { word: "Checking…", detail: "", tone: "off" };
  }
}

const DOT: Record<"on" | "off" | "warn", string> = {
  on: "var(--action)",
  off: "var(--hf-text-muted)",
  warn: "var(--brass)",
};

export function DeviceNotifications({ audience }: { audience: Audience }) {
  const push = useWebPush();
  const { word, detail, tone } = describe(push.status, audience);

  const onTurnOn = async () => {
    const result = await push.turnOn();
    if (result.ok) toast.success("Notifications are on");
    else if (result.reason === "denied") toast.error(onTouchDevice() ? "Notifications are blocked. Turn them on for HireFlow in your phone's Settings." : "Notifications are blocked. Turn them on for HireFlow in your browser's site settings.");
    else toast.error("Couldn't turn notifications on. Please try again.");
  };

  const onTest = async () => {
    try {
      const reached = await push.sendTest();
      if (reached > 0) toast.success(`Sent to ${reached} ${reached === 1 ? "device" : "devices"}. Look for it on your phone.`);
      else toast.error("It didn't reach any device. Try turning notifications off and on again.");
    } catch {
      toast.error("Couldn't send the test. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-device-notifications data-push-status={push.status}>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">Notifications on this device</p>
        <p className="mt-0.5 flex items-start gap-2 text-sm text-foreground">
          <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[tone] }} />
          <span>{word}</span>
        </p>
        {detail && <p className="mt-0.5 pl-4 text-sm text-muted-foreground">{detail}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-4 sm:pl-0">
        {push.status === "off" && (
          <Button onClick={() => void onTurnOn()} disabled={push.busy} data-push-turn-on>
            {push.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            Turn on
          </Button>
        )}
        {push.status === "on" && (
          <>
            <Button variant="outline" onClick={() => void onTest()} disabled={push.busy} data-push-test>
              {push.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Send a test
            </Button>
            {!push.native && (
              <Button variant="ghost" onClick={() => void push.turnOff()} disabled={push.busy} className="text-muted-foreground" data-push-turn-off>
                Turn off
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
