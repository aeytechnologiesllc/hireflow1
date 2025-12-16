import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FileText, Bell, MessageSquare, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

interface CandidateOnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: FileText,
    title: "Enter Your Code",
    description: "Received an application code from an employer? Simply enter it to start your application."
  },
  {
    icon: CheckCircle2,
    title: "Complete Your Application",
    description: "Answer questions, upload your resume, and complete any assessments - all in one place."
  },
  {
    icon: Bell,
    title: "Track Your Progress",
    description: "Get real-time updates as your application moves through each stage of the hiring process."
  },
  {
    icon: MessageSquare,
    title: "Stay Connected",
    description: "Communicate directly with employers and sign documents securely when you get the offer."
  }
];

export default function CandidateOnboardingWizard({ onComplete }: CandidateOnboardingWizardProps) {
  const [step, setStep] = useState(0);

  const handleComplete = async () => {
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#34d399', '#6ee7b7']
    });
    
    setTimeout(() => {
      onComplete();
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 overflow-y-auto">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent/8 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="text-center space-y-6"
            >
              {/* Welcome icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20"
              >
                <Sparkles className="w-10 h-10 text-primary" />
              </motion.div>

              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                  Welcome to HireFlow
                </h1>
                <p className="text-muted-foreground text-lg">
                  Your gateway to your next opportunity
                </p>
              </div>

              <p className="text-muted-foreground">
                We make the job application process simple, transparent, and stress-free.
              </p>

              <Button
                onClick={() => setStep(1)}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
              >
                Let's Get Started
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="how-it-works"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-foreground">
                  How It Works
                </h2>
                <p className="text-muted-foreground">
                  Applying for jobs has never been easier
                </p>
              </div>

              <div className="space-y-4">
                {STEPS.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-4 p-4 rounded-xl bg-card/50 border border-border/50"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(0)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  Continue
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="text-center space-y-6"
            >
              {/* Success icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring" }}
                className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-emerald-500/10 flex items-center justify-center border border-primary/30"
              >
                <CheckCircle2 className="w-12 h-12 text-primary" />
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">
                  You're All Set!
                </h2>
                <p className="text-muted-foreground">
                  Ready to start applying? Enter your application code and let's go.
                </p>
              </div>

              <div className="bg-card/50 border border-border/50 rounded-xl p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Pro tip:</span> Keep your application code handy - you received it from the employer when they shared the job posting with you.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleComplete}
                  size="lg"
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  Start Applying
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step indicators */}
        <div className="flex justify-center gap-2 mt-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
