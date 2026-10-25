import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Check, Circle, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import { resolvePostAuthDestination } from "@/lib/authRouting";
import { getPasswordErrorMessage } from "@/lib/authErrorMessages";
import { Wordmark } from "@/cockpit/components/Wordmark";
import { HeroBackground } from "@/components/ava/HeroBackground";
import { useIsMobile } from "@/hooks/use-mobile";
import { GOOGLE_AUTH_ENABLED } from "@/lib/googleAuth";
import { candidateOrigin, isStaffHost } from "@/lib/hosts";
import { cleanAddress } from "@/components/business/CareersPageCard";
import { SecondStepForm } from "@/components/auth/SecondStepForm";
import { needsSecondStep } from "@/lib/secondStep";
import { useNightWhileOpen } from "@/hooks/useNightWhileOpen";

// Google OAuth isn't enabled on the Supabase backend yet (authorize endpoint
// returns 400) — keep the UI hidden until credentials exist. Flip

// Detect if running inside a WebView (Natively or generic)
const isWebView = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Natively\//.test(ua)) return true;
  if (/wv/i.test(ua)) return true;
  if (/Android/.test(ua) && /Version\/[\d.]+/.test(ua) && !/Chrome\/[\d.]+ Mobile Safari/i.test(ua)) return true;
  return false;
};


// No TLD allowlist. There are well over a thousand valid top-level domains and
// the set grows every year, so any hand-written list is a list of people who
// cannot create an account. This one held 33 entries and omitted, among many
// others, .pk — while the product was live with a "Remote, Pakistan" posting,
// meaning the exact candidates that job was written for were turned away at the
// email field. Zod's .email() already rejects malformed addresses; catching a
// mistyped TLD is not worth refusing real ones, and if we ever want that it
// belongs in a "did you mean?" hint, never a hard block.
const emailSchema = z.string().email("Please enter a valid email address");
// New passwords: at least 8 characters (2026-10-25; docs/LAUNCH-PLAN.md,
// Phase 1, task 7). Signing in only asks for one: an older account may still
// have a shorter password, and the server is the judge of whether it is right.
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");
const signInPasswordSchema = z.string().min(1, "Enter your password");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

/** The careers address a business name would make (as slugify_business does),
 *  shown while they type (slugify_business makes the same). The real one
 *  can get a number if it is taken. */
function careersAddressPreview(name: string): string {
  const address = cleanAddress(name).replace(/-+$/, "");
  // A name with no letters the address can use (Chinese, Arabic, only
  // symbols) makes an empty address, and business_page_for then gives
  // "business": show that, rather than no line at all. Nothing typed, no line.
  if (!address) return name.trim() ? "business" : "";
  // The addresses kept for HireFlow, as business_page_for makes them.
  if (address === "hireflow") return "business";
  if (["admin", "help", "support", "staff", "official", "careers", "jobs", "team", "api", "www"].includes(address)) return `${address}-jobs`;
  return address.length === 1 ? `${address}-jobs` : address;
}

// Real-time password requirements component
const PasswordRequirements = ({ password }: { password: string }) => {
  const requirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a letter", met: /[a-zA-Z]/.test(password) },
    { label: "Contains a number", met: /\d/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {requirements.map((req, i) => (
        <div key={i} className="flex items-center gap-2 text-xs transition-all duration-200">
          {req.met ? (
            <Check className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={req.met ? "text-primary" : "text-muted-foreground"}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function Auth() {
  // The bridge from the dark front page stays dark; the app after it follows the device.
  useNightWhileOpen();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, signInWithGoogle, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const inWebView = isWebView();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const formRef = useRef<HTMLDivElement>(null);
  const redirectingRef = useRef(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  // Two-step sign-in: the password was right and the account has an
  // authenticator; the 6-digit code comes next (SecondStepForm).
  const [secondStep, setSecondStepState] = useState(false);
  // Mirrored in a ref so a routing pass that starts while the code form is
  // open (a token refresh changes `user`) leaves it alone instead of
  // flashing the loading screen and losing what was typed.
  const secondStepRef = useRef(false);
  const setSecondStep = useCallback((open: boolean) => {
    secondStepRef.current = open;
    setSecondStepState(open);
  }, []);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Password reset state
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isWaitingForSession, setIsWaitingForSession] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Sign In state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  // A business can make its account here (the 2026-10-11 mock-ups, #1).
  // ?mode=signup opens on it: the front page's "Post your first job free".
  const [authMode, setAuthMode] = useState<"signin" | "signup">(() => (searchParams.get("mode") === "signup" ? "signup" : "signin"));
  // The tab says what this page is for, never "Staff" (docs/LAUNCH-PLAN.md,
  // Phase 3, task 4): a business arriving from the front page is not staff yet.
  useEffect(() => {
    const before = document.title;
    document.title = authMode === "signup" ? "Start hiring · HireFlow" : "Sign in · HireFlow";
    return () => {
      document.title = before;
    };
  }, [authMode]);
  const [signUpName, setSignUpName] = useState("");
  const [signUpCompany, setSignUpCompany] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [signUpAgreed, setSignUpAgreed] = useState(false);

  // Sign Up state

  // Check for redirect parameter (e.g., from guest job creation)
  const redirectTo = searchParams.get("redirect");


  // Scroll submit button into view when keyboard opens on mobile
  const scrollFormIntoView = useCallback(() => {
    setTimeout(() => {
      const submitBtn = formRef.current?.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 300);
  }, []);

  // Reset Google loading state when user returns from OAuth redirect
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isGoogleLoading) {
        // Give a moment for auth state to settle, then reset
        setTimeout(() => setIsGoogleLoading(false), 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isGoogleLoading]);

  // Detect password reset mode. Supabase strips the ?reset=true query while it
  // consumes the recovery hash, so we also rely on a flag captured from the hash
  // at page load (see index.html) and the hash itself.
  useEffect(() => {
    const isResetMode =
      searchParams.get("reset") === "true" ||
      (window as Window & { __HF_PASSWORD_RECOVERY?: boolean }).__HF_PASSWORD_RECOVERY === true ||
      /[#&]type=recovery/.test(window.location.hash);

    if (!isResetMode) return;

    // Hold the screen and let the authenticated-redirect effect know we're
    // recovering, so it never bounces us to the dashboard.
    setIsWaitingForSession(true);

    // Depending on timing Supabase may emit PASSWORD_RECOVERY, SIGNED_IN, or
    // INITIAL_SESSION — treat any session during recovery as reset mode.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        setIsWaitingForSession(false);
        setIsResettingPassword(true);
      }
    });

    // In case the event fired before this listener was attached.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsWaitingForSession(false);
        setIsResettingPassword(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [searchParams]);

  const routeAuthenticatedUser = useCallback(async () => {
    if (redirectingRef.current || secondStepRef.current) return;

    redirectingRef.current = true;
    setIsRedirecting(true);

    let navigated = false;

    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        return;
      }

      // The second step before anything opens (docs/LAUNCH-PLAN.md, Phase 1, task 7).
      if (await needsSecondStep()) {
        setSecondStep(true);
        return;
      }

      const { role: signedInRole, route } = await resolvePostAuthDestination({
        userId: currentUser.id,
        portalRole: "employer",
        redirectTo,
      });

      // An applicant who signed in here (the front page's "Sign in" is the
      // business door): their applications live on the applicants' site,
      // where sign-in is kept apart, so going on from here meant signing in
      // twice. Send them to their own sign-in, once.
      if (signedInRole === "candidate" && isStaffHost()) {
        navigated = true;
        await supabase.auth.signOut();
        window.location.replace(`${candidateOrigin()}/candidate/auth?redirect=${encodeURIComponent("/applications")}`);
        return;
      }

      navigated = true;
      navigate(route, { replace: true });
    } catch (error) {
      console.error("Error resolving employer auth destination:", error);
      toast({
        variant: "warning",
        title: "Unable to finish sign in",
        description: "We couldn't determine where to send your account. Please try again.",
      });
    } finally {
      if (!navigated) {
        redirectingRef.current = false;
        setIsRedirecting(false);
      }
    }
  }, [navigate, redirectTo, toast, setSecondStep]);

  useEffect(() => {
    const inRecovery =
      (window as Window & { __HF_PASSWORD_RECOVERY?: boolean }).__HF_PASSWORD_RECOVERY === true ||
      /[#&]type=recovery/.test(window.location.hash) ||
      searchParams.get("reset") === "true";

    if (user && !authLoading && !isResettingPassword && !isWaitingForSession && !inRecovery) {
      void routeAuthenticatedUser();
    }
  }, [user, authLoading, isResettingPassword, isWaitingForSession, routeAuthenticatedUser, searchParams]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      emailSchema.parse(signInEmail);
      signInPasswordSchema.parse(signInPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "warning",
          description: err.issues[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    const { error } = await signIn(signInEmail, signInPassword);

    if (error) {
      const isBadCreds = /invalid login credentials/i.test(error.message);

      if (isBadCreds) {
        // Deliberately the same answer whether the email has an account or not.
        // Telling them apart turns this form into a way to discover who holds a
        // HireFlow account.
        toast({
          variant: "warning",
          title: "Sign In Failed",
          description: "Invalid email or password. Please try again, or use \u201cForgot password?\u201d to reset it.",
        });
      } else if (/email not confirmed/i.test(error.message)) {
        toast({
          variant: "warning",
          title: "Confirm your email",
          description: "Please confirm your email address, then sign in. Check your inbox for the link.",
        });
      } else if (/failed to fetch|load failed|networkerror|network error/i.test(error.message)) {
        toast({
          variant: "warning",
          title: "Can't reach the server",
          description: "Your sign-in request was blocked before it left your device — usually an ad/privacy blocker, VPN, or network firewall. Turn off shields/VPN for this site (or try an incognito window or another network), then try again. Your account is fine.",
        });
      } else {
        toast({
          variant: "warning",
          title: "Sign In Failed",
          description: error.message,
        });
      }
    } else {
      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
        duration: 1500,
      });
      await routeAuthenticatedUser();
    }

    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      nameSchema.parse(signUpName.trim());
      z.string().trim().min(2, "Add your business name").parse(signUpCompany);
      emailSchema.parse(signUpEmail.trim());
      passwordSchema.parse(signUpPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({ variant: "warning", description: err.issues[0].message });
        return;
      }
    }
    if (!signUpAgreed) {
      toast({ variant: "warning", description: "Please agree to the Terms first." });
      return;
    }
    setIsLoading(true);
    // HireFlow's own name, or another business's, can't be used (applicant
    // emails are signed with it; the database refuses it too). Asked first so
    // the answer is plain. A failed check lets the database decide.
    const { data: nameTaken } = await supabase.rpc("business_name_taken" as never, { p_name: signUpCompany.trim() } as never);
    if (nameTaken === true) {
      setIsLoading(false);
      toast({ variant: "warning", title: "That business name is taken", description: "Another business on HireFlow uses it, or it's kept for HireFlow. Add something to tell yours apart." });
      return;
    }
    const { error, needsConfirmation } = await signUp(signUpEmail.trim(), signUpPassword, signUpName.trim(), "employer", signUpCompany.trim());
    setIsLoading(false);
    if (error) {
      if (/already registered|already exists|already been registered/i.test(error.message)) {
        toast({ variant: "warning", title: "This email already has an account", description: "Sign in instead, or use another email for your business." });
        setSignInEmail(signUpEmail.trim());
        setAuthMode("signin");
        return;
      }
      toast({ variant: "warning", title: "Couldn't create the account", description: error.message });
      return;
    }
    if (needsConfirmation) {
      toast({ title: "Check your email", description: "We sent you a link. Open it to finish making your account." });
      return;
    }
    toast({ title: `Welcome to HireFlow, ${signUpName.trim().split(/\s+/)[0]}!`, duration: 1800 });
    await routeAuthenticatedUser();
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      emailSchema.parse(forgotPasswordEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "warning",
          description: err.issues[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    const redirectUrl = `${window.location.origin}/auth?reset=true`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo: redirectUrl,
    });

    if (error) {
      toast({
        variant: "warning",
        title: "Reset Failed",
        description: error.message,
      });
    } else {
      setResetEmailSent(true);
      toast({
        title: "Check your email",
        description: "We've sent you a password reset link.",
      });
    }

    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    // Role is passed via /auth/callback route; redirect URL is handled there
    const { error } = await signInWithGoogle(undefined, "employer");
    
    if (error) {
      toast({
        variant: "warning",
        title: "Google Sign In Failed",
        description: error.message,
      });
      setIsGoogleLoading(false);
    }
    // Note: on success, the page will redirect to Google, so no need to handle success state
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validate passwords
    try {
      passwordSchema.parse(newPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "warning",
          description: err.issues[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "warning",
        description: "Passwords do not match",
      });
      setIsLoading(false);
      return;
    }

    // An account with two-step sign-in may need its code before Supabase
    // Auth saves a new password: ask for it first, then come back here.
    if (await needsSecondStep()) {
      setSecondStep(true);
      setIsLoading(false);
      toast({ description: "Enter the code from your authenticator app, then save your new password." });
      return;
    }

    // Verify we have a valid session before attempting password update
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({
        variant: "warning",
        title: "Session Expired",
        description: "Your reset link may have expired. Please request a new password reset.",
      });
      setIsLoading(false);
      setIsResettingPassword(false);
      setShowForgotPassword(true);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({
        variant: "warning",
        title: "Password Reset Failed",
        description: getPasswordErrorMessage(error) ?? error.message,
      });
    } else {
      toast({
        title: "Password updated!",
        description: "Your password has been successfully reset.",
      });
      setIsResettingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      await routeAuthenticatedUser();
    }

    setIsLoading(false);
  };

  if (authLoading || isWaitingForSession || isRedirecting) {
    return <AuthLoadingScreen variant="employer" />;
  }

  return (
    <div
      className="auth-theme scroll-perf relative min-h-[100dvh] overflow-y-auto overflow-x-hidden"
      style={{ background: "var(--hf-bg)", color: "var(--hf-text)" }}
    >
      <style>{`
        /* This page used to carry its own copy of the whole token set, pinned to
           the old dark green and forced into .dark, so it ignored the theme
           entirely. It now inherits the app's tokens like every other surface;
           only the things that are genuinely local to it live here. */
        .auth-theme h1,.auth-theme h2{font-family:'Fraunces',Georgia,serif;font-weight:500;letter-spacing:-0.01em;}
        .auth-theme .auth-card{border-color:var(--hf-border);background:var(--hf-surface);}
        /* Letterhead field: the paper itself, not a raised chip — filled with
           the same ground as the page, a hairline border, gold on focus. */
        .auth-theme input{
          background:var(--ground);
          border-color:var(--line);
          transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
        }
        .auth-theme input:focus,.auth-theme input:focus-visible{
          outline:none;
          border-color:var(--hf-gold);
          box-shadow:0 0 0 1px var(--hf-gold-border);
          --tw-ring-color:transparent;
          --tw-ring-offset-width:0px;
          --tw-ring-shadow:0 0 #0000;
          --tw-ring-offset-shadow:0 0 #0000;
        }
        /* HeroBackground's aurora is tuned bright-on-ink: the same tokens that
           read as a living glow over Night's near-black ground get washed
           almost flat once its own protective veil sits atop them on Day's
           pale paper (the veil leans on the background token too, so a light
           theme re-covers its own glow far harder than a dark one does — the
           cockpit's ambient layer hit this identical wall, see cockpit.css).
           Paint one more coat of the same brass/ink tokens above that veil,
           Day only, so the backdrop keeps the presence the candidate screen
           already has. Night is untouched — it already reads right. */
        .auth-theme .hero-lift{position:fixed;inset:0;z-index:0;pointer-events:none;}
        :root:not(.dark) .auth-theme .hero-lift{
          background:
            radial-gradient(ellipse 68vw 42vw at 50% -10%, var(--hf-action-border), transparent 72%),
            radial-gradient(circle at 4% 2%, var(--hf-action-soft), transparent 58%),
            radial-gradient(circle at 97% 100%, var(--hf-gold-soft), transparent 55%);
        }
      `}</style>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&family=Inter:wght@400;500;600;700&display=swap"
      />

      <HeroBackground />
      <div aria-hidden className="hero-lift" />

      <div className="relative z-10 min-h-[100dvh] flex flex-col px-6 py-6 sm:py-8">
        {/* On staff.hireflownow.com there is no home behind sign-in: "/" comes
            straight back here, so the link would loop. */}
        {!isStaffHost() && (
          <Link
            to={inWebView ? "/?showLanding=true" : "/"}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        )}

        <div className="flex-1 grid items-center gap-10 lg:grid-cols-2 lg:gap-16 max-w-6xl w-full mx-auto py-8 lg:py-0">
          {/* LEFT — Ava is the centerpiece */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center lg:items-start"
          >
            {/* No hero graphic: the HireFlow wordmark and the line carry this
                page, the same call as the dashboard (the Phase 7 growth audit:
                the page showed Ava's seal and never the name). */}
            <Wordmark size={30} />
            <span
              className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em]"
              style={{
                borderColor: "var(--hf-gold-border)",
                color: "var(--hf-gold)",
                background: "var(--hf-gold-soft)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--hf-action)" }}
              />
              {authMode === "signup" ? "Start hiring" : "Sign in"}
            </span>
            <h1 className="mt-4 text-3xl lg:text-[2.6rem] leading-[1.08] text-center lg:text-left">
              {/* Says what the front page says: Ava is introduced inside, once they have an account (the Phase 7 growth review). */}
              Hire support agents, tested before you meet them.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground text-center lg:text-left">
              Looking for work?{" "}
              <Link to="/candidate" className="text-primary hover:underline">
                Go to Candidate Portal →
              </Link>
            </p>
          </motion.div>

          {/* RIGHT — auth card */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: reduceMotion ? 0 : 0.06, ease: [0.4, 0, 0.2, 1] }}
            className="w-full max-w-md mx-auto lg:mx-0"
          >
            {/* Auth Card */}
            <div
              ref={formRef}
              className="auth-card relative border rounded-2xl p-5 sm:p-8 shadow-[0_28px_80px_-16px_rgba(0,0,0,0.6)]"
            >
            {/* the brass rule across the head of the letterhead */}
            <span
              aria-hidden
              className="absolute left-6 right-6 top-0 h-[2.5px] rounded-full"
              style={{ background: "var(--brass-line)" }}
            />
            {/* Google Sign In - compact icon in native app, full button on web.
                Gated behind GOOGLE_AUTH_ENABLED until Supabase has Google OAuth
                credentials configured (authorize endpoint currently 400s). */}
            {GOOGLE_AUTH_ENABLED && (
              inWebView ? (
                <div className="flex justify-center mb-4">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isLoading}
                    className="h-10 w-10 rounded-full border border-border bg-card hover:bg-muted flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Sign in with Google"
                  >
                    {isGoogleLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isLoading}
                    className="w-full h-12 mb-6 bg-card hover:bg-muted border-border"
                  >
                    {isGoogleLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    )}
                    Continue with Google
                  </Button>

                  {/* Divider - hidden on mobile for tighter layout */}
                  <div className="relative mb-3 sm:mb-6 hidden sm:block">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
                    </div>
                  </div>
                </>
              )
            )}

            {/* Tabs - only show when not in password reset flows */}
            {secondStep ? (
              <SecondStepForm
                onDone={() => {
                  setSecondStep(false);
                  // Mid password reset: back to the new-password form.
                  if (!isResettingPassword) void routeAuthenticatedUser();
                }}
                onCancel={() => {
                  setSecondStep(false);
                  void supabase.auth.signOut();
                }}
              />
            ) : isResettingPassword ? (
              <motion.div
                key="reset-password"
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Set new password</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Enter your new password below
                  </p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-foreground">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        autoComplete="new-password"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="bg-muted/50 border-border focus:border-primary h-12 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <PasswordRequirements password={newPassword} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-foreground">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        autoComplete="new-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="bg-muted/50 border-border focus:border-primary h-12 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" 
                    disabled={isLoading || newPassword !== confirmPassword}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </Button>
                </form>
              </motion.div>
            ) : showForgotPassword ? (
              <motion.div
                key="forgot"
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Reset your password</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {resetEmailSent 
                      ? "Check your email for the reset link"
                      : "Enter your email and we'll send you a reset link"
                    }
                  </p>
                </div>

                {resetEmailSent ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-muted-foreground text-sm mb-6">
                      We've sent a password reset link to <span className="font-medium text-foreground">{forgotPasswordEmail}</span>
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setResetEmailSent(false);
                        setForgotPasswordEmail("");
                      }}
                      className="w-full h-12"
                    >
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email" className="text-foreground">Email</Label>
                      <Input
                        id="forgot-email"
                        autoComplete="email"
                        type="email"
                        placeholder="you@example.com"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        required
                        className="bg-muted/50 border-border focus:border-primary h-12"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" 
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send Reset Link"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowForgotPassword(false)}
                      className="w-full h-12 text-muted-foreground"
                    >
                      Back to Sign In
                    </Button>
                  </form>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="signin"
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              >
                <div role="tablist" aria-label="Sign in or create an account" className="mb-4 flex gap-[3px] rounded-[10px] bg-muted/50 p-[3px]" data-auth-tabs>
                  {(["signin", "signup"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={authMode === mode}
                      onClick={() => setAuthMode(mode)}
                      className={`flex-1 rounded-[8px] py-2 text-sm transition-colors ${authMode === mode ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      data-auth-tab={mode}
                    >
                      {mode === "signin" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>
                {authMode === "signin" ? (
                  <>
                <div className="mb-3 sm:mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                  <p className="text-muted-foreground text-sm mt-1 hidden sm:block">
                    Sign in to manage your hiring
                  </p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="text-foreground">Email</Label>
                    <Input
                      id="signin-email"
                      autoComplete="email"
                      type="email"
                      placeholder="you@example.com"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      onFocus={scrollFormIntoView}
                      required
                      className="bg-muted/50 border-border focus:border-primary h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-foreground">Password</Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        autoComplete="current-password"
                        type={showSignInPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        onFocus={scrollFormIntoView}
                        required
                        className="bg-muted/50 border-border focus:border-primary h-12 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignInPassword(!showSignInPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setForgotPasswordEmail(signInEmail);
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
                  </>
                ) : (
                  <>
                <div className="mb-3 sm:mb-5">
                  <h2 className="text-2xl font-bold text-foreground">Start hiring</h2>
                  <p className="text-muted-foreground text-sm mt-1">Your first job is free. No card needed.</p>
                </div>
                <form onSubmit={handleSignUp} className="space-y-3.5" data-signup-form>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-name" className="text-foreground">Your name</Label>
                    <Input id="signup-name" autoComplete="name" value={signUpName} onChange={(e) => setSignUpName(e.target.value)} onFocus={scrollFormIntoView} required className="bg-muted/50 border-border focus:border-primary h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-company" className="text-foreground">Business name</Label>
                    <Input id="signup-company" autoComplete="organization" value={signUpCompany} onChange={(e) => setSignUpCompany(e.target.value)} onFocus={scrollFormIntoView} required maxLength={80} className="bg-muted/50 border-border focus:border-primary h-11" />
                    {careersAddressPreview(signUpCompany) && (
                      <p className="text-xs text-muted-foreground" data-signup-address>
                        Your careers page: <span className="text-primary">hireflownow.com/c/{careersAddressPreview(signUpCompany)}</span>
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-foreground">Email</Label>
                    <Input id="signup-email" type="email" autoComplete="email" placeholder="you@yourbusiness.com" value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} onFocus={scrollFormIntoView} required className="bg-muted/50 border-border focus:border-primary h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-foreground">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showSignUpPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        onFocus={scrollFormIntoView}
                        required
                        className="bg-muted/50 border-border focus:border-primary h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showSignUpPassword ? "Hide password" : "Show password"}
                      >
                        {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs leading-relaxed text-muted-foreground" data-signup-agree>
                    <input type="checkbox" checked={signUpAgreed} onChange={(e) => setSignUpAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
                    <span>
                      I agree to the{" "}
                      <a href="https://hireflownow.com/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">Terms</a> and the{" "}
                      <a href="https://hireflownow.com/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">Privacy Policy</a>. I will never charge applicants anything, and I will only ask for ID papers I need to hire them.
                    </span>
                  </label>
                  <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={isLoading || !signUpAgreed} data-signup-submit>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating your account...
                      </>
                    ) : (
                      "Create business account"
                    )}
                  </Button>
                </form>
                  </>
                )}
              </motion.div>
            )}

            {/* Footer: a pointer for job seekers who landed here by mistake.
                The old "first three applicants are on us" line was a paid-plan
                promise; there is no plan any more (2026-10-04). Shown on phones
                too: applicants reach this page from the front page's "Sign in". */}
            <div
              className="mt-6 pt-4 border-t text-center"
              style={{ borderColor: "var(--hf-border)" }}
            >
              <p className="text-xs text-muted-foreground">
                Are you a job seeker?{" "}
                <Link to="/candidate" className="text-primary hover:underline">
                  Visit the candidate portal
                </Link>
              </p>
            </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
