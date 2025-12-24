import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { 
  ArrowLeft, 
  Video, 
  Play,
  Square,
  RotateCcw,
  CheckCircle,
  Loader2,
  Camera
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";

interface ApplicationDetails {
  id: string;
  candidate_id: string;
  job_id: string;
  phase: string | null;
  notes: string | null;
  status: string;
  jobs: {
    title: string;
    processing_mode: string | null;
    passing_score: number | null;
    workflow_steps: any[] | null;
  } | null;
}

type RecordingState = "intro" | "camera_preview" | "recording" | "preview" | "submitting";

export default function VideoIntroPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [recordingState, setRecordingState] = useState<RecordingState>("intro");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: application, isLoading } = useQuery({
    queryKey: ["video-intro-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, workflow_steps)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as ApplicationDetails;
    },
    enabled: !!id && !!user,
  });

  const videoConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as any[] | null;
    const videoStep = workflowSteps?.find(s => s.id === stepId || s.type === "video_intro" || s.type === "video_message");
    return {
      maxDuration: videoStep?.config?.maxDuration || 60,
      prompt: videoStep?.config?.prompt || "Record a brief 60-second video introducing yourself.",
    };
  })();

  // Cleanup
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  // Connect stream to video
  useEffect(() => {
    if (streamRef.current && videoRef.current && recordingState === "camera_preview") {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [recordingState]);

  const enableCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setRecordingState("camera_preview");
    } catch (error) {
      console.error("Camera access error:", error);
      toast.error("Unable to access camera or microphone");
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setRecordingState("preview");
    };
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setRecordingState("recording");
    setRecordingTime(0);
    
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= videoConfig.maxDuration - 1) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.state !== "inactive" && mediaRecorderRef.current?.stop();
    timerRef.current && clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  };

  const resetRecording = () => {
    recordedUrl && URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingTime(0);
    setRecordingState("intro");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = async () => {
    if (!recordedBlob || !application || !user || isSubmitting) return;
    
    setIsSubmitting(true);
    setRecordingState("submitting");
    
    const isAutoMode = application.jobs?.processing_mode !== "manual";
    
    // Show evaluation screen immediately for autopilot mode
    if (isAutoMode) {
      setEvaluationState("evaluating");
    }
    
    try {
      // 1. Upload video
      const fileName = `${user.id}/${id}-${stepId}-${Date.now()}.webm`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("videos")
        .upload(fileName, recordedBlob, { contentType: "video/webm" });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 2. Get public URL
      const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);
      const videoUrl = urlData.publicUrl;

      // 3. Build phases list to determine next phase
      const workflowSteps = application.jobs?.workflow_steps as any[] || [];
      const quizQuestions = (application.jobs as any)?.quiz_questions as any[] | undefined;
      
      // Extract voice_interview step (goes AFTER review)
      const voiceInterviewStep = workflowSteps.find((step: any) => step.type === 'voice_interview');
      
      const allPhases: { id: string; type: string; title: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];
      
      // Add quiz phase if quiz_questions exist
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }
      
      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      workflowSteps.filter((step: any) => step.type !== 'voice_interview').forEach((step: any) => {
        allPhases.push({ id: step.id, type: step.type, title: step.title || step.type });
      });
      
      // Add Review phase
      allPhases.push({ id: "review", type: "review", title: "Review" });
      
      // Add voice_interview AFTER Review if it exists
      if (voiceInterviewStep) {
        allPhases.push({ 
          id: voiceInterviewStep.id, 
          type: "voice_interview", 
          title: voiceInterviewStep.title || "Ava Interview" 
        });
      }
      
      // Add final phases
      allPhases.push(
        { id: "interview", type: "interview", title: "Interview" },
        { id: "hired", type: "hired", title: "Hired" }
      );
      
      // Find current step index
      let currentIndex = allPhases.findIndex((p) => p.id === stepId);
      if (currentIndex === -1 && application.phase) {
        currentIndex = allPhases.findIndex(
          (p) => p.id === application.phase || p.type === application.phase
        );
      }

      // Determine next phase (video always passes since it's completion-based)
      let newPhase = application.phase;
      let nextPhase: { id: string; type: string; title: string } | null = null;
      if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
        nextPhase = allPhases[currentIndex + 1];
      }
      
      // Advance to next phase in auto mode, OR if next phase is review (last candidate step)
      if (isAutoMode || nextPhase?.type === "review") {
        if (nextPhase) {
          newPhase = nextPhase.id;
          
          // DON'T show "Start Next Phase" button if next phase is review (only in auto mode)
          if (isAutoMode && nextPhase.type !== "review") {
            setNextPhaseInfo({
              id: nextPhase.id,
              title: nextPhase.title,
            });
          }
        }
      }

      // 4. Update database
      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      const currentStep = workflowSteps?.find((s: any) => s.id === stepId);
      const stepType = currentStep?.type || "video_intro";

      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: stepType,
          duration: recordingTime,
          recordedAt: new Date().toISOString(),
          completed: true,
          passed: true,
          score: 100,
          videoUrl,
          uploadMethod: "recorded",
        },
        videoIntroResult: {
          duration: recordingTime,
          completed: true,
          passed: true,
          score: 100,
          videoUrl,
          uploadMethod: "recorded",
        },
        videoIntroUrl: videoUrl,
      };

      const { error: dbError } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase: newPhase,
          phase_ai_analysis: `Video intro: ${formatTime(recordingTime)} duration. COMPLETED. Video URL: ${videoUrl}`,
        })
        .eq("id", id!);

      if (dbError) {
        throw new Error(`Database update failed: ${dbError.message}`);
      }

      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });

      // Trigger AVA analysis via backend edge function (bypasses RLS issues)
      supabase.functions.invoke("trigger-ava-analysis", {
        body: { applicationId: id! },
      }).catch(err => console.error("[VideoIntroPhase] AVA analysis trigger failed:", err));

      if (isAutoMode) {
        // Show passed evaluation screen
        setEvaluationState("passed");
      } else {
        // Manual mode - toast and navigate
        toast.success("Video submitted!", {
          description: "Your video has been recorded. The employer will review it.",
        });
        navigate(`/applications/${id}`);
      }
      
    } catch (error) {
      console.error("Submit error:", error);
      
      // Verify if the upload actually succeeded despite the error
      try {
        const { data: checkData } = await supabase
          .from("applications")
          .select("notes")
          .eq("id", id!)
          .single();
        
        if (checkData?.notes) {
          const checkNotes = JSON.parse(checkData.notes);
          if (checkNotes[stepId!]?.videoUrl || checkNotes.videoIntroUrl) {
            // Actually succeeded!
            queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
            supabase.functions.invoke("trigger-ava-analysis", {
              body: { applicationId: id! },
            }).catch(err => console.error("[VideoIntroPhase] AVA analysis trigger failed:", err));

            if (isAutoMode) {
              setEvaluationState("passed");
            } else {
              toast.success("Video submitted!", {
                description: "Your video has been recorded. The employer will review it.",
              });
              navigate(`/applications/${id}`);
            }
            return;
          }
        }
      } catch {
        // Verification failed, show original error
      }
      
      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setRecordingState("preview");
      setEvaluationState(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for evaluation screen
  const handleStartNextPhase = () => {
    if (!nextPhaseInfo || !application) return;
    
    const workflowSteps = application.jobs?.workflow_steps as any[] || [];
    const nextStep = workflowSteps.find((s: any) => s.id === nextPhaseInfo.id);
    
    if (nextStep) {
      const phaseRoutes: Record<string, string> = {
        typing_test: "typing-test",
        video_intro: "video-intro",
        video_message: "video-intro",
        portfolio_upload: "portfolio",
        chat_simulation: "chat-simulation",
        chat_interview: "chat-interview",
        sales_simulation: "sales-simulation",
        voice_interview: "voice-interview",
        quiz: "quiz",
      };
      const route = phaseRoutes[nextStep.type] || nextStep.type;
      navigate(`/applications/${id}/${route}/${nextPhaseInfo.id}`);
    } else if (nextPhaseInfo.id === "review") {
      navigate(`/applications/${id}`);
    } else {
      navigate(`/applications/${id}`);
    }
  };

  const handleDoLater = () => {
    navigate(`/applications/${id}`);
  };

  // Check if already submitted
  const existingResult = (() => {
    if (!application?.notes) return null;
    try {
      const notes = JSON.parse(application.notes);
      return notes.videoIntroResult || notes.videoIntroUrl ? { videoUrl: notes.videoIntroUrl } : null;
    } catch {
      return null;
    }
  })();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Application Not Found</h2>
            <Button onClick={() => navigate("/applications")} className="mt-4">
              Back to Applications
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (existingResult) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName="Video Introduction"
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  // Show evaluation screen for autopilot mode
  if (evaluationState) {
    return (
      <EvaluationScreen
        state={evaluationState}
        onStartNextPhase={nextPhaseInfo ? handleStartNextPhase : undefined}
        onDoLater={handleDoLater}
        nextPhaseName={nextPhaseInfo?.title}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate(`/applications/${id}`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Application
        </Button>
        <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
          <Video className="h-4 w-4" />
          Video Introduction
        </Badge>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Record Your Video Introduction
          </CardTitle>
          <p className="text-muted-foreground">For: {application.jobs?.title}</p>
        </CardHeader>
        
        <CardContent className="p-6 space-y-6">
          {/* Prompt */}
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-5 border border-primary/20">
            <p className="text-xs uppercase tracking-wider text-primary font-medium mb-2">Instructions</p>
            <p className="text-foreground">{videoConfig.prompt}</p>
          </div>

          <AnimatePresence mode="wait">
            {/* Recording States */}
            {recordingState !== "preview" && recordingState !== "submitting" && (
              <motion.div
                key="record"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Video Area */}
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border/50">
                  {recordingState === "intro" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-muted/20 to-background/80">
                      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                        <Camera className="h-10 w-10 text-primary" />
                      </div>
                      <p className="text-muted-foreground text-center px-4">
                        Click below to enable your camera and microphone
                      </p>
                    </div>
                  )}
                  
                  {(recordingState === "camera_preview" || recordingState === "recording") && (
                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  )}

                  {recordingState === "camera_preview" && (
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                      <Badge className="bg-emerald-500/90 text-white border-0">Camera Ready</Badge>
                    </div>
                  )}

                  {recordingState === "recording" && (
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <Badge className="bg-red-500/90 text-white border-0">
                        {formatTime(recordingTime)} / {formatTime(videoConfig.maxDuration)}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-4">
                  {recordingState === "intro" && (
                    <Button onClick={enableCamera} size="lg" className="gap-2 px-8">
                      <Camera className="h-5 w-5" />
                      Enable Camera
                    </Button>
                  )}
                  
                  {recordingState === "camera_preview" && (
                    <Button onClick={startRecording} size="lg" className="gap-2 px-8 bg-red-600 hover:bg-red-700">
                      <Play className="h-5 w-5" />
                      Start Recording
                    </Button>
                  )}
                  
                  {recordingState === "recording" && (
                    <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2 px-8">
                      <Square className="h-5 w-5" />
                      Stop Recording
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Preview State */}
            {recordingState === "preview" && recordedUrl && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border/50">
                  <video ref={previewRef} src={recordedUrl} controls className="w-full h-full object-cover" />
                  <div className="absolute top-4 left-4">
                    <Badge className="bg-primary/90 text-white border-0 gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {formatTime(recordingTime)} recorded
                    </Badge>
                  </div>
                </div>

                <div className="flex justify-center gap-4">
                  <Button onClick={resetRecording} variant="outline" size="lg" className="gap-2 px-6">
                    <RotateCcw className="h-5 w-5" />
                    Re-record
                  </Button>
                  <Button onClick={handleSubmit} size="lg" className="gap-2 px-8 bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle className="h-5 w-5" />
                    Submit Video
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Submitting State */}
            {recordingState === "submitting" && (
              <motion.div
                key="submitting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-16 gap-4"
              >
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <p className="text-foreground font-medium">Uploading your video...</p>
                <p className="text-muted-foreground text-sm">This may take a moment</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tips */}
          {recordingState !== "submitting" && (
            <div className="bg-muted/30 rounded-xl p-5 space-y-3">
              <h4 className="font-medium text-foreground text-sm">Tips for a great video:</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  "Find good lighting (face a window)",
                  "Choose a quiet location",
                  "Look at the camera, not yourself",
                  "Speak clearly and naturally",
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
