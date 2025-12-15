import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Users, FileText, BarChart3, Play, RotateCcw, Sparkles, CheckCircle, Star, TrendingUp, MessageSquare, Clock, Shield } from "lucide-react";
import hireflowLogo from "@/assets/hireflow-logo.png";

const SCENE_DURATIONS = [5000, 15000, 15000, 12000, 8000, 5000]; // ms per scene
const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0);

export default function MarketingDemo() {
  const [currentScene, setCurrentScene] = useState(-1); // -1 = not started
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const startDemo = () => {
    setCurrentScene(0);
    setIsPlaying(true);
    setProgress(0);
  };

  const restartDemo = () => {
    setCurrentScene(-1);
    setIsPlaying(false);
    setProgress(0);
  };

  // Scene progression
  useEffect(() => {
    if (!isPlaying || currentScene < 0) return;
    
    if (currentScene >= SCENE_DURATIONS.length) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      setCurrentScene(prev => prev + 1);
    }, SCENE_DURATIONS[currentScene]);

    return () => clearTimeout(timer);
  }, [currentScene, isPlaying]);

  // Progress bar
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      setProgress(prev => Math.min(prev + (100 / (TOTAL_DURATION / 100)), 100));
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <motion.div 
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-20 blur-[150px]"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.5))" }}
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full opacity-15 blur-[150px]"
          style={{ background: "linear-gradient(135deg, hsl(var(--accent)), hsl(var(--accent)/0.5))" }}
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, -40, 0],
            y: [0, 40, 0]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Progress bar */}
        {isPlaying && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-muted/30">
            <motion.div 
              className="h-full bg-gradient-to-r from-primary to-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Scene container */}
        <div className="flex-1 flex items-center justify-center p-8">
          <AnimatePresence mode="wait">
            {currentScene === -1 && <StartScreen key="start" onStart={startDemo} />}
            {currentScene === 0 && <Scene1Hero key="scene1" />}
            {currentScene === 1 && <Scene2AvaVoice key="scene2" />}
            {currentScene === 2 && <Scene3Pipeline key="scene3" />}
            {currentScene === 3 && <Scene4Documents key="scene4" />}
            {currentScene === 4 && <Scene5Analytics key="scene5" />}
            {currentScene === 5 && <Scene6CTA key="scene6" />}
            {currentScene >= 6 && <EndScreen key="end" onRestart={restartDemo} />}
          </AnimatePresence>
        </div>

        {/* Scene indicators */}
        {isPlaying && currentScene >= 0 && currentScene < 6 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
            {SCENE_DURATIONS.map((_, i) => (
              <div 
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === currentScene ? "bg-primary w-8" : i < currentScene ? "bg-primary/60" : "bg-muted/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Start Screen
function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="text-center"
    >
      <motion.img 
        src={hireflowLogo} 
        alt="HireFlow" 
        className="w-24 h-24 mx-auto mb-8"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <h1 className="text-4xl font-bold text-foreground mb-4">HireFlow Marketing Demo</h1>
      <p className="text-muted-foreground mb-8">60-second auto-playing feature showcase</p>
      <motion.button
        onClick={onStart}
        className="flex items-center gap-3 mx-auto px-8 py-4 bg-primary text-primary-foreground rounded-full font-semibold text-lg"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Play className="w-6 h-6" />
        Start Demo
      </motion.button>
      <p className="text-xs text-muted-foreground mt-4">Best viewed at 1920×1080 for screen recording</p>
    </motion.div>
  );
}

// Scene 1: Hero Intro (5s)
function Scene1Hero() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <motion.img 
        src={hireflowLogo} 
        alt="HireFlow" 
        className="w-32 h-32 mx-auto mb-8"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", duration: 1 }}
      />
      <motion.h1 
        className="text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        The Future of Hiring
      </motion.h1>
      <motion.p 
        className="text-2xl text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        AI-Powered Recruitment Platform
      </motion.p>
      <motion.div 
        className="flex items-center justify-center gap-8 mt-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5 }}
      >
        {[
          { icon: Mic, label: "Voice AI" },
          { icon: Users, label: "Smart Pipeline" },
          { icon: FileText, label: "E-Signatures" },
          { icon: BarChart3, label: "Analytics" },
        ].map((item, i) => (
          <motion.div 
            key={item.label}
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.8 + i * 0.1 }}
          >
            <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
              <item.icon className="w-7 h-7 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">{item.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// Scene 2: AVA Voice Assistant (15s)
function Scene2AvaVoice() {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 1000),  // Show FAB
      setTimeout(() => setStep(2), 2500),  // Open panel
      setTimeout(() => setStep(3), 4000),  // User message
      setTimeout(() => setStep(4), 6000),  // AVA response
      setTimeout(() => setStep(5), 8500),  // Action executing
      setTimeout(() => setStep(6), 11000), // Success state
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full max-w-5xl"
    >
      {/* Feature label */}
      <motion.div 
        className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Mic className="w-5 h-5 text-primary" />
        </div>
        <span className="text-2xl font-semibold text-foreground">AVA Voice Assistant</span>
      </motion.div>

      {/* Mock dashboard background */}
      <div className="bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 p-6 h-[500px] relative overflow-hidden">
        {/* Fake dashboard content */}
        <div className="grid grid-cols-3 gap-4 opacity-40">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-24 bg-muted/30 rounded-lg" />
          ))}
        </div>

        {/* FAB Button */}
        <AnimatePresence>
          {step >= 1 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute bottom-6 right-6"
            >
              <motion.div 
                className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${
                  step >= 2 ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-primary to-accent"
                }`}
                animate={step >= 2 && step < 6 ? { 
                  boxShadow: ["0 0 0 0 rgba(16, 185, 129, 0)", "0 0 0 12px rgba(16, 185, 129, 0.3)", "0 0 0 0 rgba(16, 185, 129, 0)"]
                } : {}}
                transition={{ duration: 1.5, repeat: step >= 2 && step < 6 ? Infinity : 0 }}
              >
                {step < 6 ? "AVA" : <CheckCircle className="w-6 h-6" />}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Panel */}
        <AnimatePresence>
          {step >= 2 && (
            <motion.div
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              className="absolute bottom-24 right-6 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-border bg-muted/30">
                <span className="font-semibold text-foreground">AVA Assistant</span>
              </div>
              <div className="p-4 space-y-4 max-h-64">
                {/* User message */}
                {step >= 3 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-br-md max-w-[80%]">
                      <TypewriterText text="Move Sarah to the interview phase" delay={50} />
                    </div>
                  </motion.div>
                )}
                
                {/* AVA response */}
                {step >= 4 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-md max-w-[80%]">
                      <TypewriterText 
                        text={step >= 5 ? "Moving Sarah Chen to Interview phase..." : "I'll move Sarah Chen to the Interview phase now."} 
                        delay={30} 
                      />
                    </div>
                  </motion.div>
                )}

                {/* Success message */}
                {step >= 6 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl rounded-bl-md flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Done! Sarah is now in Interview phase.
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice waveform indicator */}
        {step >= 2 && step < 4 && (
          <motion.div 
            className="absolute bottom-6 right-24 flex items-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {[1,2,3,4,5].map(i => (
              <motion.div
                key={i}
                className="w-1 bg-primary rounded-full"
                animate={{ height: [8, 24, 8] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Caption */}
      <motion.p 
        className="text-center text-muted-foreground mt-6 text-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Control your hiring pipeline with natural voice commands
      </motion.p>
    </motion.div>
  );
}

// Scene 3: Smart Pipeline (15s)
function Scene3Pipeline() {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 500),   // Show cards
      setTimeout(() => setStep(2), 2000),  // Animate first card
      setTimeout(() => setStep(3), 4500),  // Show AI scores
      setTimeout(() => setStep(4), 7000),  // Slider animation
      setTimeout(() => setStep(5), 10000), // Notification
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const applicants = [
    { name: "Sarah Chen", role: "Senior Developer", score: 94, phase: "Interview" },
    { name: "James Wilson", role: "Product Manager", score: 87, phase: "Review" },
    { name: "Emily Rodriguez", role: "UX Designer", score: 91, phase: "Quiz" },
  ];

  const phases = ["Application", "Quiz", "Review", "Interview", "Offer"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full max-w-5xl"
    >
      {/* Feature label */}
      <motion.div 
        className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <span className="text-2xl font-semibold text-foreground">Smart Applicant Pipeline</span>
      </motion.div>

      <div className="bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 p-6">
        {/* Phase indicators */}
        <div className="flex justify-between mb-8 px-4">
          {phases.map((phase, i) => (
            <motion.div 
              key={phase}
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                i <= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <span className="text-xs text-muted-foreground mt-2">{phase}</span>
            </motion.div>
          ))}
        </div>

        {/* Applicant cards */}
        <div className="space-y-4">
          {applicants.map((applicant, i) => (
            <motion.div
              key={applicant.name}
              initial={{ opacity: 0, x: -50 }}
              animate={{ 
                opacity: step >= 1 ? 1 : 0, 
                x: step >= 1 ? 0 : -50,
                scale: step === 2 && i === 0 ? 1.02 : 1
              }}
              transition={{ delay: i * 0.2, duration: 0.5 }}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                step === 2 && i === 0 ? "border-primary bg-primary/5" : "border-border/50 bg-card/50"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center font-semibold text-foreground">
                  {applicant.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{applicant.name}</h3>
                  <p className="text-sm text-muted-foreground">{applicant.role}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                {/* AI Score */}
                <motion.div 
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: step >= 3 ? 1 : 0, 
                    scale: step >= 3 ? 1 : 0 
                  }}
                  transition={{ delay: i * 0.15 }}
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="font-bold text-primary">{applicant.score}%</span>
                </motion.div>

                {/* Phase badge */}
                <motion.span 
                  className="px-3 py-1 rounded-full text-sm font-medium bg-primary/20 text-primary"
                  animate={step >= 4 && i === 0 ? { 
                    backgroundColor: ["hsl(var(--primary)/0.2)", "hsl(var(--accent)/0.2)", "hsl(var(--primary)/0.2)"]
                  } : {}}
                  transition={{ duration: 1, repeat: step >= 4 ? 2 : 0 }}
                >
                  {applicant.phase}
                </motion.span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Notification popup */}
        <AnimatePresence>
          {step >= 5 && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 right-4 bg-card border border-primary/50 rounded-lg p-4 shadow-lg max-w-xs"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Star className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">New Top Candidate!</p>
                  <p className="text-xs text-muted-foreground">Sarah Chen scored 94% - ready for interview</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.p 
        className="text-center text-muted-foreground mt-6 text-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        AI-powered candidate scoring and automated phase progression
      </motion.p>
    </motion.div>
  );
}

// Scene 4: Document Workflow (12s)
function Scene4Documents() {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 500),   // Show document
      setTimeout(() => setStep(2), 2500),  // Signature field
      setTimeout(() => setStep(3), 5000),  // Drawing signature
      setTimeout(() => setStep(4), 7500),  // Success
      setTimeout(() => setStep(5), 9500),  // Audit trail
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full max-w-5xl"
    >
      {/* Feature label */}
      <motion.div 
        className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <span className="text-2xl font-semibold text-foreground">E-Signature Documents</span>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Document preview */}
        <motion.div 
          className="bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 p-6 h-[450px] relative overflow-hidden"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: step >= 1 ? 1 : 0, x: step >= 1 ? 0 : -30 }}
        >
          <div className="bg-white rounded-lg p-6 h-full text-gray-800 relative">
            <h3 className="font-bold text-lg mb-4">OFFER LETTER</h3>
            <div className="space-y-2 text-sm">
              <p>Dear Sarah Chen,</p>
              <p className="text-gray-600">We are pleased to offer you the position of Senior Developer at HireFlow Inc...</p>
              <div className="h-20 bg-gray-100 rounded my-4" />
              <p className="text-gray-600">Compensation: $150,000/year + benefits</p>
            </div>

            {/* Signature field */}
            {step >= 2 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute bottom-6 left-6 right-6"
              >
                <div className="border-2 border-dashed border-primary/50 rounded-lg p-4 bg-primary/5">
                  <p className="text-xs text-gray-500 mb-2">Candidate Signature</p>
                  {step >= 3 && (
                    <motion.svg 
                      viewBox="0 0 200 50" 
                      className="w-full h-12"
                    >
                      <motion.path
                        d="M 10 40 Q 30 10 50 35 T 90 30 T 130 35 T 170 25 T 190 30"
                        fill="none"
                        stroke="#1e3a5f"
                        strokeWidth="2"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2 }}
                      />
                    </motion.svg>
                  )}
                </div>
              </motion.div>
            )}

            {/* Success overlay */}
            {step >= 4 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center rounded-lg"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring" }}
                  className="bg-emerald-500 text-white rounded-full p-4"
                >
                  <CheckCircle className="w-12 h-12" />
                </motion.div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Audit trail */}
        <motion.div 
          className="bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 p-6"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: step >= 5 ? 1 : 0, x: step >= 5 ? 0 : 30 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Audit Trail</h3>
          </div>
          
          <div className="space-y-4">
            {[
              { action: "Document Created", time: "10:32 AM", ip: "192.168.1.1" },
              { action: "Viewed by Candidate", time: "11:45 AM", ip: "203.45.67.89" },
              { action: "Candidate Signed", time: "11:52 AM", ip: "203.45.67.89" },
              { action: "Employer Countersigned", time: "2:15 PM", ip: "192.168.1.1" },
            ].map((item, i) => (
              <motion.div
                key={item.action}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.2 }}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                <div className="flex-1">
                  <p className="font-medium text-foreground text-sm">{item.action}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                    <span>IP: {item.ip}</span>
                  </div>
                </div>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </motion.div>
            ))}
          </div>

          <motion.div 
            className="mt-6 p-3 bg-primary/10 rounded-lg border border-primary/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <p className="text-xs text-primary font-medium">SHA-256 Hash Verified</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate">a3f8c2b1e9d...</p>
          </motion.div>
        </motion.div>
      </div>

      <motion.p 
        className="text-center text-muted-foreground mt-6 text-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        DocuSign-level compliance with complete audit trails
      </motion.p>
    </motion.div>
  );
}

// Scene 5: Analytics Dashboard (8s)
function Scene5Analytics() {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 2000),
      setTimeout(() => setStep(3), 4000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full max-w-5xl"
    >
      {/* Feature label */}
      <motion.div 
        className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <span className="text-2xl font-semibold text-foreground">Real-Time Analytics</span>
      </motion.div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Applicants", value: 1247, icon: Users, color: "primary" },
          { label: "Interviews", value: 89, icon: MessageSquare, color: "accent" },
          { label: "Hired", value: 34, icon: CheckCircle, color: "emerald" },
          { label: "Avg. Time to Hire", value: "12d", icon: Clock, color: "orange" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 30 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <stat.icon className={`w-5 h-5 text-${stat.color === "primary" ? "primary" : stat.color === "accent" ? "accent" : stat.color + "-500"}`} />
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <motion.p 
              className="text-3xl font-bold text-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {typeof stat.value === "number" ? (
                <CountUp end={stat.value} duration={2} />
              ) : stat.value}
            </motion.p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: step >= 2 ? 1 : 0, scale: step >= 2 ? 1 : 0.95 }}
          className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Applications Over Time</h3>
          <div className="h-48 flex items-end gap-2">
            {[40, 65, 45, 80, 55, 90, 75, 95, 60, 85, 70, 100].map((height, i) => (
              <motion.div
                key={i}
                className="flex-1 bg-gradient-to-t from-primary to-primary/50 rounded-t"
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: 0.1 * i, duration: 0.5 }}
              />
            ))}
          </div>
        </motion.div>

        {/* Activity feed */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: step >= 3 ? 1 : 0, scale: step >= 3 ? 1 : 0.95 }}
          className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {[
              "Sarah Chen advanced to Interview",
              "New application for Senior Developer",
              "James Wilson completed quiz (87%)",
              "Offer letter signed by Emily R.",
            ].map((activity, i) => (
              <motion.div
                key={activity}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.2 }}
                className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg"
              >
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm text-muted-foreground">{activity}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.p 
        className="text-center text-muted-foreground mt-6 text-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Track every metric with real-time insights
      </motion.p>
    </motion.div>
  );
}

// Scene 6: CTA Outro (5s)
function Scene6CTA() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="text-center"
    >
      <motion.img 
        src={hireflowLogo} 
        alt="HireFlow" 
        className="w-24 h-24 mx-auto mb-8"
        animate={{ 
          rotate: [0, 10, -10, 0],
          scale: [1, 1.1, 1]
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      
      <motion.h2 
        className="text-5xl font-bold text-foreground mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        Start Hiring Smarter
      </motion.h2>
      
      <motion.p 
        className="text-xl text-muted-foreground mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        7-day free trial • No credit card required
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary to-accent text-white rounded-full font-semibold text-xl shadow-lg"
      >
        <Sparkles className="w-6 h-6" />
        Get Started Free
      </motion.div>

      <motion.p 
        className="text-muted-foreground mt-8 text-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        hireflow.app
      </motion.p>
    </motion.div>
  );
}

// End Screen
function EndScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center"
    >
      <CheckCircle className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
      <h2 className="text-3xl font-bold text-foreground mb-4">Demo Complete!</h2>
      <p className="text-muted-foreground mb-8">Ready to screen record? Click replay to watch again.</p>
      <motion.button
        onClick={onRestart}
        className="flex items-center gap-3 mx-auto px-8 py-4 bg-primary text-primary-foreground rounded-full font-semibold"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <RotateCcw className="w-5 h-5" />
        Replay Demo
      </motion.button>
    </motion.div>
  );
}

// Helper Components
function TypewriterText({ text, delay = 50 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState("");
  
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, delay);
    return () => clearInterval(timer);
  }, [text, delay]);

  return <span>{displayText}</span>;
}

function CountUp({ end, duration }: { end: number; duration: number }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    const steps = 60;
    const increment = end / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, (duration * 1000) / steps);
    return () => clearInterval(timer);
  }, [end, duration]);

  return <>{count.toLocaleString()}</>;
}
