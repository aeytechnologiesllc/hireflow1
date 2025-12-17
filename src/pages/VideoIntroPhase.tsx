import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  AlertCircle,
  Upload,
  FileVideo,
  X
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { compressVideo, shouldCompress, formatFileSize as formatFileSizeUtil, CompressionProgress, isCompressionSupported, CompressionNotSupportedError } from "@/utils/videoCompression";

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

type Mode = "select" | "record" | "upload";
type RecordingState = "intro" | "camera_preview" | "recording" | "preview" | "submitting";

export default function VideoIntroPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Mode selection state
  const [mode, setMode] = useState<Mode>("select");
  
  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("intro");
  const [hasPermissions, setHasPermissions] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedVideoDuration, setUploadedVideoDuration] = useState<number>(0);
  
  // Compression state
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<CompressionProgress | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [originalFileSize, setOriginalFileSize] = useState<number>(0);
  const compressionAbortRef = useRef<AbortController | null>(null);
  
  // Common state
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadedVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (uploadedPreviewUrl) {
        URL.revokeObjectURL(uploadedPreviewUrl);
      }
    };
  }, [recordedUrl, uploadedPreviewUrl]);

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

  const resetUpload = () => {
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    if (compressionAbortRef.current) {
      compressionAbortRef.current.abort();
    }
    setUploadedFile(null);
    setUploadedPreviewUrl(null);
    setCompressedBlob(null);
    setCompressionProgress(null);
    setIsCompressing(false);
    setOriginalFileSize(0);
    setUploadedVideoDuration(0);
  };

  const goBackToSelect = () => {
    resetRecording();
    resetUpload();
    setMode("select");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // File upload handlers
  const validateFile = (file: File): boolean => {
    const maxSize = 500 * 1024 * 1024; // 500MB max input (will compress if needed)
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
      toast.error("Invalid file format", {
        description: "Please upload a video file (MP4, WebM, MOV, AVI, MKV)",
      });
      return false;
    }
    
    if (file.size > maxSize) {
      toast.error("File too large", {
        description: "Maximum file size is 500MB",
      });
      return false;
    }
    
    return true;
  };

  const handleFileSelect = async (file: File) => {
    if (!validateFile(file)) return;
    
    setUploadedFile(file);
    setUploadedPreviewUrl(URL.createObjectURL(file));
    setOriginalFileSize(file.size);
    setCompressedBlob(null);
    
    // Check if compression is needed (files > 50MB)
    if (shouldCompress(file)) {
      // Check if compression is supported before attempting
      if (!isCompressionSupported()) {
        // File is large but compression not supported - warn user but allow upload if under storage limit
        const storageLimitMB = 100; // Supabase storage limit
        if (file.size > storageLimitMB * 1024 * 1024) {
          toast.error("File too large for upload", {
            description: `Video compression is not available. Please upload a file under ${storageLimitMB}MB, or try recording directly.`,
          });
          resetUpload();
          return;
        }
        toast.warning("Video compression not available", {
          description: "Your video will be uploaded without compression. For best results, record directly instead.",
        });
        return;
      }
      
      setIsCompressing(true);
      compressionAbortRef.current = new AbortController();
      
      try {
        const result = await compressVideo(
          file,
          (progress) => setCompressionProgress(progress),
          compressionAbortRef.current.signal
        );
        
        setCompressedBlob(result.blob);
        setUploadedPreviewUrl(URL.createObjectURL(result.blob));
        
        toast.success("Video compressed successfully!", {
          description: `${formatFileSizeUtil(result.originalSize)} → ${formatFileSizeUtil(result.compressedSize)}`,
        });
      } catch (error: any) {
        if (error.message === "Compression cancelled") {
          return;
        }
        
        console.error("Compression failed:", error);
        
        // Handle compression not supported gracefully
        if (error instanceof CompressionNotSupportedError) {
          const storageLimitMB = 100;
          if (file.size > storageLimitMB * 1024 * 1024) {
            toast.error("File too large for upload", {
              description: `${error.message} Please upload a file under ${storageLimitMB}MB.`,
            });
            resetUpload();
            return;
          }
          toast.warning("Compression not available", {
            description: "Your video will be uploaded without compression.",
          });
          // Keep the file, just skip compression
          return;
        }
        
        toast.error("Compression failed", {
          description: "Unable to compress video. Please try a smaller file or record directly.",
        });
        resetUpload();
      } finally {
        setIsCompressing(false);
        setCompressionProgress(null);
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleSubmit = async () => {
    // Use compressed blob if available, otherwise original file
    const videoToUpload = recordedBlob || compressedBlob || uploadedFile;
    if (!videoToUpload || !application || !user) return;
    
    setIsSubmitting(true);
    setRecordingState("submitting");
    
    try {
      const isRecorded = !!recordedBlob;
      const isCompressed = !!compressedBlob && !isRecorded;
      
      // Compressed files are always MP4, recorded are WebM, uploaded keep original extension
      const extension = isRecorded ? "webm" : isCompressed ? "mp4" : uploadedFile?.name.split('.').pop() || "mp4";
      const mimeType = isRecorded ? "video/webm" : isCompressed ? "video/mp4" : uploadedFile?.type || "video/mp4";
      const fileName = `${user.id}/${id}-${stepId}-${Date.now()}.${extension}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("videos")
        .upload(fileName, videoToUpload, {
          contentType: mimeType,
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
      // Use actual duration: recordingTime for recorded, uploadedVideoDuration for uploaded
      const duration = isRecorded ? recordingTime : uploadedVideoDuration;
      
      // Get the actual step type from workflow
      const workflowSteps = application.jobs?.workflow_steps as any[] | null;
      const currentStep = workflowSteps?.find((s: any) => s.id === stepId);
      const stepType = currentStep?.type || "video_intro";
      
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: stepType, // Use actual type from workflow
          duration,
          recordedAt: new Date().toISOString(),
          completed: true,
          passed,
          score,
          videoUrl,
          uploadMethod: isRecorded ? "recorded" : "uploaded",
        },
        videoIntroResult: {
          duration,
          completed: true,
          passed,
          score,
          videoUrl,
          uploadMethod: isRecorded ? "recorded" : "uploaded",
        },
        videoIntroUrl: videoUrl,
      };

      const isAutoMode = application.jobs?.processing_mode !== "manual";
      
      // Reuse workflowSteps from above
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
          description: "Your video has been uploaded. The employer will review your submission.",
        });
      }

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase: newPhase,
          status: newStatus as "pending" | "reviewing" | "interview" | "offered" | "hired" | "rejected",
          phase_ai_analysis: `Video intro: ${isRecorded ? formatTime(duration) + " duration" : "uploaded"}. COMPLETED. Video URL: ${videoUrl}`,
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

  // Preview state for both modes (exclude compressing state)
  const hasPreview = (mode === "record" && recordedUrl) || (mode === "upload" && uploadedPreviewUrl && !isCompressing);
  const previewUrl = mode === "record" ? recordedUrl : uploadedPreviewUrl;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => mode === "select" ? navigate(`/applications/${id}`) : goBackToSelect()} 
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {mode === "select" ? "Back to Application" : "Change Method"}
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
            {mode === "select" ? "Submit Your Video Introduction" : mode === "record" ? "Record Your Video" : "Upload Your Video"}
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
            {/* Mode Selection */}
            {mode === "select" && (
              <motion.div
                key="select"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground mb-2">How would you like to submit?</h3>
                  <p className="text-muted-foreground text-sm">Choose the method that works best for you</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Record Option */}
                  <motion.button
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setMode("record")}
                    className="group relative bg-gradient-to-br from-card to-muted/30 rounded-2xl p-8 border border-border/50 hover:border-primary/50 transition-all duration-300 text-left overflow-hidden"
                  >
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <div className="relative space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/20 transition-colors duration-300">
                        <Camera className="h-8 w-8 text-primary" />
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">Record Video</h4>
                        <p className="text-muted-foreground text-sm">Record directly from your webcam with audio. Perfect for a fresh, authentic introduction.</p>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Camera className="h-3.5 w-3.5" />
                        <span>Webcam + Microphone</span>
                        <span className="text-border">•</span>
                        <span>Max {formatTime(videoConfig.maxDuration)}</span>
                      </div>
                    </div>
                  </motion.button>

                  {/* Upload Option */}
                  <motion.button
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setMode("upload")}
                    className="group relative bg-gradient-to-br from-card to-muted/30 rounded-2xl p-8 border border-border/50 hover:border-accent/50 transition-all duration-300 text-left overflow-hidden"
                  >
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <div className="relative space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center group-hover:from-accent/30 group-hover:to-accent/20 transition-colors duration-300">
                        <Upload className="h-8 w-8 text-accent" />
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">Upload Video</h4>
                        <p className="text-muted-foreground text-sm">Upload a pre-recorded video file. Great if you've already prepared your introduction.</p>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileVideo className="h-3.5 w-3.5" />
                        <span>MP4, WebM, MOV</span>
                        <span className="text-border">•</span>
                        <span>Max 500MB</span>
                      </div>
                    </div>
                  </motion.button>
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

            {/* Record Mode */}
            {mode === "record" && !hasPreview && (
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
              </motion.div>
            )}

            {/* Upload Mode */}
            {mode === "upload" && !hasPreview && !isCompressing && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Dropzone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative aspect-video rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-4 ${
                    isDragging 
                      ? "border-primary bg-primary/10" 
                      : "border-border/50 bg-muted/20 hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.mov,.avi,.mkv"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  
                  <motion.div
                    animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
                    className="w-20 h-20 rounded-full bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center"
                  >
                    <Upload className={`h-10 w-10 transition-colors ${isDragging ? "text-primary" : "text-accent"}`} />
                  </motion.div>
                  
                  <div className="text-center">
                    <p className="text-foreground font-medium mb-1">
                      {isDragging ? "Drop your video here" : "Drag & drop your video here"}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      or <span className="text-primary hover:underline">browse files</span>
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileVideo className="h-3.5 w-3.5" />
                      MP4, WebM, MOV, AVI, MKV
                    </span>
                    <span className="text-border">•</span>
                    <span>Max 500MB (auto-compressed)</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Compression Progress Overlay */}
            {mode === "upload" && isCompressing && (
              <motion.div
                key="compressing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="relative aspect-video rounded-xl border border-border/50 bg-gradient-to-br from-card to-muted/30 flex flex-col items-center justify-center gap-6 p-8">
                  {/* Animated loader */}
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    </div>
                    <div className="absolute -inset-2 rounded-full border-2 border-primary/20 animate-ping" />
                  </div>
                  
                  <div className="text-center space-y-2">
                    <p className="text-foreground font-semibold text-lg">
                      {compressionProgress?.message || "Compressing your video..."}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Original: {formatFileSize(originalFileSize)}
                    </p>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full max-w-xs space-y-2">
                    <Progress value={compressionProgress?.progress || 0} className="h-2" />
                    <p className="text-center text-sm text-muted-foreground">
                      {Math.round(compressionProgress?.progress || 0)}%
                    </p>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    This may take a minute for larger videos
                  </p>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      compressionAbortRef.current?.abort();
                      resetUpload();
                    }}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Preview Mode (both record and upload) */}
            {hasPreview && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Video Preview */}
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border/50">
                  <video
                    ref={mode === "upload" ? uploadedVideoRef : undefined}
                    src={previewUrl!}
                    controls
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(e) => {
                      if (mode === "upload") {
                        const duration = Math.floor(e.currentTarget.duration);
                        setUploadedVideoDuration(duration);
                      }
                    }}
                  />
                </div>

                {/* File Info for uploads */}
                {mode === "upload" && uploadedFile && (
                  <div className="flex items-center justify-between bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                        <FileVideo className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="text-foreground font-medium text-sm truncate max-w-[200px] sm:max-w-none">
                          {uploadedFile.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs">
                          {compressedBlob ? (
                            <>
                              <span className="text-muted-foreground line-through">{formatFileSize(originalFileSize)}</span>
                              <span className="text-primary">→</span>
                              <span className="text-emerald-500 font-medium">{formatFileSize(compressedBlob.size)}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                Compressed
                              </Badge>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{formatFileSize(uploadedFile.size)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={resetUpload} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Duration display for both record and upload modes */}
                {((mode === "record" && recordingTime > 0) || (mode === "upload" && uploadedVideoDuration > 0)) && (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Video className="h-4 w-4" />
                    <span>Duration: {formatTime(mode === "record" ? recordingTime : uploadedVideoDuration)}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-center gap-4">
                  <Button 
                    onClick={mode === "record" ? resetRecording : resetUpload} 
                    variant="outline" 
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {mode === "record" ? "Record Again" : "Choose Different File"}
                  </Button>
                  <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 px-8">
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Submit Video
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
