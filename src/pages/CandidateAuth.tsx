import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Sparkles, Check, Circle } from "lucide-react";
import { z } from "zod";
import { motion } from "framer-motion";
import hireflowLogo from "@/assets/hireflow-logo.png";
import { WelcomeAnimation } from "@/components/animations/WelcomeAnimation";

const emailSchema = z.string().email("Please enter a valid email address");
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

export default function CandidateAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">(
    searchParams.get("tab") === "signup" ? "signup" : "signin"
  );

  // Sign In state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Sign Up state
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/apply");
    }
  }, [user, authLoading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      emailSchema.parse(signInEmail);
      passwordSchema.parse(signInPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "destructive",
          description: err.errors[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    const { error } = await signIn(signInEmail, signInPassword);

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: error.message === "Invalid login credentials" 
          ? "Invalid email or password. Please try again."
          : error.message,
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
      setWelcomeName(undefined);
      setShowWelcome(true);
    }

    setIsLoading(false);
  };

  const handleWelcomeComplete = () => {
    setShowWelcome(false);
    navigate("/apply");
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
          variant: "destructive",
          description: err.errors[0].message,
        });
        setIsLoading(false);
        return;
      }
    }

    // Always register as candidate - no role selector needed
    const { error } = await signUp(signUpEmail, signUpPassword, signUpName, "candidate");

    if (error) {
      const errorMessage = error.message.includes("already registered")
        ? "This email is already registered. Please sign in instead."
        : error.message;
      
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: errorMessage,
      });
    } else {
      toast({
        title: "Account created!",
        description: "Welcome to HireFlow. You can now apply for jobs.",
      });
      setWelcomeName(signUpName);
      setShowWelcome(true);
    }

    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {showWelcome && (
        <WelcomeAnimation 
          name={welcomeName} 
          onComplete={handleWelcomeComplete}
          duration={2500}
        />
      )}
      <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Gradient orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 py-8 relative z-10">
        <Link
          to="/candidate"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Candidate Portal
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-accent/40 rounded-xl blur-lg" />
                <img src={hireflowLogo} alt="HireFlow" className="h-12 w-12 rounded-xl relative" />
              </div>
              <span className="text-2xl font-bold text-foreground">HireFlow</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Candidate Portal
            </div>
          </div>

          {/* Auth Card */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8">
            {/* Tabs */}
            <div className="flex mb-8 bg-muted/50 rounded-xl p-1">
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

            {activeTab === "signin" ? (
              <motion.div
                key="signin"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Sign in to continue your job applications
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
                      required
                      className="bg-muted/50 border-border focus:border-primary h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-foreground">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
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
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Create an account</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Sign up to start applying for jobs
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
                      required
                      className="bg-muted/50 border-border focus:border-primary h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-foreground">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      required
                      className="bg-muted/50 border-border focus:border-primary h-12"
                    />
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

            {/* Footer link */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              Are you an employer?{" "}
              <Link to="/auth" className="text-primary hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
      </div>
    </>
  );
}
