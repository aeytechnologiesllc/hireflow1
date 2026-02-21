import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { FileText, Bell, MessageSquare, CheckCircle2, ArrowRight, Sparkles, Briefcase, Shield, Clock } from "lucide-react";
import confetti from "canvas-confetti";

interface CandidateOnboardingWizardProps {
  onComplete: () => void;
}

const FEATURES = [
  {
    icon: FileText,
    title: "Simple Application",
    description: "Just enter your code and follow the guided steps",
    stat: "2 min"
  },
  {
    icon: Clock,
    title: "Real-Time Updates",
    description: "Know exactly where you stand at every stage",
    stat: "Instant"
  },
  {
    icon: Shield,
    title: "Secure Documents",
    description: "Sign offers and contracts with confidence",
    stat: "100%"
  },
  {
    icon: MessageSquare,
    title: "Direct Communication",
    description: "Chat directly with your potential employer",
    stat: "24/7"
  }
];

const STEPS = [
  {
    number: "01",
    title: "Enter Your Code",
    description: "Use the application code shared by your employer"
  },
  {
    number: "02",
    title: "Complete Application",
    description: "Answer questions and showcase your skills"
  },
  {
    number: "03",
    title: "Track Progress",
    description: "Watch your application move through each stage"
  },
  {
    number: "04",
    title: "Get Hired",
    description: "Sign your offer and start your new journey"
  }
];

export default function CandidateOnboardingWizard({ onComplete }: CandidateOnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const isMobile = useIsMobile();

  // Auto-rotate features on step 1
  useEffect(() => {
    if (step !== 1) return;
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % FEATURES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [step]);

  const handleComplete = async () => {
    const colors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.6, x: 0.3 }, colors });
    setTimeout(() => { confetti({ particleCount: 80, spread: 60, origin: { y: 0.6, x: 0.7 }, colors }); }, 150);
    setTimeout(() => { confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 }, colors }); }, 300);
    setTimeout(() => { onComplete(); }, 1500);
  };

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-background ${isMobile ? 'h-[100dvh] overflow-hidden' : 'min-h-screen overflow-y-auto'}`}>
      {/* Animated background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute top-[-10%] right-[-10%] bg-primary/20 rounded-full blur-[120px] ${isMobile ? 'w-[200px] h-[200px]' : 'w-[500px] h-[500px]'}`}
        />
        <motion.div 
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.08, 0.12, 0.08] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute bottom-[-10%] left-[-10%] bg-accent/15 rounded-full blur-[100px] ${isMobile ? 'w-[150px] h-[150px]' : 'w-[400px] h-[400px]'}`}
        />
      </div>

      {/* Main content */}
      <div className={`relative z-10 w-full max-w-2xl mx-auto flex flex-col ${isMobile ? 'flex-1 px-4 pt-3 pb-2' : 'px-4 py-8 items-center justify-center min-h-screen'}`}>
        
        {/* Step indicators - inside flex layout on mobile */}
        <div className={`flex justify-center gap-2 ${isMobile ? 'pb-2' : 'hidden'}`}>
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: i === step ? 1 : 0.8, opacity: i === step ? 1 : 0.5 }}
              className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-primary' : 'w-2 bg-muted'}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className={`${isMobile ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          <AnimatePresence mode="wait">
            {/* Step 0: Welcome */}
            {step === 0 && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
                className={`text-center flex flex-col items-center ${isMobile ? 'flex-1 justify-center' : 'space-y-8'}`}
              >
                {/* Animated icon with glow */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className={`relative mx-auto ${isMobile ? 'w-16 h-16 mb-3' : 'w-28 h-28 mb-0'}`}
                >
                  <div className="absolute inset-0 bg-primary/30 rounded-full blur-xl animate-pulse" />
                  <div className="relative w-full h-full rounded-full bg-gradient-to-br from-primary/30 to-emerald-500/20 flex items-center justify-center border border-primary/30 backdrop-blur-sm">
                    <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity }}>
                      <Briefcase className={`text-primary ${isMobile ? 'w-8 h-8' : 'w-12 h-12'}`} />
                    </motion.div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className={isMobile ? 'space-y-2 mb-3' : 'space-y-3'}
                >
                  <h1 className={`font-bold bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent ${isMobile ? 'text-2xl' : 'text-4xl md:text-5xl'}`}>
                    Welcome to HireFlow
                  </h1>
                  <p className={`text-muted-foreground ${isMobile ? 'text-base' : 'text-xl'}`}>
                    Your gateway to your next opportunity
                  </p>
                </motion.div>

                {!isMobile && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-muted-foreground max-w-md mx-auto"
                  >
                    We've made the job application process simple, transparent, and stress-free. Let's show you how it works.
                  </motion.p>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className={isMobile ? 'mt-auto pb-2' : ''}
                >
                  <Button
                    onClick={() => setStep(1)}
                    size="lg"
                    className="relative group bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-6 text-lg overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      Get Started
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Button>
                </motion.div>
              </motion.div>
            )}

            {/* Step 1: Features Showcase */}
            {step === 1 && (
              <motion.div
                key="features"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4 }}
                className={`flex flex-col ${isMobile ? 'flex-1' : 'space-y-8'}`}
              >
                <div className={`text-center ${isMobile ? 'space-y-1 mb-3' : 'space-y-2'}`}>
                  <h2 className={`font-bold text-foreground ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Everything You Need</h2>
                  <p className={`text-muted-foreground ${isMobile ? 'text-sm' : ''}`}>A seamless experience from application to offer</p>
                </div>

                {isMobile ? (
                  /* Mobile: Single active card rotator */
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <AnimatePresence mode="wait">
                      {(() => {
                        const feature = FEATURES[activeFeature];
                        const Icon = feature.icon;
                        return (
                          <motion.div
                            key={activeFeature}
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                            transition={{ duration: 0.3 }}
                            className="w-full max-w-xs p-5 rounded-2xl border border-primary/50 bg-primary/10 text-center"
                          >
                            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                              <Icon className="w-6 h-6 text-primary" />
                            </div>
                            <h3 className="font-semibold text-foreground text-lg mb-1">{feature.title}</h3>
                            <p className="text-sm text-muted-foreground mb-3">{feature.description}</p>
                            <span className="text-sm font-bold text-primary">{feature.stat}</span>
                          </motion.div>
                        );
                      })()}
                    </AnimatePresence>

                    <div className="flex gap-2 mt-4">
                      {FEATURES.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveFeature(idx)}
                          className={`h-2 rounded-full transition-all duration-300 ${idx === activeFeature ? 'w-8 bg-primary' : 'w-2 bg-muted'}`}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Desktop: 2x2 grid */
                  <div className="grid grid-cols-2 gap-4">
                    {FEATURES.map((feature, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`relative p-5 rounded-2xl border transition-all duration-500 cursor-pointer ${
                          activeFeature === index
                            ? 'bg-primary/10 border-primary/50 scale-[1.02]'
                            : 'bg-card/50 border-border/50 hover:border-primary/30'
                        }`}
                        onClick={() => setActiveFeature(index)}
                      >
                        {activeFeature === index && (
                          <motion.div
                            layoutId="activeFeature"
                            className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl"
                            initial={false}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
                        )}
                        <div className="relative z-10 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeFeature === index ? 'bg-primary/20' : 'bg-muted'}`}>
                              <feature.icon className={`w-5 h-5 ${activeFeature === index ? 'text-primary' : 'text-muted-foreground'}`} />
                            </div>
                            <span className={`text-sm font-bold ${activeFeature === index ? 'text-primary' : 'text-muted-foreground'}`}>{feature.stat}</span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{feature.title}</h3>
                            <p className="text-sm text-muted-foreground">{feature.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                <div className={`flex gap-3 ${isMobile ? 'mt-auto pb-2' : 'pt-4'}`}>
                  <Button variant="outline" onClick={() => setStep(0)} className="flex-1 py-6">Back</Button>
                  <Button onClick={() => setStep(2)} className="flex-1 py-6 bg-primary hover:bg-primary/90 text-primary-foreground group">
                    Continue <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: How It Works */}
            {step === 2 && (
              <motion.div
                key="how-it-works"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4 }}
                className={`flex flex-col ${isMobile ? 'flex-1' : 'space-y-8'}`}
              >
                <div className={`text-center ${isMobile ? 'space-y-1 mb-2' : 'space-y-2'}`}>
                  <h2 className={`font-bold text-foreground ${isMobile ? 'text-2xl' : 'text-3xl'}`}>How It Works</h2>
                  <p className={`text-muted-foreground ${isMobile ? 'text-sm' : ''}`}>Four simple steps to your dream job</p>
                </div>

                {/* Timeline steps */}
                <div className={`relative ${isMobile ? 'flex-1 flex flex-col justify-center' : 'space-y-0'}`}>
                  {/* Connecting line */}
                  <div className={`absolute w-0.5 bg-gradient-to-b from-primary via-primary/50 to-primary/20 ${isMobile ? 'left-[18px] top-2 bottom-2' : 'left-6 top-8 bottom-8'}`} />
                  
                  <div className={`flex flex-col ${isMobile ? 'gap-2' : ''}`}>
                    {STEPS.map((item, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.15 }}
                        className={`relative flex items-center ${isMobile ? 'gap-3' : 'gap-5 py-4'}`}
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: index * 0.15 + 0.2, type: "spring" }}
                          className={`relative z-10 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center shadow-lg shadow-primary/20 ${isMobile ? 'w-9 h-9' : 'w-12 h-12'}`}
                        >
                          <span className={`font-bold text-primary-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>{item.number}</span>
                        </motion.div>
                        
                        <div className={isMobile ? 'flex-1 py-1' : 'flex-1 pt-2'}>
                          <h3 className={`font-semibold text-foreground ${isMobile ? 'text-sm' : 'text-lg'}`}>{item.title}</h3>
                          {!isMobile && <p className="text-muted-foreground">{item.description}</p>}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className={`flex gap-3 ${isMobile ? 'mt-auto pb-2' : 'pt-4'}`}>
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1 py-6">Back</Button>
                  <Button onClick={() => setStep(3)} className="flex-1 py-6 bg-primary hover:bg-primary/90 text-primary-foreground group">
                    Continue <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Ready to Start */}
            {step === 3 && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
                className={`text-center flex flex-col items-center ${isMobile ? 'flex-1 justify-center' : 'space-y-8'}`}
              >
                {/* Animated success icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className={`relative mx-auto ${isMobile ? 'w-20 h-20 mb-3' : 'w-32 h-32 mb-0'}`}
                >
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-primary/20 rounded-full blur-xl" 
                  />
                  <div className="relative w-full h-full rounded-full bg-gradient-to-br from-primary/30 to-emerald-500/20 flex items-center justify-center border border-primary/30">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.3, type: "spring" }}
                    >
                      <CheckCircle2 className={`text-primary ${isMobile ? 'w-10 h-10' : 'w-16 h-16'}`} />
                    </motion.div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className={isMobile ? 'space-y-2 mb-3' : 'space-y-3'}
                >
                  <h2 className={`font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent ${isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'}`}>
                    You're All Set!
                  </h2>
                  <p className={`text-muted-foreground max-w-md mx-auto ${isMobile ? 'text-base' : 'text-lg'}`}>
                    Ready to start your journey? Enter your application code and take the first step.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className={`bg-gradient-to-br from-card/80 to-card/40 border border-border/50 rounded-2xl max-w-md mx-auto backdrop-blur-sm ${isMobile ? 'p-3' : 'p-6'}`}
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className={`rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 ${isMobile ? 'w-8 h-8' : 'w-10 h-10'}`}>
                      <Sparkles className={`text-primary ${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
                    </div>
                    <p className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>
                      <span className="font-medium text-foreground">Pro tip:</span> Keep your application code handy — you received it from the employer.
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className={`flex gap-3 max-w-md mx-auto w-full ${isMobile ? 'mt-auto pb-2' : 'pt-4'}`}
                >
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1 py-6">Back</Button>
                  <Button
                    onClick={handleComplete}
                    size="lg"
                    className="flex-1 py-6 relative group bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 text-primary-foreground overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      Start Applying
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop step indicators */}
        {!isMobile && (
          <div className="flex justify-center gap-2 mt-10">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: i === step ? 1 : 0.8, opacity: i === step ? 1 : 0.5 }}
                className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-primary' : 'w-2 bg-muted'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
