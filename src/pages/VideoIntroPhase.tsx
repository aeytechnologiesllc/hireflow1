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
import { 
  ArrowLeft, 
  Video, 
  Play,
  Square,
  RotateCcw,
  CheckCircle,
  Loader2,
  Camera,
  Mic,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

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
  
  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("intro");
  const [hasPermissions, setHasPermissions] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch application details
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

  // Get video intro config
  const videoConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as any[] | null;
    const videoStep = workflowSteps?.find(s => s.id === stepId || s.type === "video_intro" || s.type === "video_message");
    return {
      maxDuration: videoStep?.config?.maxDuration || 60,
      prompt: videoStep?.config?.prompt || "Record a brief 60-second video introducing yourself. Share your name, a bit about your background, why you're interested in this role, and what makes you a great fit.",
    };
  })();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  // Connect stream to video element after it renders
  useEffect(() => {
    if (streamRef.current && videoRef.current && hasPermissions && recordingState === "camera_preview") {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [hasPermissions, recordingState]);

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      setHasPermissions(true);
      setRecordingState("camera_preview");
      return true;
    } catch (error) {
      console.error("Error accessing camera/mic:", error);
      toast.error("Unable to access camera or microphone", {
        description: "Please grant permissions and try again.",
      });
      return false;
    }
  };

  const startCameraPreview = async () => {
    await requestPermissions();
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm",
    });
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const resetRecording = async () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingTime(0);
    setRecordingState("intro");
    setHasPermissions(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = async () => {
    if (!recordedBlob || !application || !user) return;
    
    setIsSubmitting(true);
    setRecordingState("submitting");
    
    try {
      const fileName = `${user.id}/${id}-${stepId}-${Date.now()}.webm`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("videos")
        .upload(fileName, recordedBlob, {
          contentType: "video/webm",
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("videos")
        .getPublicUrl(fileName);

      const videoUrl = urlData.publicUrl;

      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      
      const passed = true;
      const score = 100;
      const duration = recordingTime;
      
      // Get the actual step type from workflow
      const workflowSteps = application.jobs?.workflow_steps as any[] | null;
      const currentStep = workflowSteps?.find((s: any) => s.id === stepId);
      const stepType = currentStep?.type || "video_intro";
      
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: stepType,
          duration,
          recordedAt: new Date().toISOString(),
          completed: true,
          passed,
          score,
          videoUrl,
          uploadMethod: "recorded",
        },
        videoIntroResult: {
          duration,
          completed: true,
          passed,
          score,
          videoUrl,
          uploadMethod: "recorded",
        },
        videoIntroUrl: videoUrl,
      };

      const isAutoMode = application.jobs?.processing_mode !== "manual";
      
      const allPhases = [
        { id: "application", type: "application" },
        ...(workflowSteps || []).map((step: any) => ({ id: step.id, type: step.type })),
        { id: "review", type: "review" },
        { id: "interview", type: "interview" },
        { id: "hired", type: "hired" },
      ];
      
      let currentIndex = allPhases.findIndex((p) => p.id === stepId);
      if (currentIndex === -1 && application.phase) {
        currentIndex = allPhases.findIndex(
          (p) => p.id === application.phase || p.type === application.phase
        );
      }
      
      let newPhase = application.phase;
      const newStatus = application.status;

      if (isAutoMode) {
        if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
          newPhase = allPhases[currentIndex + 1].id;
        }
        toast.success("Video introduction submitted!", {
          description: "Great job! You have advanced to the next phase.",
        });
      } else {
        toast.success("Video introduction submitted!", {
          description: "Your video has been recorded. The employer will review your submission.",
        });
      }

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase: newPhase,
          status: newStatus as "pending" | "reviewing" | "interview" | "offered" | "hired" | "rejected",
          phase_ai_analysis: `Video intro: ${formatTime(duration)} duration. COMPLETED. Video URL: ${videoUrl}`,
        })
        .eq("id", id!);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });

      navigate(`/applications/${id}`);
    } catch (error) {
      console.error("Error submitting video:", error);
      toast.error("Failed to upload video");
      setRecordingState("preview");
    } finally {
      setIsSubmitting(false);
    }
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

  const hasPreview = !!recordedUrl;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => navigate(`/applications/${id}`)} 
          className="gap-2"
        >
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
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Prompt */}
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-5 border border-primary/20">
            <p className="text-xs uppercase tracking-wider text-primary font-medium mb-2">Instructions</p>
            <p className="text-foreground">{videoConfig.prompt}</p>
          </div>

          <AnimatePresence mode="wait">
            {/* Recording Flow */}
            {!hasPreview && (
              <motion.div
                key="record"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Video Area */}
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border/50">
                  {/* Intro state - no permissions yet */}
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
                  
                  {/* Camera preview and recording states - show video feed */}
                  {(recordingState === "camera_preview" || recordingState === "recording") && (
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Camera preview indicator */}
                  {recordingState === "camera_preview" && (
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                      <Badge className="bg-emerald-500/90 text-white border-0">
                        Camera Ready
                      </Badge>
                    </div>
                  )}

                  {/* Recording indicator */}
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
                    <Button onClick={startCameraPreview} size="lg" className="gap-2 px-8">
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

                {/* Tips */}
                <div className="bg-muted/30 rounded-xl p-5 space-y-3">
                  <h4 className="font-medium text-foreground text-sm">Tips for a great video:</h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Camera className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>Find a well-lit area with a clean background</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Mic className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>Speak clearly and maintain eye contact</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Video className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>Keep it focused and professional</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                      <span>Maximum {formatTime(videoConfig.maxDuration)} duration</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Preview Mode */}
            {hasPreview && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Preview Video */}
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border/50">
                  <video
                    src={recordedUrl!}
                    controls
                    className="w-full h-full object-contain"
                  />
                  
                  <div className="absolute top-4 left-4">
                    <Badge className="bg-emerald-500/90 text-white border-0 gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Recording Complete
                    </Badge>
                  </div>
                </div>

                {/* Recording Info */}
                <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Video className="h-4 w-4" />
                    Duration: {formatTime(recordingTime)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={resetRecording} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Record Again
                  </Button>
                  
                  <Button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting}
                    className="gap-2 px-8"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Submit Video
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
