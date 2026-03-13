import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Sparkles, Check, Circle, Briefcase, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { motion } from "framer-motion";
import appIcon from "@/assets/app-icon-new.png";
import { supabase } from "@/integrations/supabase/client";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";

// Detect if running inside a WebView (Natively or generic)
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
  const formRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    // Don't redirect if user is in password reset mode
    if (user && !authLoading && !isResettingPassword) {
      navigate(redirectTo === "createJob" ? "/jobs/create" : "/dashboard");
    }
  }, [user, authLoading, navigate, redirectTo, isResettingPassword]);

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
      navigate(redirectTo === "createJob" ? "/jobs/create" : "/dashboard");
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
    const { error } = await signUp(signUpEmail, signUpPassword, signUpName, "employer");

    if (error) {
      const errorMessage = error.message.includes("already registered")
        ? "This email is already registered. Please sign in instead."
        : error.message;
      
      toast({
        variant: "warning",
        title: "Sign Up Failed",
        description: errorMessage,
      });
    } else {
      // Assign employer role immediately after signup
      await supabase.rpc("assign_user_role", { p_role: "employer" });
      
      toast({
        title: "Account created!",
        description: "Welcome to HireFlow. You can now start using the platform.",
        duration: 1500,
      });
      navigate(redirectTo === "createJob" ? "/jobs/create" : "/dashboard");
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

    // First check if email exists in the system
    try {
      const response = await supabase.functions.invoke('check-email-exists', {
        body: { email: forgotPasswordEmail }
      });

      if (response.error) {
        console.error('Error checking email:', response.error);
        // Fall back to sending reset email anyway if check fails
      } else if (!response.data?.exists) {
        toast({
          variant: "warning",
          title: "Email Not Found",
          description: "No account found with this email address. Please check the email or sign up for a new account.",
        });
        setIsLoading(false);
        return;
      }
    } catch (checkError) {
      console.error('Error checking email existence:', checkError);
      // Continue with password reset if check fails
    }

    // Use production URL for password reset redirects
    const productionUrl = 'https://hireflownow.com';
    const redirectUrl = window.location.hostname === 'localhost' 
      ? `${window.location.origin}/auth?reset=true`
      : `${productionUrl}/auth?reset=true`;
    
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
      navigate("/dashboard");
    }

    setIsLoading(false);
  };

  if (authLoading || isWaitingForSession) {
    return <AuthLoadingScreen variant="employer" />;
  }

  return (
    <div className="dark min-h-[100dvh] bg-[hsl(220,18%,10%)] text-white relative overflow-y-auto">
      {/* Background grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Gradient orbs */}
      <div className="absolute top-0 left-1/4 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 py-4 sm:py-8 relative z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4 sm:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto"
        >
          {/* Logo */}
          <div className="text-center mb-4 sm:mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-accent/40 rounded-xl blur-lg" />
                <img src={appIcon} alt="HireFlow" className="h-12 w-12 rounded-xl relative" />
              </div>
              <span className="text-2xl font-bold text-foreground">HireFlow</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <Briefcase className="h-3.5 w-3.5" />
              Employer Portal
            </div>
            <p className="mt-3 text-sm text-muted-foreground hidden sm:block">
              Looking for work?{" "}
              <Link to="/candidate" className="text-primary hover:underline">
                Go to Candidate Portal →
              </Link>
            </p>
          </div>

          {/* Auth Card */}
          <div ref={formRef} className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-5 sm:p-8">
            {/* Google Sign In Button - hidden in WebView where Google blocks OAuth */}
            {!inWebView && (
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

                {/* Divider - hidden on mobile for tighter layout */}
                <div className="relative mb-3 sm:mb-6 hidden sm:block">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card/50 px-2 text-muted-foreground">or continue with email</span>
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
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
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
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
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
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
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
  );
}
