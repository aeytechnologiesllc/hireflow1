import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import { useVideoInterviewRecorder } from "@/hooks/useVideoInterviewRecorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Mic, MicOff, Phone, PhoneOff, Volume2, CheckCircle, Download, Clock, Wifi, WifiOff, Video, VideoOff, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isComplete: boolean;
}

interface JobDetails {
  title: string;
  description: string;
  requirements: string;
  company_name?: string;
}

export default function VoiceInterviewPhase() {
  const { id: applicationId, stepId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<JobDetails | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [language, setLanguage] = useState("en");
  const [duration, setDuration] = useState(10);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [interviewResult, setInterviewResult] = useState<any>(null);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);

  // Camera/video states
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraTestPassed, setCameraTestPassed] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Interview timer states
  const [interviewStartTime, setInterviewStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Refs for tracking current streaming message and auto-scroll
  const currentMessageIdRef = useRef<string | null>(null);
  const currentMessageRoleRef = useRef<'user' | 'assistant' | null>(null);
  const messageCounterRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Video recording hook - audioOnly = true means no video
  const {
    isPermissionGranted,
    isRecording,
    isUploading,
    uploadProgress,
    error: videoError,
    micLevels,
    isAudioOnly,
    requestPermissions,
    startRecording,
    stopRecording,
    uploadRecording,
    cleanup: cleanupVideo,
    getPreviewStream,
  } = useVideoInterviewRecorder({ applicationId: applicationId || '', audioOnly: !videoEnabled });

  const handleTranscript = useCallback((text: string, role: "user" | "assistant") => {
    const timestamp = Date.now();
    
    setMessages(prev => {
      // If role changed from the current streaming message, mark it complete and start new
      if (currentMessageRoleRef.current && currentMessageRoleRef.current !== role) {
        // Mark the previous message as complete
        const updatedPrev = prev.map(m => 
          m.id === currentMessageIdRef.current ? { ...m, isComplete: true } : m
        );
        
        // Start a new message
        messageCounterRef.current += 1;
        const newId = `msg-${messageCounterRef.current}-${timestamp}`;
        currentMessageIdRef.current = newId;
        currentMessageRoleRef.current = role;
        
        return [...updatedPrev, { 
          id: newId, 
          role, 
          content: text, 
          timestamp, 
          isComplete: false 
        }];
      }
      
      // Same role - check if we have a current streaming message
      if (currentMessageIdRef.current && currentMessageRoleRef.current === role) {
        // Append to existing message
        return prev.map(m => 
          m.id === currentMessageIdRef.current 
            ? { ...m, content: m.content + text } 
            : m
        );
      }
      
      // No current message - start a new one
      messageCounterRef.current += 1;
      const newId = `msg-${messageCounterRef.current}-${timestamp}`;
      currentMessageIdRef.current = newId;
      currentMessageRoleRef.current = role;
      
      return [...prev, { 
        id: newId, 
        role, 
        content: text, 
        timestamp, 
        isComplete: false 
      }];
    });
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInterviewEnd = useCallback(async (evaluation: any) => {
    setInterviewResult(evaluation);
    
    // Show completion screen IMMEDIATELY so user sees upload progress
    setShowCompletionScreen(true);
    
    try {
      // Stop video recording and upload - always try to stop, don't check isRecording state
      // (it may be stale in the closure)
      const blob = await stopRecording();
      if (blob && blob.size > 0) {
        console.log('Recording stopped, uploading...', blob.size, 'bytes');
        const url = await uploadRecording(blob);
        if (!url) {
          console.error('Failed to upload recording');
          toast.error("Video upload failed, but interview results were saved");
        }
      } else {
        console.log('No recording blob available or empty');
      }

      // Save result to database
      const { error } = await supabase
        .from("applications")
        .update({
          voice_interview_result: evaluation,
          phase_ai_analysis: evaluation.summary,
        })
        .eq("id", applicationId);

      if (error) throw error;
      
      // Trigger AVA analysis in background (fire-and-forget)
      triggerAvaAnalysis(applicationId!).catch(console.error);
    } catch (error) {
      console.error("Error saving interview result:", error);
      toast.error("Failed to save interview results");
      // Still show completion screen even on error so user knows interview ended
    }
  }, [applicationId, stopRecording, uploadRecording]);

  const {
    isConnected,
    isConnecting,
    isSpeaking,
    isListening,
    isProcessing,
    audioLevels,
    connectionQuality,
    connect,
    disconnect,
    sendTextMessage,
    getAvaAudioElement,
  } = useAvaVoice({
    mode: "interview",
    applicationId,
    language,
    duration,
    onTranscript: handleTranscript,
    onInterviewEnd: handleInterviewEnd,
  });

  // Interview timer effect - must be after useAvaVoice hook
  useEffect(() => {
    if (!isConnected || !interviewStartTime) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - interviewStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected, interviewStartTime]);

  useEffect(() => {
    loadApplicationData();
  }, [applicationId]);

  // Cleanup video on unmount
  useEffect(() => {
    return () => {
      cleanupVideo();
    };
  }, [cleanupVideo]);

  // Enable camera and microphone
  const enableCamera = async () => {
    const stream = await requestPermissions();
    if (stream) {
      // Set enabled first - this will cause video element to render
      setCameraEnabled(true);
    }
  };

  // Attach stream to video element after it mounts or when interview starts
  // (interview UI has a different video element that needs the stream re-attached)
  useEffect(() => {
    if (cameraEnabled && videoPreviewRef.current && isPermissionGranted) {
      const stream = getPreviewStream();
      if (stream) {
        videoPreviewRef.current.srcObject = stream;
      }
    }
  }, [cameraEnabled, isPermissionGranted, getPreviewStream, interviewStarted]);

  // Confirm camera works
  const confirmCameraWorks = () => {
    setCameraTestPassed(true);
    toast.success("Camera & microphone ready!");
  };

  const loadApplicationData = async () => {
    if (!applicationId) return;

    try {
      const { data: app, error: appError } = await supabase
        .from("applications")
        .select(`
          *,
          jobs:job_id (
            title,
            description,
            requirements,
            employer_id
          )
        `)
        .eq("id", applicationId)
        .single();

      if (appError) throw appError;

      // Check if already submitted
      if (app.voice_interview_result) {
        setIsSubmitted(true);
        setLoading(false);
        return;
      }

      // Get employer profile for company name
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_name")
        .eq("user_id", app.jobs.employer_id)
        .single();

      // Get candidate profile
      const { data: candidateProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", app.candidate_id)
        .single();

      setJob({
        title: app.jobs.title,
        description: app.jobs.description,
        requirements: app.jobs.requirements,
        company_name: profile?.company_name,
      });
      setCandidateName(candidateProfile?.full_name || "Candidate");
      setLanguage(app.voice_interview_language || "en");
      setDuration(app.voice_interview_duration || 10);
      setVideoEnabled(app.voice_interview_video_enabled !== false); // Default to true if not set
    } catch (error) {
      console.error("Error loading application:", error);
      toast.error("Failed to load interview data");
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async () => {
    if (!job || !applicationId) return;
    setInterviewStarted(true);
    setInterviewStartTime(Date.now());
    
    // Start voice connection
    await connect();
    
    // Start video recording after connection established
    // We'll start recording once connected via useEffect
  };

  // Start recording when connected
  useEffect(() => {
    if (isConnected && interviewStarted && cameraTestPassed && !isRecording) {
      const avaAudioEl = getAvaAudioElement();
      const started = startRecording(avaAudioEl);
      if (started) {
        console.log('Video recording started');
      } else {
        console.warn('Failed to start video recording');
      }
    }
  }, [isConnected, interviewStarted, cameraTestPassed, isRecording, startRecording, getAvaAudioElement]);

  const endInterview = () => {
    sendTextMessage("I would like to end the interview now.");
  };

  // Download transcript
  const downloadTranscript = () => {
    const lines = messages.map(m => {
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${time}] ${m.role === 'user' ? 'Candidate' : 'Ava'}: ${m.content}`;
    }).join('\n\n');

    const header = `Voice Interview Transcript
Date: ${new Date().toLocaleDateString()}
Position: ${job?.title || 'Unknown'}
Company: ${job?.company_name || 'Unknown'}
Duration: ${formatTime(elapsedSeconds)}

---

`;

    const blob = new Blob([header + lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-transcript-${applicationId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format time for display
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate timer colors
  const totalSeconds = duration * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const percentUsed = (elapsedSeconds / totalSeconds) * 100;
  const timerColor = percentUsed > 90 ? 'text-red-400' : percentUsed > 80 ? 'text-amber-400' : 'text-muted-foreground';
  const timerPulse = percentUsed > 90;

  // Connection quality indicator
  const getConnectionIcon = () => {
    switch (connectionQuality) {
      case 'excellent': return <Wifi className="h-4 w-4 text-green-400" />;
      case 'good': return <Wifi className="h-4 w-4 text-yellow-400" />;
      case 'poor': return <WifiOff className="h-4 w-4 text-red-400" />;
      default: return <Wifi className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getConnectionLabel = () => {
    switch (connectionQuality) {
      case 'excellent': return 'Strong';
      case 'good': return 'Good';
      case 'poor': return 'Weak';
      default: return '...';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSubmitted && applicationId) {
    return <PhaseAlreadySubmitted applicationId={applicationId} phaseName="Voice Interview" />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Voice Interview</h1>
          <p className="text-muted-foreground">
            {job?.title} {job?.company_name && `at ${job.company_name}`}
          </p>
        </div>
        <Badge variant="outline" className="border-primary/50 text-primary">
          {stepId}
        </Badge>
      </div>

      {!interviewStarted ? (
        /* Pre-interview instructions */
        <div className="space-y-4">
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-primary" />
                Before You Begin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-muted-foreground">
                <p>You're about to have a voice conversation with our professional interviewer.</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>Find a quiet place with minimal background noise</li>
                  <li>Ensure your camera and microphone are working properly</li>
                  <li>Speak clearly and take your time with responses</li>
                  <li><strong>Important:</strong> Please wait for Ava to finish speaking before you respond</li>
                  <li>The interview will last approximately <strong>{duration} minutes</strong></li>
                  <li>Your interview will be <strong>video recorded</strong> for review</li>
                  <li>You can end the interview at any time by saying "I'd like to end the interview"</li>
                </ul>
              </div>

              {/* Camera Test Section */}
              {!cameraTestPassed && !cameraEnabled && (
                <div className="pt-4 border-t border-border">
                  <Button
                    onClick={enableCamera}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Camera className="h-5 w-5" />
                    Enable Camera & Microphone
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Required before starting the interview
                  </p>
                </div>
              )}

              {/* Camera Preview UI */}
              {cameraEnabled && !cameraTestPassed && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-4 border-t border-border"
                >
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-6 space-y-4">
                      <div className="relative aspect-video max-w-md mx-auto rounded-lg overflow-hidden bg-black">
                        <video
                          ref={videoPreviewRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover mirror"
                          style={{ transform: 'scaleX(-1)' }}
                        />
                        <Badge className="absolute top-2 left-2 bg-green-500 text-white">
                          <Video className="h-3 w-3 mr-1" />
                          Camera Ready
                        </Badge>
                      </div>
                      
                      {/* Mic Level Indicator */}
                      <div className="flex items-center justify-center gap-2">
                        <Mic className="h-4 w-4 text-muted-foreground" />
                        <div className="flex items-end gap-0.5 h-6">
                          {micLevels.map((level, i) => (
                            <motion.div
                              key={i}
                              className={`w-1.5 rounded-full ${level > 15 ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                              animate={{ height: Math.max(4, level / 4 + 4) }}
                              transition={{ duration: 0.05 }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground ml-1">
                          {micLevels.some(l => l > 15) ? "Mic working!" : "Speak to test mic"}
                        </span>
                      </div>
                      
                      <div className="text-center space-y-2">
                        <h3 className="font-semibold text-foreground">Camera & Mic Test</h3>
                        <p className="text-sm text-muted-foreground">
                          Check that you can see yourself and speak to test your microphone
                        </p>
                      </div>

                      {videoError && (
                        <p className="text-sm text-red-400 text-center">{videoError}</p>
                      )}

                      <div className="flex gap-2 justify-center pt-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            cleanupVideo();
                            setCameraEnabled(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={confirmCameraWorks}
                          className="bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          My Setup Works
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Camera Test Passed */}
              {cameraTestPassed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-sm text-green-400 pt-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Camera & microphone ready
                </motion.div>
              )}

              <div className="pt-4">
                <Button
                  onClick={startInterview}
                  className="w-full gap-2 bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
                  size="lg"
                  disabled={!cameraTestPassed}
                >
                  <Phone className="h-5 w-5" />
                  Start Voice Interview
                </Button>
                {!cameraTestPassed && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Please enable your camera first
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Active interview UI */
        <div className="space-y-4">
          {/* Video preview during interview */}
          <div className="relative">
            {/* Small video preview in corner */}
            <div className="fixed bottom-24 right-6 z-40 w-48 aspect-video rounded-lg overflow-hidden shadow-2xl border-2 border-primary/30 bg-black">
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {isRecording && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-medium text-white bg-black/50 px-1.5 py-0.5 rounded">REC</span>
                </div>
              )}
            </div>
          </div>

          {/* Connection status with timer */}
          <Card className="border-border bg-card/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Context-aware status indicator */}
                  
                  {/* CANDIDATE SPEAKING - Show animated audio bars */}
                  {isListening && !isSpeaking && (
                    <div className="flex items-end gap-0.5 h-12 px-2">
                      {audioLevels.map((level, i) => (
                        <motion.div
                          key={i}
                          className="w-2 rounded-full bg-emerald-500"
                          animate={{ height: Math.max(8, level * 0.4) }}
                          transition={{ duration: 0.05 }}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* AVA SPEAKING - Show pulsing speaker icon */}
                  {isSpeaking && (
                    <motion.div
                      className="w-12 h-12 rounded-full bg-gradient-to-r from-primary to-teal-400 flex items-center justify-center"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    >
                      <Volume2 className="h-6 w-6 text-white" />
                    </motion.div>
                  )}
                  
                  {/* AVA PROCESSING - Show thinking orb */}
                  {isProcessing && !isSpeaking && !isListening && (
                    <motion.div 
                      className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </motion.div>
                  )}
                  
                  {/* CONNECTING */}
                  {isConnecting && (
                    <motion.div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </motion.div>
                  )}
                  
                  {/* IDLE - Ready to listen */}
                  {isConnected && !isListening && !isSpeaking && !isProcessing && !isConnecting && (
                    <motion.div 
                      className="w-12 h-12 rounded-full bg-muted/30 border border-border flex items-center justify-center"
                      animate={{ scale: [1, 1.02, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Mic className="h-6 w-6 text-muted-foreground" />
                    </motion.div>
                  )}
                  
                  {/* DISCONNECTED */}
                  {!isConnected && !isConnecting && (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <MicOff className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Status Text */}
                  <div>
                    <p className="font-medium text-foreground">
                      {isConnecting
                        ? "Connecting..."
                        : !isConnected
                        ? "Disconnected"
                        : isListening && !isSpeaking
                        ? "You're speaking..."
                        : isSpeaking
                        ? "Ava is speaking..."
                        : isProcessing
                        ? "Ava is thinking..."
                        : "Ready to listen"}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {isConnecting
                          ? "Please wait..."
                          : !isConnected
                          ? "Interview ended"
                          : isListening && !isSpeaking
                          ? "I can hear you"
                          : isSpeaking
                          ? "Please wait for her to finish"
                          : isProcessing
                          ? "Preparing response..."
                          : "Speak naturally"}
                      </p>
                      {/* Thinking indicator dots */}
                      {isConnected && isProcessing && !isSpeaking && !isListening && (
                        <motion.div
                          className="flex gap-1"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Timer and controls */}
                <div className="flex items-center gap-4">
                  {/* Connection quality */}
                  {isConnected && (
                    <div className="flex items-center gap-1.5 text-xs">
                      {getConnectionIcon()}
                      <span className="text-muted-foreground">{getConnectionLabel()}</span>
                    </div>
                  )}

                  {/* Timer */}
                  {isConnected && (
                    <div className={`flex items-center gap-1.5 ${timerColor} ${timerPulse ? 'animate-pulse' : ''}`}>
                      <Clock className="h-4 w-4" />
                      <span className="font-mono text-sm font-medium">
                        {formatTime(elapsedSeconds)} / {formatTime(totalSeconds)}
                      </span>
                    </div>
                  )}

                  <Button
                    variant="destructive"
                    onClick={endInterview}
                    disabled={!isConnected}
                    className="gap-2"
                  >
                    <PhoneOff className="h-4 w-4" />
                    End Interview
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transcript */}
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg">Conversation</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <AnimatePresence>
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mb-4 ${
                        msg.role === "user" ? "text-right" : "text-left"
                      }`}
                    >
                      <div
                        className={`inline-block max-w-[80%] p-3 rounded-lg ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {/* Timestamp */}
                        <p className="text-[10px] opacity-60 mb-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {messages.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    The conversation will appear here...
                  </p>
                )}
                {/* Auto-scroll anchor */}
                <div ref={messagesEndRef} />
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Completion Screen */}
          {showCompletionScreen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
            >
              <Card className="border-primary/20 bg-card/95 backdrop-blur max-w-md mx-4">
                <CardContent className="py-12 text-center space-y-6">
                  {isUploading ? (
                    <>
                      <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-primary/20 to-teal-400/20 flex items-center justify-center">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-bold text-foreground">Uploading Recording...</h2>
                        <p className="text-muted-foreground">
                          Please wait while we save your interview
                        </p>
                        <div className="w-full max-w-xs mx-auto bg-muted rounded-full h-2 mt-4">
                          <div 
                            className="bg-gradient-to-r from-primary to-teal-400 h-2 rounded-full transition-all"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-primary to-teal-400 flex items-center justify-center">
                        <CheckCircle className="h-10 w-10 text-white" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-foreground">Interview Complete!</h2>
                        <p className="text-muted-foreground max-w-md mx-auto">
                          Thank you for speaking with Ava. We will review your interview and get back to you soon.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Duration: {formatTime(elapsedSeconds)}
                        </p>
                      </div>
                      <div className="flex gap-3 justify-center">
                        <Button
                          variant="outline"
                          onClick={downloadTranscript}
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Download Transcript
                        </Button>
                        <Button 
                          onClick={() => navigate(`/applications/${applicationId}`)}
                          className="bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
                        >
                          Return to Applications
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
