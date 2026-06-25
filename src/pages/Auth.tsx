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
import { AvaOrb } from "@/components/ava/AvaOrb";
import { ORB_SIZE } from "@/components/ava/orbSizes";
import { useIsMobile } from "@/hooks/use-mobile";

// Authoritative check (against auth.users via a SECURITY DEFINER RPC) used to
// turn Supabase's deliberately-vague "Invalid login credentials" into a real,
// actionable message: "no account" vs "wrong password". Falls back to `null`
// (unknown) if the RPC is unavailable so we never block sign-in on it.
async function checkEmailExists(email: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.rpc("email_exists", { p_email: email });
    if (error) return null;
    return Boolean(data);
  } catch {
    return null;
  }
}

// Detect if running inside a WebView (Natively or generic)
const isWebView = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Natively\//.test(ua)) return true;
  if (/wv/i.test(ua)) return true;
  if (/Android/.test(ua) && /Version\/[\d.]+/.test(ua) && !/Chrome\/[\d.]+ Mobile Safari/i.test(ua)) return true;
  return false;
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
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={req.met ? "text-emerald-500" : "text-muted-foreground"}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function Auth() {
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
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

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

  // Sign Up state
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");

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

  // Detect password reset mode from URL and listen for PASSWORD_RECOVERY event
  useEffect(() => {
    const isResetMode = searchParams.get("reset") === "true";
    if (isResetMode) {
      // Show loading state while waiting for session to establish
      setIsWaitingForSession(true);
    }

    // Listen for PASSWORD_RECOVERY event - this fires when session is ready
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setIsWaitingForSession(false);
        setIsResettingPassword(true);
      }
    });

    // Also check if session already exists (in case event fired before listener was set up)
    if (isResetMode) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setIsWaitingForSession(false);
          setIsResettingPassword(true);
        }
      });
    }

    return () => subscription.unsubscribe();
  }, [searchParams]);

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

      const { route } = await resolvePostAuthDestination({
        userId: currentUser.id,
        portalRole: "employer",
        redirectTo,
      });

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
  }, [navigate, redirectTo, toast]);

  useEffect(() => {
    if (user && !authLoading && !isResettingPassword && !isWaitingForSession) {
      void routeAuthenticatedUser();
    }
  }, [user, authLoading, isResettingPassword, isWaitingForSession, routeAuthenticatedUser]);

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
      const isBadCreds = /invalid login credentials/i.test(error.message);

      if (isBadCreds) {
        // Disambiguate the generic credential error so the user knows whether
        // to create an account or just fix/reset their password.
        const exists = await checkEmailExists(signInEmail);

        if (exists === false) {
          toast({
            variant: "warning",
            title: "No account found",
            description: "We couldn't find an account for that email. Switching you to Sign Up.",
          });
          setSignUpEmail(signInEmail);
          setActiveTab("signup");
        } else if (exists === true) {
          toast({
            variant: "warning",
            title: "Incorrect password",
            description: "That password doesn't match this account. Try again or use \u201cForgot password?\u201d to reset it.",
          });
        } else {
          toast({
            variant: "warning",
            title: "Sign In Failed",
            description: "Invalid email or password. Please try again.",
          });
        }
      } else if (/email not confirmed/i.test(error.message)) {
        toast({
          variant: "warning",
          title: "Confirm your email",
          description: "Please confirm your email address, then sign in. Check your inbox for the link.",
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

    // Always register as employer - candidates use /candidate/auth
    const { error, needsConfirmation } = await signUp(signUpEmail, signUpPassword, signUpName, "employer");

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
        description: "Welcome to HireFlow. You can now start using the platform.",
        duration: 1500,
      });
      await routeAuthenticatedUser();
    }

    setIsLoading(false);
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

    // First check if the email actually has an account (authoritative, against
    // auth.users). If the RPC is unavailable it returns null → we fall through
    // and send the reset anyway rather than blocking the user.
    const exists = await checkEmailExists(forgotPasswordEmail);
    if (exists === false) {
      toast({
        variant: "warning",
        title: "Email Not Found",
        description: "No account found with this email address. Please check the email or sign up for a new account.",
      });
      setIsLoading(false);
      return;
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
          description: err.errors[0].message,
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
        description: error.message,
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
      className="auth-jade dark scroll-perf min-h-[100dvh] relative overflow-y-auto overflow-x-hidden"
      style={{ background: "#0a2019", color: "#eef6f1" }}
    >
      <style>{`
        .auth-jade{
          --background:158 52% 8%;
          --foreground:150 30% 95%;
          --card:158 46% 11%;
          --card-foreground:150 30% 95%;
          --popover:158 46% 11%;
          --popover-foreground:150 30% 95%;
          --primary:36 48% 61%;
          --primary-foreground:158 60% 9%;
          --secondary:158 28% 16%;
          --secondary-foreground:150 30% 95%;
          --muted:158 26% 14%;
          --muted-foreground:156 14% 64%;
          --accent:162 67% 37%;
          --accent-foreground:0 0% 100%;
          --border:152 22% 22%;
          --input:152 22% 22%;
          --ring:36 48% 61%;
          font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
        }
        .auth-jade h1,.auth-jade h2{font-family:'Fraunces',Georgia,serif;font-weight:500;letter-spacing:-0.01em;}
        .auth-jade .bg-primary{background-image:linear-gradient(135deg,#cba36a,#e6c184);border:0;color:#0a2019;}
        .auth-jade .bg-primary:hover:not(:disabled){filter:brightness(1.05);background-image:linear-gradient(135deg,#cba36a,#e6c184);}
        .auth-jade .text-primary{color:#7fe3c2;}
        .auth-jade .auth-card{border-color:rgba(203,163,106,0.22);background:rgba(14,42,34,0.92);}
        /* Premium amber focus — single ring + soft glow, no green */
        .auth-jade input{transition:border-color .18s ease, box-shadow .18s ease;}
        .auth-jade input:focus,.auth-jade input:focus-visible{
          outline:none;
          border-color:#cba36a;
          box-shadow:0 0 0 1px rgba(203,163,106,0.55), 0 0 18px rgba(203,163,106,0.20);
          --tw-ring-color:transparent;
          --tw-ring-offset-width:0px;
          --tw-ring-shadow:0 0 #0000;
          --tw-ring-offset-shadow:0 0 #0000;
        }
      `}</style>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&family=Inter:wght@400;500;600;700&display=swap"
      />

      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />

      {/* Jade + brass glow blooms */}
      <div className="absolute top-0 left-1/4 w-[320px] h-[320px] sm:w-[560px] sm:h-[560px] bg-accent/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[260px] h-[260px] sm:w-[440px] sm:h-[440px] bg-primary/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 min-h-[100dvh] flex flex-col px-6 py-6 sm:py-8">
        <Link
          to={inWebView ? "/?showLanding=true" : "/"}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="flex-1 grid items-center gap-10 lg:grid-cols-2 lg:gap-16 max-w-6xl w-full mx-auto py-8 lg:py-0">
          {/* LEFT — Ava is the centerpiece */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center lg:items-start"
          >
            {/* Standard hero sizing (orbSizes.ts) — density scales by area, so
                the lg token reads as a crisp, well-separated dotted mesh instead
                of the dense blob the oversized 360px orb produced. */}
            <AvaOrb size={isMobile ? ORB_SIZE.md : ORB_SIZE.lg} />
            <span
              className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em]"
              style={{
                borderColor: "rgba(203,163,106,0.35)",
                color: "#cba36a",
                background: "rgba(10,32,25,0.6)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "#1f9e77", boxShadow: "0 0 8px rgba(31,158,119,0.6)" }}
              />
              Employer Portal
            </span>
            <h1 className="mt-4 text-3xl lg:text-[2.6rem] leading-[1.08] text-center lg:text-left">
              Hiring, handled by Ava.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground hidden sm:block text-center lg:text-left">
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
              className="auth-card border rounded-2xl p-5 sm:p-8 shadow-[0_28px_80px_-16px_rgba(0,0,0,0.6)]"
            >
            {/* Google Sign In - compact icon in native app, full button on web */}
            {inWebView ? (
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
            )}

            {/* Tabs - only show when not in password reset flows */}
            {!showForgotPassword && !isResettingPassword && (
              <div className="flex mb-5 sm:mb-8 bg-muted/50 rounded-xl p-1">
                <button
                  onClick={() => setActiveTab("signin")}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "signin"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setActiveTab("signup")}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "signup"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            {isResettingPassword ? (
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
            ) : activeTab === "signin" ? (
              <motion.div
                key="signin"
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              >
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
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-3 sm:mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Create an employer account</h2>
                  <p className="text-muted-foreground text-sm mt-1 hidden sm:block">
                    Start hiring with Ava-powered tools
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
                      className="bg-muted/50 border-border focus:border-primary h-12"
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
                      className="bg-muted/50 border-border focus:border-primary h-12"
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
                        className="bg-muted/50 border-border focus:border-primary h-12 pr-10"
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
                      "Create Employer Account"
                    )}
                  </Button>
                </form>
              </motion.div>
            )}

            {/* Footer link - hidden on mobile (employer-only mobile experience) */}
            <p className="text-center text-sm text-muted-foreground mt-6 hidden sm:block">
              Are you a job seeker?{" "}
              <Link to="/candidate" className="text-primary hover:underline">
                Visit the candidate portal
              </Link>
            </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
