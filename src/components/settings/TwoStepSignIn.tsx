/**
 * TwoStepSignIn — turn on two-step sign-in (an authenticator app) for the
 * platform admin account (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 7).
 *
 * Shown only to the admin account (is_platform_admin_account). Once an
 * authenticator is verified, the admin tools answer only to a session that
 * also entered the app's code (is_platform_admin() asks for aal2), and the
 * sign-in page asks for the code after the password (SecondStepForm).
 * Removing it needs that second step first (Supabase Auth refuses to remove a
 * verified factor from an aal1 session), so a borrowed session cannot switch
 * it off.
 */
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Factor = { id: string; status: string; friendly_name?: string | null };
type Enrolling = { factorId: string; qr: string; secret: string };

export function TwoStepSignIn() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactor((data?.totp ?? []).find((f) => f.status === "verified") ?? null);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.rpc("is_platform_admin_account" as never);
      if (cancelled) return;
      setIsAdmin(data === true);
      if (data === true) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAdmin) return null;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      // An unfinished earlier attempt would block a new one: clear it first.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (enrollError || !data) {
        setError("We couldn't start this. Try again in a moment.");
        return;
      }
      setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolling) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code the app shows.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code: digits });
      if (verifyError) {
        setError("That code didn't work. Try the newest one.");
        return;
      }
      setEnrolling(null);
      setCode("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!factor) return;
    setBusy(true);
    setError(null);
    try {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removeError) {
        setError("To turn this off, sign out and sign in again with your code first.");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          Two-step sign-in
        </CardTitle>
        <CardDescription>
          Your account runs the admin tools. With this on, signing in also needs a code from an authenticator app on your phone
          (Google Authenticator, 1Password, Authy and others).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {factor ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">On. You'll be asked for a code each time you sign in.</p>
            <Button variant="outline" onClick={remove} disabled={busy}>
              Turn off
            </Button>
          </div>
        ) : enrolling ? (
          <form onSubmit={confirm} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">Scan this with your authenticator app, then enter the code it shows.</p>
            <img src={enrolling.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-md bg-white p-2" />
            <p className="text-xs text-muted-foreground">
              Can't scan? Enter this key in the app: <code className="select-all break-all">{enrolling.secret}</code>
            </p>
            <div className="space-y-2">
              <Label htmlFor="two-step-code">Code</Label>
              <Input
                id="two-step-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "two-step-error" : undefined}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Turn on"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEnrolling(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={start} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Set up two-step sign-in"}
          </Button>
        )}
        {error && (
          <p id="two-step-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
