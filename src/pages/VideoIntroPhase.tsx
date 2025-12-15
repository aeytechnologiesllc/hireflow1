import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function VideoIntroPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [state, setState] = useState<"intro" | "recording" | "preview" | "submitting">("intro");
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
    const videoStep = workflowSteps?.find(s => s.id === stepId || s.type === "video_intro");
    return {
      maxDuration: videoStep?.config?.maxDuration || 120, // 2 minutes default
      prompt: videoStep?.config?.prompt || "Tell us about yourself and why you're interested in this position.",
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

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setHasPermissions(true);
      return true;
    } catch (error) {
      console.error("Error accessing camera/mic:", error);
      toast.error("Unable to access camera or microphone", {
        description: "Please grant permissions and try again.",
      });
      return false;
    }
  };

  const startRecording = async () => {
    if (!hasPermissions) {
      const granted = await requestPermissions();
      if (!granted) return;
    }

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
      setState("preview");
    };
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setState("recording");
    setRecordingTime(0);
    
    // Start timer
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
    setState("intro");
    setHasPermissions(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = async () => {
    if (!recordedBlob || !application) return;
    
    setIsSubmitting(true);
    setState("submitting");
    
    try {
      // For now, we'll store a placeholder URL since we don't have storage configured
      // In production, you'd upload the blob to Supabase Storage
      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      
      // Video intro is considered "passed" if completed (no scoring needed)
      const passed = true;
      const score = 100; // Full marks for completing video
      
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "video_intro",
          duration: recordingTime,
          recordedAt: new Date().toISOString(),
          completed: true,
          passed,
          score,
          // videoUrl would be set after upload
        },
        videoIntroResult: {
          duration: recordingTime,
          completed: true,
          passed,
          score,
        },
      };

      // Determine next phase based on processing mode
      const isAutoMode = application.jobs?.processing_mode !== "manual";
      
      const workflowSteps = application.jobs?.workflow_steps || [];
      const allPhases = [
        { id: "application", type: "application" },
        ...workflowSteps.map((step: any) => ({ id: step.id, type: step.type })),
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
        // Video intro always passes if completed, advance to next phase
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
          phase_ai_analysis: `Video intro: ${formatTime(recordingTime)} duration. COMPLETED`,
        })
        .eq("id", id!);

      if (error) throw error;

      navigate(`/applications/${id}`);
    } catch (error) {
      console.error("Error submitting video:", error);
      toast.error("Failed to submit video");
      setState("preview");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
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
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Record Your Introduction
          </CardTitle>
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Prompt */}
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">Prompt:</p>
            <p className="text-foreground">{videoConfig.prompt}</p>
          </div>

          {/* Video Area */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            {state === "intro" && !hasPermissions && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Camera className="h-16 w-16 text-muted-foreground" />
                <p className="text-muted-foreground text-center">
                  Click "Start Recording" to begin
                </p>
              </div>
            )}
            
            {(state === "intro" || state === "recording") && hasPermissions && (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            )}
            
            {state === "preview" && recordedUrl && (
              <video
                src={recordedUrl}
                controls
                className="w-full h-full object-cover"
              />
            )}

            {state === "recording" && (
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <Badge className="bg-red-500/90 text-white">
                  {formatTime(recordingTime)} / {formatTime(videoConfig.maxDuration)}
                </Badge>
              </div>
            )}
          </div>

          {/* Instructions */}
          {state === "intro" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Camera className="h-4 w-4 mt-0.5 text-primary" />
                <span>Make sure you're in a well-lit area with a clear background</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Mic className="h-4 w-4 mt-0.5 text-primary" />
                <span>Speak clearly and at a moderate pace</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 text-primary" />
                <span>Maximum recording time: {formatTime(videoConfig.maxDuration)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-4">
            {state === "intro" && (
              <Button onClick={startRecording} size="lg" className="gap-2">
                <Play className="h-5 w-5" />
                Start Recording
              </Button>
            )}
            
            {state === "recording" && (
              <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2">
                <Square className="h-5 w-5" />
                Stop Recording
              </Button>
            )}
            
            {state === "preview" && (
              <>
                <Button onClick={resetRecording} variant="outline" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Record Again
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Submit Video
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
