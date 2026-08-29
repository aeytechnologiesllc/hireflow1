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
import { HeroBackground } from "@/components/ava/HeroBackground";
import { Wordmark } from "@/cockpit/components/Wordmark";
import { GlyphLetter } from "@/components/candidate/glyphs";

// Google OAuth isn't enabled on the Supabase backend yet (authorize endpoint
// returns 400) — keep the UI hidden until credentials exist. Flip
// VITE_GOOGLE_AUTH_ENABLED=true once it's live; no logic here changes.
const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";

const isWebView = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  return !!(window as any).natively || /wv|WebView/i.test(ua) || (/Android/.test(ua) && /Version\/[\d.]+/.test(ua) && !/Chrome\/[\d.]+ Mobile Safari/i.test(ua));
};

const VALID_TLDS = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'us', 'uk', 'ca', 'au', 'de', 'fr', 'es', 'it', 'nl', 'be', 'ch', 'at', 'jp', 'cn', 'kr', 'in', 'br', 'mx', 'ru', 'info', 'biz', 'dev', 'app', 'tech', 'online', 'ai'];

const emailSchema = z.string()
  .email("Please enter a valid email address")
  .refine((email) => {
    const tld = email.split('.').pop()?.toLowerCase();
    return tld && VALID_TLDS.includes(tld);
  }, "Please check your email - the domain ending looks incorrect (e.g., did you mean .com?)");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

// Real-time password requirements component
const PasswordRequirements = ({ password }: { password: string }) => {
  const requirements = [
    { label: "At least 6 characters", met: password.length >= 6 },
    { label: "Contains a letter", met: /[a-zA-Z]/.test(password) },
    { label: "Contains a number", met: /\d/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {requirements.map((req, i) => (
        <div key={i} className="flex items-center gap-2 text-xs transition-all duration-200">
          {req.met ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={req.met ? "text-success" : "text-muted-foreground"}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function CandidateAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, signInWithGoogle, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const inWebView = isWebView();
  const reduceMotion = useReducedMotion();
  const formRef = useRef<HTMLDivElement>(null);
  const redirectingRef = useRef(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">(
    searchParams.get("tab") === "signup" ? "signup" : "signin"
  );
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // Password reset state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const redirectTarget = searchParams.get("redirect");
  const safeRedirectTarget =
    redirectTarget && redirectTarget.startsWith("/") && !redirectTarget.startsWith("//")
      ? redirectTarget
      : null;

  // Sign In state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Sign Up state
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");

  const routeAuthenticatedUser = useCallback(async () => {
    if (redirectingRef.current) return;

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

      const { role, route } = await resolvePostAuthDestination({
        userId: currentUser.id,
        portalRole: "candidate",
      });

      const nextRoute = role === "candidate" && safeRedirectTarget ? safeRedirectTarget : route;

      navigated = true;
      navigate(nextRoute, { replace: true });
    } catch (error) {
      console.error("Error resolving candidate auth destination:", error);
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
  }, [navigate, safeRedirectTarget, toast]);

  useEffect(() => {
    if (user && !authLoading) {
      void routeAuthenticatedUser();
    }
  }, [user, authLoading, routeAuthenticatedUser]);

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
        setTimeout(() => setIsGoogleLoading(false), 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isGoogleLoading]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      emailSchema.parse(signInEmail);
      passwordSchema.parse(signInPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "warning",
          description: err.errors[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    const { error } = await signIn(signInEmail, signInPassword);

    if (error) {
      toast({
        variant: "warning",
        title: "Sign In Failed",
        description: error.message === "Invalid login credentials"
          ? "Invalid email or password. Please try again."
          : error.message,
      });
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
    setIsLoading(true);

    try {
      emailSchema.parse(signUpEmail);
      passwordSchema.parse(signUpPassword);
      nameSchema.parse(signUpName);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "warning",
          description: err.errors[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    // Always register as candidate - no role selector needed
    const { error, needsConfirmation } = await signUp(signUpEmail, signUpPassword, signUpName, "candidate");

    if (error) {
      const errorMessage = error.message.includes("already registered")
        ? "This email is already registered. Please sign in instead."
        : error.message;

      toast({
        variant: "warning",
        title: "Sign Up Failed",
        description: errorMessage,
      });
    } else if (needsConfirmation) {
      toast({
        title: "Check your email!",
        description: "We've sent you a confirmation link. Please verify your email to continue.",
        duration: 5000,
      });
    } else {
      toast({
        title: "Account created!",
        description: "Welcome to HireFlow. You can now apply for jobs.",
        duration: 1500,
      });
      await routeAuthenticatedUser();
    }

    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    // Role is passed via /auth/callback route; redirect URL is handled there
    const { error } = await signInWithGoogle(undefined, "candidate");

    if (error) {
      toast({
        variant: "warning",
        title: "Google Sign In Failed",
        description: error.message,
      });
      setIsGoogleLoading(false);
    }
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
          description: err.errors[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    // NOTE: we deliberately do NOT check whether the address has an account.
    // Telling a stranger "no account found" turns password reset into an account
    // enumeration tool — anyone could test a list of emails against us. The reply
    // below is identical whether or not the account exists.

    const redirectUrl = `${window.location.origin}/candidate/auth?reset=true`;

    const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo: redirectUrl,
    });

    if (error) {
      console.error('Password reset request failed:', error);
    }

    // Same response either way — never reveal whether the address is registered.
    setResetEmailSent(true);
    toast({
      title: "Check your email",
      description: "If that address has an account, a reset link is on its way.",
    });

    setIsLoading(false);
  };

  if (authLoading || isRedirecting) {
    return <AuthLoadingScreen variant="candidate" />;
  }

  return (
    <div
      className="candidate-auth-jade scroll-perf relative min-h-[100dvh] overflow-y-auto overflow-x-hidden"
      style={{ background: "var(--hf-bg)", color: "var(--hf-text)" }}
    >
      <style>{`
        /* Same token-driven treatment as the employer Auth screen — this page
           carries no private palette of its own; only what's genuinely local
           to it lives here. */
        .candidate-auth-jade h1,.candidate-auth-jade h2{font-family:'Fraunces',Georgia,serif;font-weight:500;letter-spacing:-0.01em;}
        .candidate-auth-jade .auth-card{border-color:var(--hf-border);background:var(--hf-surface);}
        .candidate-auth-jade input{background:var(--ground);border-color:var(--line);transition:border-color .18s ease, box-shadow .18s ease;}
        .candidate-auth-jade input:focus,.candidate-auth-jade input:focus-visible{
          outline:none;
          border-color:var(--hf-gold);
          box-shadow:0 0 0 1px var(--hf-gold-border);
          --tw-ring-color:transparent;
          --tw-ring-offset-width:0px;
          --tw-ring-shadow:0 0 #0000;
          --tw-ring-offset-shadow:0 0 #0000;
        }
      `}</style>

      <HeroBackground />

      <div className="relative z-10 min-h-[100dvh] flex flex-col px-6 py-6 sm:py-8">
        <Link
          to="/candidate"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Candidate Portal
        </Link>

        <div className="flex-1 grid items-center gap-10 lg:grid-cols-2 lg:gap-16 max-w-6xl w-full mx-auto py-8 lg:py-0">
          {/* LEFT — a calm welcome, the wordmark carries the brand */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center lg:items-start"
          >
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
                style={{ background: "var(--hf-green)" }}
              />
              Candidate Portal
            </span>
            <h1 className="mt-4 text-3xl lg:text-[2.6rem] leading-[1.08] text-center lg:text-left">
              Every application, one home.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground hidden sm:block text-center lg:text-left">
              Hiring?{" "}
              <Link to="/auth" className="text-primary hover:underline">
                Go to Employer Portal →
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
            <div
              ref={formRef}
              className="auth-card relative border rounded-2xl p-5 sm:p-8 shadow-[0_28px_80px_-16px_rgba(0,0,0,0.6)]"
            >
              {/* the brass rule across the head of the letterhead */}
              <span
                aria-hidden
                className="absolute left-6 right-6 sm:left-8 sm:right-8 top-0 h-[2.5px] rounded-full"
                style={{ background: "var(--brass-line)" }}
              />

              {showForgotPassword ? (
                /* Forgot Password View */
                <motion.div
                  key="forgot-password"
                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                >
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-foreground">Reset your password</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                      {resetEmailSent
                        ? "Check your email for the reset link"
                        : "Enter your email and we'll send you a reset link"}
                    </p>
                  </div>

                  {resetEmailSent ? (
                    <div className="text-center py-6">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                        style={{ background: "var(--hf-green-soft)" }}
                      >
                        <GlyphLetter size={30} style={{ color: "var(--hf-green)" }} />
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
                          type="email"
                          placeholder="you@example.com"
                          value={forgotPasswordEmail}
                          onChange={(e) => setForgotPasswordEmail(e.target.value)}
                          required
                          className="h-12"
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
                <>
                  {/* Google Sign In Button - hidden in WebView where Google blocks OAuth,
                      and gated behind GOOGLE_AUTH_ENABLED until Supabase has Google OAuth
                      credentials configured (authorize endpoint currently 400s). */}
                  {GOOGLE_AUTH_ENABLED && !inWebView && (
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
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                        )}
                        Continue with Google
                      </Button>

                      {/* Divider */}
                      <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Tabs — a shallow groove sunk into the card's own paper,
                      not a contrasting pill sitting on top of it. */}
                  <div className="flex mb-5 sm:mb-8 rounded-xl p-1 bg-[var(--hf-bg-soft)] shadow-[inset_0_1px_2px_rgba(20,32,27,0.08)]">
                    <button
                      onClick={() => setActiveTab("signin")}
                      className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "signin"
                          ? "bg-[var(--hf-surface)] text-[var(--hf-text)] shadow-[0_1px_3px_rgba(20,32,27,0.12)]"
                          : "text-[var(--hf-text-muted)] hover:text-[var(--hf-text)]"
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => setActiveTab("signup")}
                      className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "signup"
                          ? "bg-[var(--hf-surface)] text-[var(--hf-text)] shadow-[0_1px_3px_rgba(20,32,27,0.12)]"
                          : "text-[var(--hf-text-muted)] hover:text-[var(--hf-text)]"
                      }`}
                    >
                      Sign Up
                    </button>
                  </div>

                  {activeTab === "signin" ? (
                    <motion.div
                      key="signin"
                      initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <div className="mb-3 sm:mb-6">
                        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                          Sign in to see where your applications stand
                        </p>
                      </div>

                      <form onSubmit={handleSignIn} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="signin-email" className="text-foreground">Email</Label>
                          <Input
                            id="signin-email"
                            type="email"
                            placeholder="you@example.com"
                            value={signInEmail}
                            onChange={(e) => setSignInEmail(e.target.value)}
                            onFocus={scrollFormIntoView}
                            required
                            className="h-12"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signin-password" className="text-foreground">Password</Label>
                          <div className="relative">
                            <Input
                              id="signin-password"
                              type={showSignInPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={signInPassword}
                              onChange={(e) => setSignInPassword(e.target.value)}
                              onFocus={scrollFormIntoView}
                              required
                              className="h-12 pr-10"
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
                    </motion.div>
                  ) : (
                    <motion.div
                      key="signup"
                      initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <div className="mb-3 sm:mb-6">
                        <h2 className="text-2xl font-bold text-foreground">Create your account</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                          Keep every application you send in one place
                        </p>
                      </div>

                      <form onSubmit={handleSignUp} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="signup-name" className="text-foreground">Full Name</Label>
                          <Input
                            id="signup-name"
                            type="text"
                            placeholder="John Doe"
                            value={signUpName}
                            onChange={(e) => setSignUpName(e.target.value)}
                            onFocus={scrollFormIntoView}
                            required
                            className="h-12"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email" className="text-foreground">Email</Label>
                          <Input
                            id="signup-email"
                            type="email"
                            placeholder="you@example.com"
                            value={signUpEmail}
                            onChange={(e) => setSignUpEmail(e.target.value)}
                            onFocus={scrollFormIntoView}
                            required
                            className="h-12"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-password" className="text-foreground">Password</Label>
                          <div className="relative">
                            <Input
                              id="signup-password"
                              type={showSignUpPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={signUpPassword}
                              onChange={(e) => setSignUpPassword(e.target.value)}
                              onFocus={scrollFormIntoView}
                              required
                              className="h-12 pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <PasswordRequirements password={signUpPassword} />
                        </div>
                        <Button
                          type="submit"
                          className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating account...
                            </>
                          ) : (
                            "Create Account"
                          )}
                        </Button>
                      </form>
                    </motion.div>
                  )}

                  {/* Quiet reassurance footer — the letterhead's closing line,
                      set off from the form by a hairline like a signature block. */}
                  <div className="mt-6 pt-4 border-t border-[var(--hf-border)] text-center space-y-2">
                    <p className="text-xs" style={{ color: "var(--hf-text-muted)" }}>
                      One home for every application — and everyone hears back.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Are you an employer?{" "}
                      <Link to="/auth" className="text-primary hover:underline">
                        Sign in here
                      </Link>
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
