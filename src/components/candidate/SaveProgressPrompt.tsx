import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { GOOGLE_AUTH_ENABLED } from "@/lib/googleAuth";
import { linkGuestApplications } from "@/lib/showcaseApply";

interface SaveProgressPromptProps {
  roleTitle: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  onSkip: () => void;
}

export function SaveProgressPrompt({
  roleTitle,
  applicantName,
  applicantEmail,
  applicantPhone,
  onSkip,
}: SaveProgressPromptProps) {
  const { signInWithGoogle, signUp } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [showSignup, setShowSignup] = useState(false);
  const [emailInput, setEmailInput] = useState(applicantEmail);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    // Absolute: signInWithGoogle feeds this to `new URL`, which throws on a
    // relative path.
    const redirect = `${window.location.origin}/candidate/continue?phone=${encodeURIComponent(applicantPhone)}`;
    const { error } = await signInWithGoogle(redirect, "candidate");
    if (error) {
      toast.error(error.message);
      setGoogleLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSignupLoading(true);
    try {
      const { error, needsConfirmation } = await signUp(emailInput.trim(), password, applicantName, "candidate");
      if (error) throw error;
      if (needsConfirmation) {
        toast.success("Check your email to confirm your account, then sign in to see all your applications.");
      } else {
        const { data } = await import("@/integrations/supabase/client").then((m) => m.supabase.auth.getUser());
        if (data.user) {
          await linkGuestApplications(data.user.id, applicantPhone, emailInput.trim());
        }
        toast.success("Account created — your applications are linked.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg mx-auto">
      <Card className="border-border bg-card overflow-hidden">
        <div className="h-1.5 bg-primary" />
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Application received</h2>
            <p className="text-sm text-muted-foreground">
              Your details for <span className="font-medium text-foreground">{roleTitle}</span> are saved.
              Create an account to track everything in one place — or continue without one.
            </p>
          </div>

          <div className="space-y-3">
            {/* Ungated, this offered Google while the provider is disabled — and
                because the redirect below is RELATIVE, `new URL` threw and the
                candidate got a raw "Failed to construct 'URL': Invalid URL"
                toast at the moment they finished applying. */}
            {GOOGLE_AUTH_ENABLED && (
              <Button type="button" variant="outline" className="w-full h-11" onClick={() => void handleGoogle()} disabled={googleLoading}>
                {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with Google"}
              </Button>
            )}
            <Button type="button" variant="outline" className="w-full h-11" onClick={() => setShowSignup((v) => !v)}>
              {showSignup ? "Hide email signup" : "Create account with email"}
            </Button>
          </div>

          {showSignup && (
            <form onSubmit={(e) => void handleEmailSignup(e)} className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  readOnly={!!applicantEmail}
                  className={applicantEmail ? "bg-muted/40" : undefined}
                  type="email"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="save-password">Password</Label>
                <Input
                  id="save-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={signupLoading}>
                {signupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Returning later? Use{" "}
            <Link to="/candidate/continue" className="text-primary hover:underline">
              Continue your application
            </Link>{" "}
            with your phone number.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="flex-1" onClick={onSkip}>
              Continue
            </Button>
            <Button type="button" variant="ghost" className="flex-1 text-muted-foreground" onClick={onSkip}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
