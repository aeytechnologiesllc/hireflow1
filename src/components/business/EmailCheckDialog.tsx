/**
 * EmailCheckDialog — "Confirm your email", shown at a business's first
 * Publish (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 4). The words and
 * the reading of every answer are in src/lib/emailCheck.ts; the calls in
 * src/lib/emailCheckApi.ts. On a confirmed code it calls onConfirmed, and the
 * page carries on with the publish it was doing.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMAIL_CHECK_WORDS as W, cleanCode } from "@/lib/emailCheck";
import { sendBusinessEmailCode, verifyBusinessEmailCode } from "@/lib/emailCheckApi";

export function EmailCheckDialog({
  open,
  onOpenChange,
  email,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sign-in address, shown so they know where to look. */
  email: string | null | undefined;
  onConfirmed: () => void;
}) {
  const [sentOnce, setSentOnce] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSentOnce(false);
      setCode("");
      setNote(null);
      setProblem(null);
    }
  }, [open]);

  useEffect(() => {
    if (waitUntil == null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [waitUntil]);

  const waitLeft = waitUntil != null ? Math.max(0, Math.ceil((waitUntil - now) / 1000)) : 0;

  const send = async () => {
    setSending(true);
    setProblem(null);
    const outcome = await sendBusinessEmailCode();
    setSending(false);
    if (outcome.kind === "already") {
      onConfirmed();
      return;
    }
    if (outcome.kind === "sent") {
      setSentOnce(true);
      setNote(W.sent(email));
      setWaitUntil(Date.now() + 60_000);
      setNow(Date.now());
      window.setTimeout(() => codeRef.current?.focus(), 0);
      return;
    }
    if (outcome.kind === "wait") {
      setSentOnce(true);
      setWaitUntil(Date.now() + outcome.seconds * 1000);
      setNow(Date.now());
    }
    setProblem(outcome.message);
  };

  const confirm = async () => {
    const six = cleanCode(code);
    if (six.length !== 6) {
      setProblem("Enter the 6 digits from the email.");
      return;
    }
    setChecking(true);
    setProblem(null);
    const outcome = await verifyBusinessEmailCode(six);
    setChecking(false);
    if (outcome.kind === "confirmed") {
      setNote(W.done);
      onConfirmed();
      return;
    }
    if (outcome.kind === "expired") setCode("");
    setProblem(outcome.message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{W.title}</DialogTitle>
          <DialogDescription>{W.intro(email)}</DialogDescription>
        </DialogHeader>

        {!sentOnce ? (
          <Button onClick={send} disabled={sending} className="w-full">
            {sending ? W.sending : W.send}
          </Button>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
            <label className="block text-sm font-medium" htmlFor="email-check-code">
              {W.codeLabel}
            </label>
            <Input
              id="email-check-code"
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="text-center text-lg tracking-[0.4em]"
            />
            <Button type="submit" disabled={checking || cleanCode(code).length !== 6} className="w-full">
              {checking ? W.confirming : W.confirm}
            </Button>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{W.spam}</span>
              <Button type="button" variant="ghost" size="sm" onClick={send} disabled={sending || waitLeft > 0}>
                {waitLeft > 0 ? W.resendIn(waitLeft) : W.resend}
              </Button>
            </div>
          </form>
        )}

        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
