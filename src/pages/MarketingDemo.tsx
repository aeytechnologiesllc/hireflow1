import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, Users, FileText, BarChart3, Play, RotateCcw, Sparkles, CheckCircle, 
  Star, TrendingUp, MessageSquare, Clock, Shield, Zap, Video, Keyboard,
  ClipboardList, Eye, FileCheck, Volume2, VolumeX, ChevronRight, Award,
  Target, Brain, Bot, PenTool, Send, ArrowRight, Rocket
} from "lucide-react";
import hireflowLogo from "@/assets/hireflow-logo.png";
import { usePricing } from "@/hooks/usePricing";

// Voice narration scripts for each scene - shorter, punchier
const VOICE_SCRIPTS = [
  "Stop wasting hours on hiring. Let AI do the work.", // Scene 1: Hero
  "One click. AVA creates your entire hiring workflow.", // Scene 2: Workflow
  "Candidates complete assessments automatically. No scheduling needed.", // Scene 3: Candidate Journey
  "Track every candidate at a glance. Drag to advance.", // Scene 4: Pipeline
  "AVA analyzes every resume. Spots inconsistencies. Ranks candidates instantly.", // Scene 5: Analysis
  "Set it and forget it. Autopilot advances qualified candidates.", // Scene 6: Autopilot
  "Control everything with your voice. AVA, move this applicant to interview.", // Scene 7: Voice
  "Send offers and NDAs. E-signatures and audit trails built in.", // Scene 8: Documents
  "Start your free trial today.", // Scene 9: CTA
];

// Fallback durations (used only if audio fails to load)
const FALLBACK_DURATIONS = [4000, 5000, 5500, 5000, 6000, 5000, 6000, 5500, 4000];
const AUDIO_END_BUFFER = 600; // Buffer after audio ends before next scene

export default function MarketingDemo() {
  const [currentScene, setCurrentScene] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioDurations, setAudioDurations] = useState<number[]>([]);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sceneTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate total duration based on actual audio or fallbacks
  const totalDuration = audioDurations.length > 0 
    ? audioDurations.reduce((a, b) => a + b, 0) + (AUDIO_END_BUFFER * VOICE_SCRIPTS.length)
    : FALLBACK_DURATIONS.reduce((a, b) => a + b, 0);

  // Preload all audio and get durations
  const preloadAudio = useCallback(async () => {
    setIsLoading(true);
    const loadedAudios: (HTMLAudioElement | null)[] = [];
    const durations: number[] = [];
    
    for (let i = 0; i < VOICE_SCRIPTS.length; i++) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ text: VOICE_SCRIPTS[i] }),
          }
        );

        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          // Wait for metadata to get duration
          await new Promise<void>((resolve) => {
            audio.addEventListener('loadedmetadata', () => {
              durations.push(audio.duration * 1000); // Convert to ms
              resolve();
            });
            audio.addEventListener('error', () => {
              durations.push(FALLBACK_DURATIONS[i]);
              resolve();
            });
            // Fallback if metadata doesn't load
            setTimeout(() => {
              if (durations.length <= i) {
                durations.push(FALLBACK_DURATIONS[i]);
                resolve();
              }
            }, 2000);
          });
          
          loadedAudios.push(audio);
        } else {
          loadedAudios.push(null);
          durations.push(FALLBACK_DURATIONS[i]);
        }
      } catch (error) {
        console.error(`Failed to load audio for scene ${i}:`, error);
        loadedAudios.push(null);
        durations.push(FALLBACK_DURATIONS[i]);
      }
    }
    
    audioRefs.current = loadedAudios;
    setAudioDurations(durations);
    setAudioLoaded(true);
    setIsLoading(false);
  }, []);

  const advanceToNextScene = useCallback(() => {
    setCurrentScene(prev => prev + 1);
  }, []);

  const playSceneAudio = useCallback((sceneIndex: number) => {
    // Clear any existing timer
    if (sceneTimerRef.current) {
      clearTimeout(sceneTimerRef.current);
      sceneTimerRef.current = null;
    }

    const audio = audioRefs.current[sceneIndex];
    const sceneDuration = audioDurations[sceneIndex] || FALLBACK_DURATIONS[sceneIndex];

    if (!isMuted && audio) {
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      }
      
      currentAudioRef.current = audio;
      audio.currentTime = 0;
      
      // Set up audio end listener for scene transition
      const handleAudioEnd = () => {
        audio.removeEventListener('ended', handleAudioEnd);
        // Add buffer before advancing
        sceneTimerRef.current = setTimeout(advanceToNextScene, AUDIO_END_BUFFER);
      };
      
      audio.addEventListener('ended', handleAudioEnd);
      audio.play().catch(() => {
        // If audio fails to play, use fallback timer
        audio.removeEventListener('ended', handleAudioEnd);
        sceneTimerRef.current = setTimeout(advanceToNextScene, sceneDuration + AUDIO_END_BUFFER);
      });
    } else {
      // No audio or muted - use timer-based transition
      sceneTimerRef.current = setTimeout(advanceToNextScene, sceneDuration + AUDIO_END_BUFFER);
    }
  }, [isMuted, audioDurations, advanceToNextScene]);

  const startDemo = async () => {
    if (!audioLoaded) {
      await preloadAudio();
    }
    setCurrentScene(0);
    setIsPlaying(true);
    setProgress(0);
  };

  const restartDemo = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
    if (sceneTimerRef.current) {
      clearTimeout(sceneTimerRef.current);
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    setCurrentScene(-1);
    setIsPlaying(false);
    setProgress(0);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (currentAudioRef.current) {
      if (!isMuted) {
        currentAudioRef.current.pause();
      }
    }
  };

  // Scene progression - audio-driven
  useEffect(() => {
    if (!isPlaying || currentScene < 0) return;
    
    if (currentScene >= VOICE_SCRIPTS.length) {
      setIsPlaying(false);
      return;
    }

    // Play audio for current scene (this also sets up scene transition)
    playSceneAudio(currentScene);

    return () => {
      if (sceneTimerRef.current) {
        clearTimeout(sceneTimerRef.current);
      }
    };
  }, [currentScene, isPlaying, playSceneAudio]);

  // Progress bar
  useEffect(() => {
    if (!isPlaying) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      return;
    }
    
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => Math.min(prev + (100 / (totalDuration / 100)), 100));
    }, 100);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, totalDuration]);

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <motion.div 
          className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full opacity-20 blur-[200px]"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.3))" }}
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, 80, 0],
            y: [0, -50, 0],
            rotate: [0, 45, 0]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full opacity-15 blur-[180px]"
          style={{ background: "linear-gradient(135deg, hsl(var(--accent)), hsl(var(--accent)/0.3))" }}
          animate={{ 
            scale: [1, 1.4, 1],
            x: [0, -60, 0],
            y: [0, 60, 0],
            rotate: [0, -30, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-10 blur-[150px]"
          style={{ background: "linear-gradient(180deg, hsl(var(--primary)), hsl(var(--accent)))" }}
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Progress bar */}
        {isPlaying && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-0 left-0 right-0 h-1.5 bg-muted/30"
          >
            <motion.div 
              className="h-full bg-gradient-to-r from-primary via-accent to-primary"
              style={{ width: `${progress}%` }}
            />
          </motion.div>
        )}

        {/* Mute button */}
        {isPlaying && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={toggleMute}
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-50"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </motion.button>
        )}

        {/* Scene container */}
        <div className="flex-1 flex items-center justify-center p-8">
          <AnimatePresence mode="wait">
            {currentScene === -1 && <StartScreen key="start" onStart={startDemo} isLoading={isLoading} />}
            {currentScene === 0 && <Scene1Hero key="s1" />}
            {currentScene === 1 && <Scene2Workflow key="s2" />}
            {currentScene === 2 && <Scene3CandidateJourney key="s3" />}
            {currentScene === 3 && <Scene4Pipeline key="s4" />}
            {currentScene === 4 && <Scene5Analysis key="s5" />}
            {currentScene === 5 && <Scene6Autopilot key="s6" />}
            {currentScene === 6 && <Scene7Voice key="s7" />}
            {currentScene === 7 && <Scene8Documents key="s8" />}
            {currentScene === 8 && <Scene9CTA key="s9" />}
            {currentScene >= 9 && <EndScreen key="end" onRestart={restartDemo} />}
          </AnimatePresence>
        </div>

        {/* Scene indicators */}
        {isPlaying && currentScene >= 0 && currentScene < 9 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2"
          >
            {VOICE_SCRIPTS.map((_, i) => (
              <div 
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentScene ? "bg-primary w-10" : i < currentScene ? "bg-primary/60 w-2" : "bg-muted/40 w-2"
                }`}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ============ START SCREEN ============
function StartScreen({ onStart, isLoading }: { onStart: () => void; isLoading: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="text-center"
    >
      <motion.div
        className="relative inline-block mb-10"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute inset-0 w-32 h-32 rounded-full bg-gradient-to-r from-primary via-accent to-primary opacity-30 blur-xl" />
        <motion.img 
          src={hireflowLogo} 
          alt="HireFlow" 
          className="relative w-32 h-32"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
      
      <motion.h1 
        className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        HireFlow
      </motion.h1>
      
      <motion.p 
        className="text-xl text-muted-foreground mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        The Future of Hiring • Demo
      </motion.p>
      
      <motion.button
        onClick={onStart}
        disabled={isLoading}
        className="group relative flex items-center gap-4 mx-auto px-10 py-5 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-full font-semibold text-xl shadow-2xl shadow-primary/30 disabled:opacity-70"
        whileHover={{ scale: 1.05, boxShadow: "0 25px 50px -12px hsl(var(--primary)/0.4)" }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        {isLoading ? (
          <>
            <motion.div 
              className="w-7 h-7 border-3 border-primary-foreground/30 border-t-primary-foreground rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            Loading Audio...
          </>
        ) : (
          <>
            <Play className="w-7 h-7" />
            Start Demo
            <ChevronRight className="w-5 h-5 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
          </>
        )}
      </motion.button>
      
      <motion.p 
        className="text-sm text-muted-foreground mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        🔊 Turn on audio for the full experience
      </motion.p>
    </motion.div>
  );
}

// ============ SCENE 1: HERO ============
function Scene1Hero() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.4 }}
      className="text-center"
    >
      <motion.div className="relative inline-block mb-8">
        <motion.div 
          className="absolute inset-0 w-40 h-40 rounded-full bg-gradient-to-r from-primary to-accent opacity-40 blur-2xl"
          animate={{ scale: [1, 1.3, 1], rotate: [0, 180, 360] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <motion.img 
          src={hireflowLogo} 
          alt="HireFlow" 
          className="relative w-40 h-40"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 0.8 }}
        />
      </motion.div>
      
      <motion.h1 
        className="text-7xl md:text-8xl font-bold mb-8"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <span className="bg-gradient-to-r from-primary via-foreground to-accent bg-clip-text text-transparent">
          The Future
        </span>
        <br />
        <span className="text-foreground">of Hiring</span>
      </motion.h1>
      
      <motion.div 
        className="flex items-center justify-center gap-10 mt-12"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        {[
          { icon: Mic, label: "Voice AI", color: "from-emerald-500 to-teal-500" },
          { icon: Brain, label: "Smart Analysis", color: "from-purple-500 to-pink-500" },
          { icon: FileText, label: "E-Signatures", color: "from-blue-500 to-cyan-500" },
          { icon: Zap, label: "Autopilot", color: "from-orange-500 to-amber-500" },
        ].map((item, i) => (
          <motion.div 
            key={item.label}
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 + i * 0.1 }}
          >
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg`}>
              <item.icon className="w-8 h-8 text-white" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ============ TYPEWRITER TEXT HELPER ============
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
  
  return <>{displayText}</>;
}

// ============ SCENE 2: WORKFLOW GENERATION ============
function Scene2Workflow() {
  const [step, setStep] = useState(0);
  const jobTitle = "Senior Product Manager";
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2000),
      setTimeout(() => setStep(4), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const phases = [
    { icon: FileCheck, label: "Application", color: "from-blue-500 to-cyan-500" },
    { icon: ClipboardList, label: "Quiz", color: "from-purple-500 to-pink-500" },
    { icon: Video, label: "Video Intro", color: "from-rose-500 to-orange-500" },
    { icon: Keyboard, label: "Typing Test", color: "from-amber-500 to-yellow-500" },
    { icon: MessageSquare, label: "Chat Sim", color: "from-green-500 to-emerald-500" },
    { icon: Mic, label: "Interview", color: "from-primary to-accent" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-4xl"
    >
      <motion.div 
        className="flex items-center gap-3 justify-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold text-foreground">AI Workflow Generation</span>
      </motion.div>

      <motion.div 
        className="bg-card/60 backdrop-blur-xl rounded-3xl border border-border/50 p-8 shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {/* Job title input */}
        <div className="mb-8">
          <label className="text-sm text-muted-foreground mb-2 block">Job Title</label>
          <div className="relative">
            <div className="w-full p-4 bg-muted/30 border border-border/50 rounded-xl text-xl font-medium text-foreground">
              {step >= 1 && <TypewriterText text={jobTitle} delay={60} />}
              {step < 2 && <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>|</motion.span>}
            </div>
          </div>
        </div>

        {/* Generate button */}
        <motion.button
          className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
            step >= 3 
              ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30" 
              : "bg-muted/50 text-muted-foreground"
          }`}
          animate={step === 3 ? { scale: [1, 0.98, 1] } : {}}
        >
          {step >= 3 && step < 4 ? (
            <>
              <motion.div 
                className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              Generating Workflow...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Workflow
            </>
          )}
        </motion.button>

        {/* Generated phases */}
        {step >= 4 && (
          <motion.div 
            className="mt-8 grid grid-cols-6 gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {phases.map((phase, i) => (
              <motion.div
                key={phase.label}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.08 }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/30"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${phase.color} flex items-center justify-center`}>
                  <phase.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-medium text-muted-foreground text-center">{phase.label}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ============ SCENE 3: CANDIDATE JOURNEY ============
function Scene3CandidateJourney() {
  const [activePhase, setActivePhase] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePhase(prev => (prev + 1) % 5);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const phases = [
    { 
      icon: ClipboardList, 
      label: "Quiz Assessment", 
      color: "from-purple-500 to-pink-500",
      preview: (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">What is your approach to...</div>
          <div className="space-y-2">
            {["Option A", "Option B", "Option C"].map((opt, i) => (
              <div key={opt} className={`p-3 rounded-lg border ${i === 1 ? "border-primary bg-primary/10" : "border-border/30"} text-sm`}>
                {opt}
              </div>
            ))}
          </div>
          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full w-3/4 bg-gradient-to-r from-primary to-accent rounded-full" />
          </div>
        </div>
      )
    },
    { 
      icon: Keyboard, 
      label: "Typing Test", 
      color: "from-amber-500 to-orange-500",
      preview: (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">Type the following text...</div>
          <div className="p-4 bg-muted/20 rounded-lg border border-border/30 text-sm font-mono">
            The quick brown fox jumps over...
          </div>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-primary">72 WPM</div>
            <div className="text-sm text-emerald-500">98% Accuracy</div>
          </div>
        </div>
      )
    },
    { 
      icon: Video, 
      label: "Video Intro", 
      color: "from-rose-500 to-red-500",
      preview: (
        <div className="relative aspect-video bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl border border-border/30 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
            <Play className="w-10 h-10 text-primary ml-1" />
          </div>
          <div className="absolute bottom-3 left-3 text-xs text-muted-foreground">2:34</div>
        </div>
      )
    },
    { 
      icon: MessageSquare, 
      label: "Chat Simulation", 
      color: "from-green-500 to-emerald-500",
      preview: (
        <div className="space-y-3">
          <div className="flex justify-start">
            <div className="bg-muted/40 px-4 py-2 rounded-2xl rounded-bl-md text-sm max-w-[80%]">
              I need help with my order
            </div>
          </div>
          <div className="flex justify-end">
            <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-br-md text-sm max-w-[80%]">
              I'd be happy to help! Let me look...
            </div>
          </div>
        </div>
      )
    },
    { 
      icon: Target, 
      label: "Sales Simulation", 
      color: "from-blue-500 to-indigo-500",
      preview: (
        <div className="space-y-3">
          <div className="flex justify-start">
            <div className="bg-muted/40 px-4 py-2 rounded-2xl rounded-bl-md text-sm max-w-[80%]">
              I'm not sure we have the budget...
            </div>
          </div>
          <div className="flex justify-end">
            <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-br-md text-sm max-w-[80%]">
              I understand. Let me show you the ROI...
            </div>
          </div>
        </div>
      )
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-5xl"
    >
      <motion.div 
        className="flex items-center gap-3 justify-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
          <Users className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold text-foreground">Automated Candidate Journey</span>
      </motion.div>

      <div className="flex gap-6">
        {/* Phase indicators */}
        <div className="flex flex-col gap-3 w-48">
          {phases.map((phase, i) => (
            <motion.div
              key={phase.label}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                i === activePhase ? "bg-card border border-primary/50" : "bg-card/30 border border-transparent"
              }`}
              animate={{ x: i === activePhase ? 8 : 0 }}
            >
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${phase.color} flex items-center justify-center`}>
                <phase.icon className="w-5 h-5 text-white" />
              </div>
              <span className={`text-sm font-medium ${i === activePhase ? "text-foreground" : "text-muted-foreground"}`}>
                {phase.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Preview */}
        <div className="flex-1 bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePhase}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {phases[activePhase].preview}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ============ SCENE 4: PIPELINE SLIDER ============
function Scene4Pipeline() {
  const [sliderPosition, setSliderPosition] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setSliderPosition(prev => (prev + 1) % 6);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const phases = [
    { icon: FileCheck, label: "Application" },
    { icon: ClipboardList, label: "Quiz" },
    { icon: Video, label: "Video" },
    { icon: Keyboard, label: "Typing" },
    { icon: MessageSquare, label: "Chat Sim" },
    { icon: Mic, label: "Interview" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-4xl"
    >
      <motion.div 
        className="flex items-center gap-3 justify-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold text-foreground">Smart Pipeline Slider</span>
      </motion.div>

      <motion.div 
        className="bg-card/60 backdrop-blur-xl rounded-3xl border border-border/50 p-8 shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Candidate info */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center text-xl font-bold text-foreground">
            SC
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">Sarah Chen</h3>
            <p className="text-muted-foreground">Senior Product Manager</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-14 h-14 rounded-full border-4 border-emerald-500 flex items-center justify-center">
              <span className="text-xl font-bold text-emerald-500">94</span>
            </div>
            <span className="text-sm text-muted-foreground">AI Score</span>
          </div>
        </div>

        {/* Slider track */}
        <div className="relative">
          {/* Track background */}
          <div className="h-3 bg-muted/30 rounded-full relative">
            <motion.div 
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-accent rounded-full"
              animate={{ width: `${((sliderPosition + 1) / phases.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          {/* Phase markers */}
          <div className="flex justify-between mt-4">
            {phases.map((phase, i) => (
              <div key={phase.label} className="flex flex-col items-center">
                <motion.div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    i <= sliderPosition 
                      ? "bg-gradient-to-br from-primary to-accent text-white" 
                      : "bg-muted/30 text-muted-foreground"
                  }`}
                  animate={i === sliderPosition ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <phase.icon className="w-6 h-6" />
                </motion.div>
                <span className={`text-xs mt-2 ${i <= sliderPosition ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {phase.label}
                </span>
              </div>
            ))}
          </div>

          {/* Draggable avatar */}
          <motion.div
            className="absolute -top-8"
            animate={{ left: `${(sliderPosition / (phases.length - 1)) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{ transform: "translateX(-50%)" }}
          >
            <motion.div 
              className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg shadow-xl shadow-primary/30 border-4 border-background cursor-grab"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              SC
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============ SCENE 5: AVA ANALYSIS ============
function Scene5Analysis() {
  const [score, setScore] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  
  useEffect(() => {
    const scoreTimer = setInterval(() => {
      setScore(prev => Math.min(prev + 4, 94));
    }, 40);
    
    const detailsTimer = setTimeout(() => setShowDetails(true), 1500);
    
    return () => {
      clearInterval(scoreTimer);
      clearTimeout(detailsTimer);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-4xl"
    >
      <motion.div 
        className="flex items-center gap-3 justify-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold text-foreground">AVA Analysis</span>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Score card */}
        <motion.div 
          className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 p-8 flex flex-col items-center justify-center"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <motion.div 
            className="relative w-40 h-40"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.3 }}
          >
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="80" cy="80" r="70"
                stroke="hsl(var(--muted))"
                strokeWidth="12"
                fill="none"
                opacity="0.3"
              />
              <motion.circle
                cx="80" cy="80" r="70"
                stroke="url(#scoreGradient)"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={440}
                initial={{ strokeDashoffset: 440 }}
                animate={{ strokeDashoffset: 440 - (440 * score / 100) }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold text-foreground">{score}</span>
            </div>
          </motion.div>
          <span className="text-lg text-muted-foreground mt-4">AI Match Score</span>
        </motion.div>

        {/* Analysis details */}
        <motion.div 
          className="bg-card/60 backdrop-blur-xl rounded-2xl border border-border/50 p-6 space-y-4"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
        >
          {showDetails && (
            <>
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
              >
                <div className="flex items-center gap-2 text-emerald-500 font-medium mb-2">
                  <CheckCircle className="w-4 h-4" />
                  Key Strengths
                </div>
                <p className="text-sm text-muted-foreground">8+ years PM experience, strong technical background</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30"
              >
                <div className="flex items-center gap-2 text-orange-500 font-medium mb-2">
                  <Eye className="w-4 h-4" />
                  Areas of Concern
                </div>
                <p className="text-sm text-muted-foreground">Limited B2B experience, career gap 2019-2020</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-4 rounded-xl bg-red-500/10 border border-red-500/30"
              >
                <div className="flex items-center gap-2 text-red-500 font-medium mb-2">
                  <Shield className="w-4 h-4" />
                  Red Flags Detected
                </div>
                <p className="text-sm text-muted-foreground">Resume claims 5 years React but quiz score only 45%</p>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

// ============ SCENE 6: AUTOPILOT MODE ============
function Scene6Autopilot() {
  const [isAutopilot, setIsAutopilot] = useState(false);
  const [passingScore, setPassingScore] = useState(60);
  
  useEffect(() => {
    const timer1 = setTimeout(() => setIsAutopilot(true), 600);
    const timer2 = setTimeout(() => {
      const interval = setInterval(() => {
        setPassingScore(prev => Math.min(prev + 3, 75));
      }, 50);
      setTimeout(() => clearInterval(interval), 800);
    }, 1200);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-3xl"
    >
      <motion.div 
        className="flex items-center gap-3 justify-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold text-foreground">Autopilot Mode</span>
      </motion.div>

      <motion.div 
        className="bg-card/60 backdrop-blur-xl rounded-3xl border border-border/50 p-8 shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Mode toggle */}
        <div className="flex gap-4 mb-8">
          <motion.div 
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              !isAutopilot ? "border-primary bg-primary/10" : "border-border/30 bg-card/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5" />
              <span className="font-medium">Manual</span>
            </div>
            <p className="text-sm text-muted-foreground">Review each candidate yourself</p>
          </motion.div>
          <motion.div 
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              isAutopilot ? "border-primary bg-primary/10" : "border-border/30 bg-card/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5" />
              <span className="font-medium">Autopilot</span>
            </div>
            <p className="text-sm text-muted-foreground">AI advances qualified candidates</p>
          </motion.div>
        </div>

        {/* Passing score slider */}
        {isAutopilot && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground">Passing Score Threshold</span>
              <span className="text-2xl font-bold text-primary">{passingScore}%</span>
            </div>
            <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                animate={{ width: `${passingScore}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ============ SCENE 7: AVA VOICE ============
function Scene7Voice() {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2400),
      setTimeout(() => setStep(4), 3600),
      setTimeout(() => setStep(5), 4800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-4xl"
    >
      <motion.div 
        className="flex items-center gap-3 justify-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
          <Mic className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold text-foreground">AVA Voice Assistant</span>
      </motion.div>

      <motion.div 
        className="bg-card/60 backdrop-blur-xl rounded-3xl border border-border/50 p-6 h-[400px] relative overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Fake dashboard background */}
        <div className="grid grid-cols-3 gap-4 opacity-30">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-20 bg-muted/30 rounded-lg" />
          ))}
        </div>

        {/* AVA FAB */}
        {step >= 1 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute bottom-6 right-6"
          >
            <motion.div 
              className={`px-6 py-3 rounded-full font-bold text-white shadow-2xl flex items-center gap-3 ${
                step >= 5 ? "bg-emerald-500" : "bg-gradient-to-r from-emerald-500 to-teal-500"
              }`}
              animate={step >= 2 && step < 5 ? {
                boxShadow: [
                  "0 0 0 0 rgba(16, 185, 129, 0)",
                  "0 0 0 20px rgba(16, 185, 129, 0.2)",
                  "0 0 0 0 rgba(16, 185, 129, 0)"
                ]
              } : {}}
              transition={{ duration: 1.5, repeat: step >= 2 && step < 5 ? Infinity : 0 }}
            >
              {step >= 5 ? <CheckCircle className="w-5 h-5" /> : <span className="text-lg">AVA</span>}
              {step >= 2 && step < 5 && (
                <motion.div 
                  className="w-3 h-3 rounded-full bg-white"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Chat panel */}
        {step >= 2 && (
          <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="absolute bottom-24 right-6 w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-border bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-500" />
                <span className="font-semibold text-foreground">AVA Assistant</span>
              </div>
            </div>
            <div className="p-4 space-y-4 max-h-56">
              {step >= 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-br-md text-sm">
                    Move Sarah to interview
                  </div>
                </motion.div>
              )}
              {step >= 4 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-md text-sm">
                    Moving Sarah Chen to Interview phase...
                  </div>
                </motion.div>
              )}
              {step >= 5 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl rounded-bl-md flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Done! Sarah is now in Interview.
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Voice waveform */}
        {step >= 2 && step < 4 && (
          <motion.div 
            className="absolute bottom-6 right-40 flex items-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {[1,2,3,4,5,6,7].map(i => (
              <motion.div
                key={i}
                className="w-1 bg-emerald-500 rounded-full"
                animate={{ height: [8, 24 + Math.random() * 16, 8] }}
                transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.08 }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ============ SCENE 8: DOCUMENTS ============
function Scene8Documents() {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2200),
      setTimeout(() => setStep(4), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-3xl"
    >
      <motion.div 
        className="flex items-center gap-3 justify-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold text-foreground">E-Signatures & Documents</span>
      </motion.div>

      <motion.div 
        className="bg-card/60 backdrop-blur-xl rounded-3xl border border-border/50 p-8 shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Document preview */}
        <div className="bg-white rounded-xl p-6 text-black mb-6">
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold">OFFER LETTER</h3>
            <p className="text-sm text-gray-500">HireFlow Inc.</p>
          </div>
          <div className="space-y-2 text-sm">
            <p>Dear Sarah Chen,</p>
            <p className="text-gray-600">We are pleased to offer you the position of Senior Product Manager...</p>
          </div>
          
          {/* Signature area */}
          {step >= 2 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 pt-4 border-t border-gray-200"
            >
              <p className="text-xs text-gray-500 mb-2">Candidate Signature</p>
              <div className={`h-16 border-2 border-dashed rounded-lg flex items-center justify-center ${
                step >= 4 ? "border-emerald-500 bg-emerald-50" : "border-blue-500 bg-blue-50"
              }`}>
                {step >= 3 && step < 4 && (
                  <motion.div
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                  >
                    <PenTool className="w-5 h-5 text-blue-500" />
                  </motion.div>
                )}
                {step >= 4 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-2 text-emerald-600"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-script text-lg italic">Sarah Chen</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Status badges */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step >= 4 && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-500"
              >
                <CheckCircle className="w-4 h-4" />
                Signed
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 text-blue-500"
            >
              <Shield className="w-4 h-4" />
              Audit Trail
            </motion.div>
          </div>
          {step >= 4 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-sm text-muted-foreground"
            >
              Signed Dec 15, 2025 at 3:42 PM
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============ SCENE 9: PRICING CTA ============
function Scene9CTA() {
  const pricing = usePricing();
  
  const plans = [
    {
      name: "Growth",
      price: pricing.growth.monthly,
      features: ["3 Active Jobs", "50 Applicants/Job", "AI Analysis"],
      color: "from-blue-500 to-cyan-500"
    },
    {
      name: "Business",
      price: pricing.business.monthly,
      features: ["Unlimited Jobs", "Team Portal", "Documents"],
      color: "from-primary to-accent",
      popular: true
    },
    {
      name: "Enterprise",
      price: pricing.enterprise?.monthly || `${pricing.symbol}99`,
      features: ["AVA Voice", "500 Voice Mins", "Priority Support"],
      color: "from-purple-500 to-pink-500"
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-5xl text-center"
    >
      <motion.h2 
        className="text-5xl font-bold mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          Start Your Free Trial
        </span>
      </motion.h2>
      <motion.p 
        className="text-xl text-muted-foreground mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        7 days free • No credit card required
      </motion.p>

      <div className="grid grid-cols-3 gap-6">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.12 }}
            className={`relative bg-card/60 backdrop-blur-xl rounded-2xl border p-6 ${
              plan.popular ? "border-primary shadow-2xl shadow-primary/20" : "border-border/50"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-primary to-accent rounded-full text-xs font-bold text-primary-foreground">
                MOST POPULAR
              </div>
            )}
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} mx-auto mb-4 flex items-center justify-center`}>
              <Award className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">{plan.name}</h3>
            <div className="text-3xl font-bold text-foreground mb-4">
              {plan.price}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 justify-center">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  {feature}
                </li>
              ))}
            </ul>
            <motion.button
              className={`w-full py-3 rounded-xl font-semibold ${
                plan.popular 
                  ? "bg-gradient-to-r from-primary to-accent text-primary-foreground" 
                  : "bg-muted/50 text-foreground"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Get Started
            </motion.button>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ============ END SCREEN ============
function EndScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="text-center"
    >
      <motion.div
        className="relative inline-block mb-8"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring" }}
      >
        <div className="absolute inset-0 w-32 h-32 rounded-full bg-gradient-to-r from-primary to-accent opacity-40 blur-2xl" />
        <img src={hireflowLogo} alt="HireFlow" className="relative w-32 h-32" />
      </motion.div>
      
      <motion.h2 
        className="text-4xl font-bold text-foreground mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        Ready to Transform Your Hiring?
      </motion.h2>
      
      <motion.div 
        className="flex items-center justify-center gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.button
          onClick={onRestart}
          className="flex items-center gap-2 px-6 py-3 bg-muted/50 text-foreground rounded-full font-medium"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <RotateCcw className="w-5 h-5" />
          Replay Demo
        </motion.button>
        <motion.button
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-full font-semibold shadow-xl shadow-primary/30"
          whileHover={{ scale: 1.05, boxShadow: "0 25px 50px -12px hsl(var(--primary)/0.4)" }}
          whileTap={{ scale: 0.95 }}
        >
          Start Free Trial
          <ArrowRight className="w-5 h-5" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
