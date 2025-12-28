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
import { Loader2, Mic, MicOff, Phone, PhoneOff, Volume2, CheckCircle, Download, Clock, Wifi, WifiOff, Video, VideoOff, Camera, RefreshCw, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { AvaAvatar, useAvaExpression } from "@/components/AvaAvatar";

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
  const [isProcessingEnd, setIsProcessingEnd] = useState(false);
  const [isUserEndingInterview, setIsUserEndingInterview] = useState(false); // Immediate loading when user clicks End
  const [justFinishedSpeaking, setJustFinishedSpeaking] = useState(false);

  // Camera/video states
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraTestPassed, setCameraTestPassed] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null); // Shared mic stream
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
    // Ignore empty or whitespace-only transcripts
    const cleanText = text.trim();
    if (!cleanText) return;
    
    const timestamp = Date.now();
    
    setMessages(prev => {
      // If role changed from the current streaming message, mark it complete and start new
      if (currentMessageRoleRef.current && currentMessageRoleRef.current !== role) {
        // Mark previous message as complete and filter out empty messages
        const updatedPrev = prev.map(m => 
          m.id === currentMessageIdRef.current ? { ...m, isComplete: true } : m
        ).filter(m => m.content.trim().length > 0);
        
        // Start a new message
        messageCounterRef.current += 1;
        const newId = `msg-${messageCounterRef.current}-${timestamp}`;
        currentMessageIdRef.current = newId;
        currentMessageRoleRef.current = role;
        
        return [...updatedPrev, { 
          id: newId, 
          role, 
          content: cleanText, 
          timestamp, 
          isComplete: false 
        }];
      }
      
      // Same role - check if we have a current streaming message
      if (currentMessageIdRef.current && currentMessageRoleRef.current === role) {
        // Append to existing message with space
        return prev.map(m => 
          m.id === currentMessageIdRef.current 
            ? { ...m, content: m.content + ' ' + cleanText } 
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
        content: cleanText, 
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
    
    // Show completion screen IMMEDIATELY with processing state
    setIsProcessingEnd(true);
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

      // STOP CAMERA after recording is handled
      cleanupVideo();

      // Build full timestamped transcript for employer download
      const transcript = messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        formatted_time: new Date(m.timestamp).toISOString()
      }));

      // Save result AND transcript to database
      const { error } = await supabase
        .from("applications")
        .update({
          voice_interview_result: evaluation,
          voice_interview_transcript: transcript,
          phase_ai_analysis: evaluation.summary,
        })
        .eq("id", applicationId);

      if (error) throw error;
      
      // Trigger AVA analysis in background (fire-and-forget)
      triggerAvaAnalysis(applicationId!).catch(console.error);
    } catch (error) {
      console.error("Error saving interview result:", error);
      toast.error("Failed to save interview results");
      // Still cleanup camera on error too
      cleanupVideo();
    } finally {
      // Done processing - show completion state
      setIsProcessingEnd(false);
    }
  }, [applicationId, messages, stopRecording, uploadRecording, cleanupVideo]);

  const {
    isConnected,
    isConnecting,
    isSpeaking,
    isListening,
    isProcessing,
    isStuck,
    isEndingInterview,
    reconnectAttempts,
    error: voiceError,
    audioLevels,
    connectionQuality,
    connect,
    disconnect,
    sendTextMessage,
    getAvaAudioElement,
    retryConnection,
    nudgeAva,
  } = useAvaVoice({
    mode: "interview",
    applicationId,
    language,
    duration,
    // Pass the shared mic stream so both WebRTC and video recorder use the same stream
    // This ensures candidate audio is captured in the recording
    externalMicStream: micStream,
    onTranscript: handleTranscript,
    onInterviewEnd: handleInterviewEnd,
  });

  // Compute AVA expression from state
  const avaExpression = useAvaExpression({
    isSpeaking,
    isListening,
    isProcessing,
    isConnected,
    justFinishedSpeaking,
  });

  // Track when user finishes speaking for encouraging expression
  const wasListeningRef = useRef(false);
  useEffect(() => {
    if (isListening && !isSpeaking) {
      wasListeningRef.current = true;
    } else if (wasListeningRef.current && !isListening && isProcessing) {
      // User just stopped speaking, show encouraging expression briefly
      setJustFinishedSpeaking(true);
      const timer = setTimeout(() => setJustFinishedSpeaking(false), 1500);
      wasListeningRef.current = false;
      return () => clearTimeout(timer);
    }
  }, [isListening, isSpeaking, isProcessing]);

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

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!applicationId) return;
    
    const channel = supabase
      .channel(`voice-interview-phase-updates-${applicationId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${applicationId}`,
      }, (payload) => {
        console.log('[VoiceInterviewPhase] Application updated via realtime:', payload);
        // Refetch application data when it changes (e.g., phase reset)
        loadApplicationData();
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
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
      // Store the stream to share with voice hook
      setMicStream(stream);
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

      // Check if already submitted - but allow re-submission if reconsidered (status is pending)
      if (app.voice_interview_result && app.status !== "pending") {
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
    setIsUserEndingInterview(true); // Show loading immediately
    sendTextMessage("I would like to end the interview now.");
  };

  // Download transcript
  const downloadTranscript = () => {
    const lines = messages.map(m => {
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${time}] ${m.role === 'user' ? 'Candidate' : 'Ava'}: ${m.content}`;
    }).join('\n\n');

    const header = `${videoEnabled ? 'Video' : 'Voice'} Interview Transcript
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
    return <PhaseAlreadySubmitted applicationId={applicationId} phaseName={videoEnabled ? "Video Interview" : "Voice Interview"} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{videoEnabled ? 'Video Interview' : 'Voice Interview'}</h1>
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
                {videoEnabled ? <Video className="h-5 w-5 text-primary" /> : <Volume2 className="h-5 w-5 text-primary" />}
                Before You Begin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-muted-foreground">
                <p>You're about to have a {videoEnabled ? 'video interview' : 'voice conversation'} with our professional interviewer.</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>Find a quiet place with minimal background noise</li>
                  <li>Ensure your {videoEnabled ? 'camera and microphone are' : 'microphone is'} working properly</li>
                  <li>Speak clearly and take your time with responses</li>
                  <li><strong>Important:</strong> Please wait for Ava to finish speaking before you respond</li>
                  <li>The interview will last approximately <strong>{duration} minutes</strong></li>
                  <li>Your interview will be <strong>{videoEnabled ? 'video' : 'audio'} recorded</strong> for review</li>
                  <li>You can end the interview at any time by saying "I'd like to end the interview"</li>
                </ul>
              </div>

              {/* Camera/Microphone Test Section */}
              {!cameraTestPassed && !cameraEnabled && (
                <div className="pt-4 border-t border-border">
                  <Button
                    onClick={enableCamera}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {videoEnabled ? <Camera className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    {videoEnabled ? 'Enable Camera & Microphone' : 'Enable Microphone'}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Required before starting the interview
                  </p>
                </div>
              )}

              {/* Camera/Microphone Preview UI */}
              {cameraEnabled && !cameraTestPassed && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-4 border-t border-border"
                >
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-6 space-y-4">
                      {/* Only show video preview if video is enabled */}
                      {videoEnabled && (
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
                      )}
                      
                      {/* Mic Level Indicator - larger for audio-only mode */}
                      <div className={`flex items-center justify-center gap-2 ${!videoEnabled ? 'py-8' : ''}`}>
                        <Mic className={`${videoEnabled ? 'h-4 w-4' : 'h-6 w-6'} text-muted-foreground`} />
                        <div className={`flex items-end gap-0.5 ${videoEnabled ? 'h-6' : 'h-12'}`}>
                          {micLevels.map((level, i) => (
                            <motion.div
                              key={i}
                              className={`${videoEnabled ? 'w-1.5' : 'w-2'} rounded-full ${level > 15 ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
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
                        <h3 className="font-semibold text-foreground">
                          {videoEnabled ? 'Camera & Mic Test' : 'Microphone Test'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {videoEnabled 
                            ? 'Check that you can see yourself and speak to test your microphone'
                            : 'Speak to test your microphone is working properly'}
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

              {/* Camera/Mic Test Passed */}
              {cameraTestPassed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-sm text-green-400 pt-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {videoEnabled ? 'Camera & microphone ready' : 'Microphone ready'}
                </motion.div>
              )}

              <div className="pt-4">
                <Button
                  onClick={startInterview}
                  className="w-full gap-2 bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
                  size="lg"
                  disabled={!cameraTestPassed}
                >
                  {videoEnabled ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                  {videoEnabled ? 'Start Video Interview' : 'Start Voice Interview'}
                </Button>
                {!cameraTestPassed && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Please enable your {videoEnabled ? 'camera' : 'microphone'} first
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Active interview UI */
        <div className="space-y-4 relative">
          {/* Wrapping Up Interview Overlay - shows immediately when user clicks End OR when Ava triggers end */}
          <AnimatePresence>
            {(isEndingInterview || isUserEndingInterview) && !showCompletionScreen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-background/95 z-50 flex flex-col items-center justify-center"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-center space-y-4"
                >
                  <div className="relative mx-auto w-16 h-16">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Volume2 className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {isUserEndingInterview && !isEndingInterview 
                      ? "Ending Interview..."
                      : "Wrapping Up Interview..."}
                  </h2>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                    {isUserEndingInterview && !isEndingInterview 
                      ? "Asking Ava to wrap up. She may have a few closing questions."
                      : "Ava is finishing up. Your responses are being saved."}
                  </p>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg max-w-sm mx-auto"
                  >
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <p>Please don't refresh or close this page</p>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Recording indicator - conditional based on mode */}
          <div className="relative">
            {videoEnabled ? (
              /* Video mode: Small video preview in corner */
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
            ) : (
              /* Audio-only mode: Audio visualizer orb */
              <div className="fixed bottom-24 right-6 z-40 w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-2xl border-2 border-primary/30 bg-black/90">
                <div className="flex items-end gap-0.5 h-8">
                  {micLevels.map((level, i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 rounded-full bg-primary"
                      animate={{ height: Math.max(4, level / 3) }}
                      transition={{ duration: 0.05 }}
                    />
                  ))}
                </div>
                {isRecording && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-medium text-white">REC</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Connection status with timer */}
          <Card className="border-border bg-card/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* AVA Avatar - Real-time animated */}
                  <AvaAvatar
                    expression={isConnecting ? "neutral" : !isConnected ? "neutral" : avaExpression}
                    audioLevels={audioLevels}
                    size="md"
                    showStatus={false}
                  />
                  
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

              {/* Stuck Detection UI */}
              {isStuck && isConnected && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-amber-400 text-sm font-medium">
                        Ava seems to be taking a while to respond
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This could be a connection issue. Try prompting Ava or reconnecting.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={nudgeAva}
                          className="gap-2 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          <Volume2 className="h-4 w-4" />
                          Prompt Ava
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={retryConnection}
                          className="gap-2 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Reconnect
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Connection Error UI */}
              {voiceError && !isConnected && !showCompletionScreen && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <WifiOff className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-red-400 text-sm font-medium">
                        Connection Lost
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {voiceError}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={retryConnection}
                        className="gap-2 mt-3 border-red-500/30 hover:bg-red-500/10"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retry Connection
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Reconnection Progress */}
              {isConnecting && reconnectAttempts > 0 && (
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                    <div>
                      <p className="text-blue-400 text-sm font-medium">
                        Reconnecting...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Attempt {reconnectAttempts} of 3
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
                  {isProcessingEnd || isUploading ? (
                    <>
                      <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-primary/20 to-teal-400/20 flex items-center justify-center">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-bold text-foreground">
                          {isUploading ? "Uploading Recording..." : "Processing Interview..."}
                        </h2>
                        <p className="text-muted-foreground">
                          {isUploading 
                            ? "Please wait while we save your interview" 
                            : "Preparing your recording for upload"}
                        </p>
                        
                        {/* Warning message - always visible during processing/uploading */}
                        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          <p className="text-amber-400 text-sm font-medium flex items-center justify-center gap-2">
                            <span className="text-lg">⚠️</span>
                            Please do not refresh or navigate away
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your interview is being saved. This may take a moment.
                          </p>
                        </div>
                        
                        {/* Progress bar only during upload */}
                        {isUploading && (
                          <div className="w-full max-w-xs mx-auto bg-muted rounded-full h-2 mt-4">
                            <div 
                              className="bg-gradient-to-r from-primary to-teal-400 h-2 rounded-full transition-all"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        )}
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
