import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Loader2, Sparkles, Check, Circle, PartyPopper, ArrowRight, Briefcase, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import avaOrb from "@/assets/ava-orb.png";

const VALID_TLDS = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'us', 'uk', 'ca', 'au', 'de', 'fr', 'es', 'it', 'nl', 'be', 'ch', 'at', 'jp', 'cn', 'kr', 'in', 'br', 'mx', 'ru', 'info', 'biz', 'dev', 'app', 'tech', 'online', 'ai', 'me', 'tv', 'cc', 'xyz', 'club', 'site', 'store', 'blog'];

// Common typos for TLDs
const TYPO_CORRECTIONS: Record<string, string> = {
  'coom': 'com', 'comm': 'com', 'con': 'com', 'vom': 'com', 'xom': 'com', 'comn': 'com', 'coim': 'com',
  'orgg': 'org', 'ogr': 'org', 'oeg': 'org',
  'nett': 'net', 'ner': 'net', 'het': 'net',
  'eduu': 'edu', 'eud': 'edu',
  'gob': 'gov', 'giov': 'gov',
};

const validateEmail = (email: string): { valid: boolean; error?: string; suggestion?: string } => {
  if (!email) return { valid: true };
  
  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Please enter a valid email address" };
  }
  
  const tld = email.split('.').pop()?.toLowerCase();
  if (!tld) return { valid: false, error: "Please enter a valid email address" };
  
  // Check for common typos
  if (TYPO_CORRECTIONS[tld]) {
    return { 
      valid: false, 
      error: `Did you mean .${TYPO_CORRECTIONS[tld]}?`,
      suggestion: TYPO_CORRECTIONS[tld]
    };
  }
  
  // Check if TLD is valid
  if (!VALID_TLDS.includes(tld)) {
    return { valid: false, error: "Please check your email domain ending" };
  }
  
  return { valid: true };
};

const emailSchema = z.string()
  .email("Please enter a valid email address")
  .refine((email) => {
    const result = validateEmail(email);
    return result.valid;
  }, "Please check your email - the domain ending looks incorrect");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

interface PublishSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobTitle: string;
}

const PasswordRequirements = ({ password }: { password: string }) => {
  const requirements = [
    { label: "At least 6 characters", met: password.length >= 6 },
    { label: "Contains a letter", met: /[a-zA-Z]/.test(password) },
    { label: "Contains a number", met: /\d/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {requirements.map((req, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {req.met ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Circle className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={req.met ? "text-emerald-500" : "text-muted-foreground"}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function PublishSignupModal({ isOpen, onClose, jobTitle }: PublishSignupModalProps) {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"signup" | "signin">("signup");
  const [isLoading, setIsLoading] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // Sign In state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Sign Up state
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  
  // Email validation state
  const signInEmailValidation = validateEmail(signInEmail);
  const signUpEmailValidation = validateEmail(signUpEmail);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      emailSchema.parse(signInEmail);
      passwordSchema.parse(signInPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({ variant: "destructive", description: err.errors[0].message });
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
          ? "Invalid email or password."
          : error.message,
      });
      setIsLoading(false);
    } else {
      // Redirect to auth which handles the guestJobData
      toast({ title: "Welcome back!", description: "Creating your job..." });
      navigate("/auth?redirect=createJob");
    }
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
        toast({ variant: "destructive", description: err.errors[0].message });
        setIsLoading(false);
        return;
      }
    }

    const { error } = await signUp(signUpEmail, signUpPassword, signUpName, "employer");

    if (error) {
      const errorMessage = error.message.includes("already registered")
        ? "This email is already registered. Please sign in instead."
        : error.message;
      
      toast({ variant: "destructive", title: "Sign Up Failed", description: errorMessage });
      setIsLoading(false);
    } else {
      toast({ title: "Account created!", description: "Publishing your job..." });
      // The auth state change in Auth.tsx will pick up the guestJobData
      navigate("/auth?redirect=createJob");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background border-border">
        {/* Header with celebration */}
        <div className="bg-gradient-to-br from-emerald-500/20 via-purple-500/10 to-background p-6 border-b border-border">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-4"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <img src={avaOrb} alt="AVA" className="w-14 h-14 object-contain" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2 text-emerald-500 mb-1">
                <PartyPopper className="h-4 w-4" />
                <span className="text-sm font-medium">Your job is ready!</span>
              </div>
              <DialogTitle className="text-xl font-bold text-foreground">
                Sign up to publish
              </DialogTitle>
            </div>
          </motion.div>
        </div>

        <div className="p-6">
          {/* Job preview */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border mb-6">
            <Briefcase className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">{jobTitle}</p>
              <p className="text-xs text-muted-foreground">Ready to publish</p>
            </div>
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="ml-auto"
            >
              <Sparkles className="h-5 w-5 text-emerald-500" />
            </motion.div>
          </div>

          {/* Benefits */}
          <div className="space-y-2 mb-6">
            {[
              "Your job will be live immediately",
              "AVA will screen all applicants automatically",
              "14-day free trial, no credit card required"
            ].map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-2 text-sm"
              >
                <Check className="h-4 w-4 text-emerald-500" />
                <span className="text-muted-foreground">{benefit}</span>
              </motion.div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex mb-6 bg-muted/50 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("signup")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                activeTab === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => setActiveTab("signin")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                activeTab === "signin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
          </div>

          {activeTab === "signup" ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  required
                  className={`h-11 ${signUpEmail && !signUpEmailValidation.valid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                {signUpEmail && !signUpEmailValidation.valid && (
                  <p className="text-xs text-destructive">{signUpEmailValidation.error}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showSignUpPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    required
                    className="h-11 pr-10"
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
                className="w-full h-11 bg-primary hover:bg-primary/90" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account & Publish
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  required
                  className={`h-11 ${signInEmail && !signInEmailValidation.valid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                {signInEmail && !signInEmailValidation.valid && (
                  <p className="text-xs text-destructive">{signInEmailValidation.error}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signin-password"
                    type={showSignInPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    required
                    className="h-11 pr-10"
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
              <Button 
                type="submit" 
                className="w-full h-11 bg-primary hover:bg-primary/90" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In & Publish
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
