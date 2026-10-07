import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, Mail, Monitor } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { GlyphCheckSeal } from "@/components/candidate/glyphs";
import { candidateOrigin } from "@/lib/hosts";
import { stepRoute } from "@/lib/journeyProgress";
import { markWaitingOnComputer } from "@/lib/waitingOnComputer";
import {
  EMAIL_LINK_LABEL,
  EMAIL_LINK_SENDING_LABEL,
  EMAIL_LINK_SENT_LABEL,
  continueLinkEmailWords,
  continueLinkHint,
  continueLinkRestSeconds,
  type ContinueLinkEmailOutcome,
} from "@/lib/continueLinkEmail";
import { sendContinueLinkEmail } from "@/lib/sendContinueLinkEmail";

export interface ContinueOnComputerProps {
  applicationId: string;
  /** The gated step, as the journey names it (candidate-safe title). */
  step: { id: string; type: string; title: string };
  /** Where that step sits in the job's journey: "Step X of N". */
  index: number;
  total: number;
  jobTitle?: string | null;
  /** What this device read as, or what the server's refusal named. */
  deviceKind?: "phone" | "tablet" | null;
  /** The step page was open and the server refused one of its calls: the
   *  screen then does not claim that nothing started here. */
  startedHere?: boolean;
}

/** The host part of an origin, for reading out loud ("hireflownow.com"). */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin.replace(/^https?:\/\//, "");
  }
}

/** Copies text, with the old select-and-copy way where the clipboard API is refused (an older phone, an iframe). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* falls through to the old way */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

/**
 * "Continue on your computer" — the one screen a phone or a tablet sees on a
 * step the computer-only rule covers (docs/COMPUTER-ONLY-TESTS.md): the
 * job's connection check and every step after it. CandidateStepGate shows
 * it INSTEAD of the step page, so nothing here starts a test or a timer,
 * opens an attempt or records an integrity event. It reads who is signed in,
 * and makes ONE write, once per step: markWaitingOnComputer stamps the
 * application as waiting on a computer, so the hiring team's list and record
 * say "Waiting to continue on a computer" instead of a step nobody opened.
 *
 * It says, in plain words, where to go and what happens there, and offers
 * this step's own address to copy. Candidate copy: never names any
 * machinery.
 *
 * "Email me the link" (2026-10-07; the owner: "make it a little bit easy if
 * there is a way"): one press sends the link to the address they are signed
 * in with, so it is waiting in their inbox when they sit down at the
 * computer. The page sends only the application's id; who it goes to, how
 * often, and every word of it are the server's (the one call is
 * src/lib/sendContinueLinkEmail.ts; docs/COMPUTER-ONLY-TESTS.md, "Email me
 * the link"). Like everything else here it starts no test and no timer,
 * opens no attempt and records no integrity event. Copy link stays, for a
 * message to themself instead.
 *
 * Where to go is `<site>/applications`, the one address that is true for
 * every applicant: signed out, it asks them to sign in and comes back; on a
 * computer, the applications page opens the one step waiting for a computer
 * (stepWaitingOnComputer, src/lib/resumeOnComputer.ts). The bare site is not
 * named: with one open role it opens that role's page, and Apply there
 * leads to the application's overview, or to a new application for the
 * wrong job. Nor is the job's own link, for the same reason, and because a
 * job that has closed to new applicants answers "not open".
 */
export function ContinueOnComputer({ applicationId, step, index, total, jobTitle, deviceKind, startedHere }: ContinueOnComputerProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const resetRef = useRef<number | null>(null);
  // "Email me the link": being sent, what came of it, and the button resting
  // after one went (the server allows one every few minutes).
  const [emailing, setEmailing] = useState(false);
  const [emailOutcome, setEmailOutcome] = useState<ContinueLinkEmailOutcome | null>(null);
  const [emailResting, setEmailResting] = useState(false);
  const restRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
      if (restRef.current !== null) window.clearTimeout(restRef.current);
    };
  }, []);

  const origin = candidateOrigin();
  const siteName = hostOf(origin);
  const applicationsAddress = `${siteName}/applications`;
  const route = stepRoute(applicationId, step) ?? `/applications/${applicationId}`;
  const stepLink = `${origin}${route}`;
  const email = user?.email?.trim() || null;
  const device = deviceKind === "tablet" ? "tablet" : "phone";
  const progressPct = Math.round(((index + 1) / Math.max(total, 1)) * 100);

  // The screen is showing: tell the hiring team, once for this step (the
  // server keeps the first stamp and opens no attempt).
  useEffect(() => {
    void markWaitingOnComputer(applicationId, step.id, device);
  }, [applicationId, step.id, device]);

  const copyLink = async () => {
    const ok = await copyText(stepLink);
    setCopied(ok ? "yes" : "failed");
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setCopied(null), 4000);
  };

  // One press, one email, to the address they are signed in with. The button
  // rests afterwards for as long as the server would refuse another.
  const emailLink = async () => {
    if (emailing || emailResting) return;
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    setCopied(null);
    setEmailing(true);
    const outcome = await sendContinueLinkEmail(applicationId);
    if (!aliveRef.current) return;
    setEmailing(false);
    setEmailOutcome(outcome);
    const rest = continueLinkRestSeconds(outcome);
    if (rest > 0) {
      setEmailResting(true);
      if (restRef.current !== null) window.clearTimeout(restRef.current);
      restRef.current = window.setTimeout(() => setEmailResting(false), rest * 1000);
    }
  };
  const emailSent = emailResting && emailOutcome?.kind === "sent";

  // One line under the buttons: what the last press did, or what they do.
  let status: ReactNode;
  if (copied === "failed") {
    status = (
      <>
        Couldn't copy it here. This step's link is{" "}
        <span className="select-all break-all font-mono text-[0.7rem] text-foreground/80">{stepLink}</span>
      </>
    );
  } else if (copied === "yes") {
    status = "Copied. Send it to yourself in an email or a message, then open it on your computer.";
  } else if (emailing && email) {
    status = `Sending it to ${email}…`;
  } else if (emailOutcome) {
    status = continueLinkEmailWords(emailOutcome, email);
  } else {
    status = email ? continueLinkHint(email) : "Copies this step's link, to send to yourself in an email or a message.";
  }

  return (
    <div className="ck-page mx-auto max-w-3xl space-y-6" data-testid="continue-on-computer">
      <header className="ck-reveal space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/applications/${applicationId}`)}
            aria-label="Back to application overview"
            className="shrink-0 text-muted-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">{jobTitle || "This role"}</p>
        </div>

        <div className="space-y-2.5">
          <h1 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">Continue on your computer</h1>

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{index + 1}</span> of <span className="ck-num">{total}</span> — {step.title}
          </span>

          <Progress value={progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">Your place is kept. Pick up on your computer whenever you're ready.</p>
        </div>
      </header>

      <Card className="relative overflow-hidden border-border bg-card">
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brass-line)" }} aria-hidden="true" />
        <CardContent className="space-y-6 p-5 pt-7 sm:p-8">
          {/* Icon above the words on a phone, beside them on a wider screen: a
              narrow column left beside the icon broke the heading into three lines. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--jade-soft)] text-[var(--jade-soft-fg)] sm:h-11 sm:w-11"
              aria-hidden="true"
            >
              <Monitor className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <h2 className="font-display text-lg leading-snug text-foreground sm:text-xl">
                This part needs the computer you'll work on
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                It's done on the computer you'd use for this job, so the team sees how you really work. It can't be
                taken on a {device}.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/30 p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On that computer</p>
            <ol className="mt-3 space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="ck-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                  1
                </span>
                <span className="min-w-0 pt-0.5 [overflow-wrap:anywhere]">
                  Go to <strong className="font-semibold">{applicationsAddress}</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="ck-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                  2
                </span>
                <span className="min-w-0 pt-0.5 [overflow-wrap:anywhere]">
                  {email ? (
                    <>
                      Sign in with the same email, <strong className="font-semibold">{email}</strong>.
                    </>
                  ) : (
                    "Sign in with the same email you used here."
                  )}
                </span>
              </li>
              <li className="flex gap-3">
                <span className="ck-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                  3
                </span>
                <span className="min-w-0 pt-0.5">You'll be taken straight to this step.</span>
              </li>
            </ol>
          </div>

          <div className="flex items-start gap-3">
            <GlyphCheckSeal size={22} className="mt-px shrink-0 text-[var(--jade)]" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {startedHere
                ? "Your answers so far are saved."
                : "Your answers so far are saved. Nothing has started here: no test and no timer."}
            </p>
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            {/* The two ways to take the link away first in reading order (the
                email, then the copy); on a wide screen they sit on the right.
                Without an address to send to, Copy link is the one action. */}
            <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
                {email && (
                  <Button onClick={emailLink} size="lg" disabled={emailing || emailResting} className="w-full gap-2 sm:w-auto" data-testid="email-me-the-link">
                    {emailSent ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    {emailing ? EMAIL_LINK_SENDING_LABEL : emailSent ? EMAIL_LINK_SENT_LABEL : EMAIL_LINK_LABEL}
                  </Button>
                )}
                <Button onClick={copyLink} size="lg" variant={email ? "outline" : "default"} className="w-full gap-2 sm:w-auto">
                  {copied === "yes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "yes" ? "Link copied" : "Copy link"}
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate(`/applications/${applicationId}`)}
                className="min-h-[44px] w-full gap-2 sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to your application
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere] sm:text-right" aria-live="polite" data-testid="continue-link-status">
              {status}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
