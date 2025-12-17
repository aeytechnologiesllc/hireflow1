import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Mic, MicOff, Phone, PhoneOff, Volume2, CheckCircle } from "lucide-react";
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [interviewResult, setInterviewResult] = useState<any>(null);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);

  // Refs for tracking current streaming message and auto-scroll
  const currentMessageIdRef = useRef<string | null>(null);
  const currentMessageRoleRef = useRef<'user' | 'assistant' | null>(null);
  const messageCounterRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    
    try {
      // Save result to database
      const { error } = await supabase
        .from("applications")
        .update({
          voice_interview_result: evaluation,
          phase_ai_analysis: evaluation.summary,
        })
        .eq("id", applicationId);

      if (error) throw error;

      // Show completion screen instead of toast + redirect
      setShowCompletionScreen(true);
      
      // Trigger AVA analysis in background (fire-and-forget)
      triggerAvaAnalysis(applicationId!).catch(console.error);
    } catch (error) {
      console.error("Error saving interview result:", error);
      toast.error("Failed to save interview results");
    }
  }, [applicationId]);

  const {
    isConnected,
    isConnecting,
    isSpeaking,
    connect,
    disconnect,
    sendTextMessage,
  } = useAvaVoice({
    mode: "interview",
    applicationId,
    language,
    duration,
    onTranscript: handleTranscript,
    onInterviewEnd: handleInterviewEnd,
  });

  useEffect(() => {
    loadApplicationData();
  }, [applicationId]);

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
    await connect();
  };

  const endInterview = () => {
    sendTextMessage("I would like to end the interview now.");
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
                <li>Ensure your microphone is working properly</li>
                <li>Speak clearly and take your time with responses</li>
                <li><strong>Important:</strong> Please wait for Ava to finish speaking before you respond</li>
                <li>The interview will last approximately <strong>{duration} minutes</strong></li>
                <li>You can end the interview at any time by saying "I'd like to end the interview"</li>
              </ul>
            </div>

            <div className="pt-4">
              <Button
                onClick={startInterview}
                className="w-full gap-2 bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
                size="lg"
              >
                <Phone className="h-5 w-5" />
                Start Voice Interview
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Active interview UI */
        <div className="space-y-4">
          {/* Connection status */}
          <Card className="border-border bg-card/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Animated orb */}
                  <motion.div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      isConnected
                        ? "bg-gradient-to-r from-primary to-teal-400"
                        : "bg-muted"
                    }`}
                    animate={
                      isSpeaking
                        ? { scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }
                        : isConnected
                        ? { scale: [1, 1.05, 1] }
                        : {}
                    }
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    {isConnecting ? (
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    ) : isConnected ? (
                      <Mic className="h-6 w-6 text-white" />
                    ) : (
                      <MicOff className="h-6 w-6 text-muted-foreground" />
                    )}
                  </motion.div>
                  <div>
                    <p className="font-medium text-foreground">
                      {isConnecting
                        ? "Connecting..."
                        : isConnected
                        ? isSpeaking
                          ? "Ava is speaking..."
                          : "Listening..."
                        : "Disconnected"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isConnected
                        ? isSpeaking
                          ? "Please wait for her to finish"
                          : "Speak naturally"
                        : "Click to reconnect"}
                    </p>
                  </div>
                </div>
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
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-primary to-teal-400 flex items-center justify-center">
                    <CheckCircle className="h-10 w-10 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-foreground">Interview Complete!</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Thank you for speaking with Ava. We will review your interview and get back to you soon.
                    </p>
                  </div>
                  <Button 
                    onClick={() => navigate(`/applications/${applicationId}`)}
                    className="bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
                  >
                    Return to Applications
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
