import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWebPush } from "@/hooks/useWebPush";
import { afterAnswered, afterNotNow, canOffer, promptPageOk, readMemory, writeMemory } from "./pushPromptState";
import "./push.css";

/**
 * The first way to turn phone notifications on (2026-10-21; the second is the
 * row in Settings): one small card after sign-in, in the hiring side's shell
 * and the team member's. See pushPromptState.ts for what it remembers and
 * docs/PUSH-NOTIFICATIONS.md.
 *
 * It waits for a quiet moment like the guided tips do: not while a dialog is
 * open, not during a first-run welcome (the dashboard's "Your first hire" guide), not
 * while a tip is showing, not while someone is typing, and not on the first
 * few seconds after the app opens.
 */

const FIRST_WAIT_MS = 6000;

function someoneTyping(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  if (a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT") return true;
  return a.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "reset"].includes((a as HTMLInputElement).type);
}

/**
 * Anything already asking for their attention: a dialog, a guided tip, or the
 * dashboard's first-run welcome (the "Your first hire" guide, which has its
 * own "Know when they apply" step, and the first-steps card before it).
 */
function somethingElseOpen(): boolean {
  return !!document.querySelector('[role="dialog"]:not([data-push-prompt]), [role="alertdialog"], [data-first-steps], [data-first-hire], [data-guided-tip]');
}

export function PushPrompt() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const push = useWebPush();
  const userId = user?.id ?? null;
  const [shown, setShown] = useState(false);
  const openedAt = useRef(Date.now());

  const wantsToShow = !!userId && (push.status === "off" || push.status === "needs-home-screen") && promptPageOk(pathname);

  // Wait for the moment: nothing else asking, nobody typing, two looks in a row.
  useEffect(() => {
    if (!wantsToShow || !userId) {
      setShown(false);
      return;
    }
    let steady = 0;
    const look = () => {
      const memory = readMemory(window.localStorage, userId);
      const quiet =
        canOffer(memory, Date.now()) &&
        Date.now() - openedAt.current >= FIRST_WAIT_MS &&
        document.visibilityState === "visible" &&
        !somethingElseOpen() &&
        !someoneTyping();
      steady = quiet ? steady + 1 : 0;
      if (!quiet) setShown(false);
      else if (steady >= 2) setShown(true);
    };
    const timer = window.setInterval(look, 1000);
    return () => window.clearInterval(timer);
  }, [wantsToShow, userId]);

  const answer = useCallback(
    (how: "not-now" | "answered") => {
      if (!userId) return;
      const memory = readMemory(window.localStorage, userId);
      writeMemory(window.localStorage, userId, how === "not-now" ? afterNotNow(memory, Date.now()) : afterAnswered(memory));
      setShown(false);
    },
    [userId],
  );

  const turnOn = async () => {
    const result = await push.turnOn();
    if (result.ok) {
      answer("answered");
      toast.success("Notifications are on");
    } else if (result.reason === "denied") {
      // The phone's own box (or an earlier choice) said no: it is answered. Settings shows how to change it.
      answer("answered");
    } else {
      toast.error("Couldn't turn notifications on. Please try again.");
    }
  };

  // Escape is "Not now", unless they're typing or something else is open.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !someoneTyping() && !document.querySelector('[role="dialog"]:not([data-push-prompt]), [role="alertdialog"]')) answer("not-now");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, answer]);

  if (!shown || !wantsToShow) return null;
  const needsHomeScreen = push.status === "needs-home-screen";

  return createPortal(
    <div className="ck-push" role="dialog" aria-modal="false" aria-labelledby="ck-push-title" aria-describedby="ck-push-body" data-push-prompt={needsHomeScreen ? "home-screen" : "turn-on"}>
      <div className="ck-push__head">
        <span className="ck-push__bell" aria-hidden>
          <Bell className="h-[17px] w-[17px]" />
        </span>
        <div className="min-w-0">
          <h4 id="ck-push-title" className="ck-push__title">
            Know the moment someone applies
          </h4>
        </div>
      </div>
      <p id="ck-push-body" className="ck-push__body">
        {needsHomeScreen
          ? "On iPhone, add HireFlow to your Home Screen first: tap Share, then Add to Home Screen, then open HireFlow from there."
          : "Turn on notifications and HireFlow tells you when someone applies, finishes their tests or replies."}
      </p>
      {!needsHomeScreen && (
        <div className="ck-push__sample" aria-hidden>
          <img src="/icon-192.png?v=6" alt="" width={28} height={28} />
          <div className="min-w-0">
            <b>New applicant</b>
            <span>Alex just finished the typing test.</span>
          </div>
        </div>
      )}
      <div className="ck-push__row">
        {needsHomeScreen ? (
          <button type="button" className="ck-btn ck-btn-primary" onClick={() => answer("answered")} data-push-got-it>
            Got it
          </button>
        ) : (
          <>
            <button type="button" className="ck-btn ck-btn-ghost" onClick={() => answer("not-now")} disabled={push.busy} data-push-not-now>
              Not now
            </button>
            <button type="button" className="ck-btn ck-btn-primary" onClick={() => void turnOn()} disabled={push.busy} data-push-turn-on>
              Turn on notifications
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
