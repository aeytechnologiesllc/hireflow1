/**
 * SecondStepForm — the 6-digit code from an authenticator app, asked after
 * the password when the account has two-step sign-in turned on
 * (src/components/settings/TwoStepSignIn.tsx; docs/LAUNCH-PLAN.md, Phase 1,
 * task 7). Supabase Auth checks the code (mfa.challengeAndVerify) and lifts
 * the session to aal2, which is what is_platform_admin() asks for once the
 * admin has a verified authenticator.
 */
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SecondStepForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.find((f) => f.status === "verified");
      if (listError || !factor) {
        setError("We couldn't find your authenticator. Sign out and sign in again.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: digits });
      if (verifyError) {
        setError("That code didn't work. Check the app and try the newest code.");
        return;
      }
      onDone();
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex items-center gap-2 text-foreground">
        <ShieldCheck className="h-5 w-5" aria-hidden />
        <h2 className="text-lg font-semibold">Two-step sign-in</h2>
      </div>
      <p className="text-sm text-muted-foreground">Open your authenticator app and enter the 6-digit code for HireFlow.</p>
      <div className="space-y-2">
        <Label htmlFor="second-step-code">Code</Label>
        <Input
          id="second-step-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "second-step-error" : undefined}
          autoFocus
        />
        {error && (
          <p id="second-step-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={checking}>
        {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Continue"}
      </Button>
      <button type="button" className="w-full text-sm text-muted-foreground hover:underline" onClick={onCancel}>
        Sign out
      </button>
    </form>
  );
}
