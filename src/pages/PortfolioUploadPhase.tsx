import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, 
  FolderOpen, 
  Upload,
  X,
  CheckCircle,
  Loader2,
  Image as ImageIcon,
  FileText,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { invokeTriggerAvaAnalysis, triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { compressImage, needsCompression } from "@/utils/imageCompression";
import { PhaseContextCard } from "@/components/PhaseContextCard";
interface ApplicationDetails {
  id: string;
  candidate_id: string;
  job_id: string;
  phase: string | null;
  notes: string | null;
  status: string;
  jobs: {
    title: string;
    description: string;
    processing_mode: string | null;
    passing_score: number | null;
    workflow_steps: any[] | null;
  } | null;
}

interface UploadedFile {
  id: string;
  file: File;
  preview: string | null;
  uploading: boolean;
  uploaded: boolean;
  compressing?: boolean;
  url?: string;
}

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export default function PortfolioUploadPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading } = useQuery({
    queryKey: ["portfolio-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, description, processing_mode, passing_score, workflow_steps)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as ApplicationDetails;
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`portfolio-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["portfolio-application", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  // Get portfolio config
  const portfolioConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as Array<{ id: string; type: string; config?: Record<string, unknown> }> | null;
    const portfolioStep = workflowSteps?.find(s => s.id === stepId || s.type === "portfolio_upload");
    return {
      prompt: portfolioStep?.config?.prompt || "Upload samples of your best work that demonstrate your skills relevant to this position.",
      maxFiles: portfolioStep?.config?.maxFiles || MAX_FILES,
    };
  })();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    // Reset input early
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    
    // Process files (with potential compression)
    for (const file of selectedFiles) {
      if (files.length >= portfolioConfig.maxFiles) {
        toast.error(`Maximum ${portfolioConfig.maxFiles} files allowed`);
        break;
      }
      
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Unsupported file type. Use images (JPG, PNG, WebP, GIF) or PDF.`);
        continue;
      }
      
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Check if image needs compression
      if (needsCompression(file, MAX_FILE_SIZE / 1024 / 1024)) {
        // Add file with compressing state
        const tempPreview = URL.createObjectURL(file);
        setFiles(prev => [...prev, {
          id: fileId,
          file,
          preview: tempPreview,
          uploading: false,
          uploaded: false,
          compressing: true,
        }]);
        
        toast.info(`Compressing ${file.name}...`, { duration: 2000 });
        
        try {
          const compressedFile = await compressImage(file, { maxSizeMB: 8, maxWidth: 2560, quality: 0.85 });
          
          // Update with compressed file
          const newPreview = URL.createObjectURL(compressedFile);
          URL.revokeObjectURL(tempPreview);
          
          setFiles(prev => prev.map(f => 
            f.id === fileId 
              ? { ...f, file: compressedFile, preview: newPreview, compressing: false }
              : f
          ));
          
          const originalMB = (file.size / 1024 / 1024).toFixed(1);
          const compressedMB = (compressedFile.size / 1024 / 1024).toFixed(1);
          toast.success(`Compressed ${file.name}`, {
            description: `${originalMB}MB → ${compressedMB}MB`,
            duration: 3000,
          });
        } catch (err) {
          console.error("Compression failed:", err);
          // Remove the file that failed compression
          setFiles(prev => prev.filter(f => f.id !== fileId));
          toast.error(`Failed to compress ${file.name}. Try a smaller file.`);
        }
      } else if (file.size > MAX_FILE_SIZE) {
        // Non-image file that's too large (e.g., PDF)
        toast.error(`${file.name}: File too large. Maximum 10MB.`);
        continue;
      } else {
        // File is small enough, add directly
        let preview: string | null = null;
        if (file.type.startsWith("image/")) {
          preview = URL.createObjectURL(file);
        }
        
        setFiles(prev => [...prev, {
          id: fileId,
          file,
          preview,
          uploading: false,
          uploaded: false,
        }]);
      }
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  const uploadFiles = async (): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const fileItem = files[i];
      
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, uploading: true } : f
      ));
      
      const ext = fileItem.file.name.split('.').pop();
      const fileName = `${user!.id}/${id}-${stepId}-${Date.now()}-${i}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("portfolios")
        .upload(fileName, fileItem.file, {
          contentType: fileItem.file.type,
          cacheControl: "3600",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast.error(`Failed to upload ${fileItem.file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("portfolios")
        .getPublicUrl(fileName);

      uploadedUrls.push(urlData.publicUrl);
      
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, uploading: false, uploaded: true, url: urlData.publicUrl } : f
      ));
      
      setUploadProgress(((i + 1) / files.length) * 100);
    }
    
    return uploadedUrls;
  };

  const handleSubmit = async () => {
    if (files.length === 0 || !application || !user) {
      toast.error("Please upload at least one file");
      return;
    }
    
    setIsSubmitting(true);
    setUploadProgress(0);
    
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      // This prevents stale cached data from causing issues
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();
      
      const isAutoMode = freshJob?.processing_mode === "auto";
      
      // Upload all files
      const uploadedUrls = await uploadFiles();
      
      if (uploadedUrls.length === 0) {
        throw new Error("No files were uploaded successfully");
      }

      // Analyze portfolio with AI
      setIsAnalyzing(true);
      
      let aiAnalysis = null;
      try {
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke("ai-analyze-portfolio", {
          body: {
            portfolioUrls: uploadedUrls,
            jobTitle: application.jobs?.title,
            jobDescription: application.jobs?.description,
          },
        });
        
        if (!analysisError && analysisData) {
          aiAnalysis = analysisData;
        }
      } catch (err) {
        // Continue without AI analysis
      }
      
      setIsAnalyzing(false);

      const existingNotes = application.notes ? JSON.parse(application.notes) : {};

      // Save phase data (NO local pass/fail decision - backend decides)
      const portfolioResult = {
        type: "portfolio_upload",
        files: uploadedUrls.map((url, i) => ({
          url,
          name: files[i]?.file.name || `file-${i}`,
          type: files[i]?.file.type || "unknown",
        })),
        uploadedAt: new Date().toISOString(),
        completed: true,
        aiAnalysis,
        phaseScore: aiAnalysis?.score || null, // Store for backend to use
      };
      
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: portfolioResult,
        portfolioResult,
      };
      
      const workflowSteps = application.jobs?.workflow_steps as Array<{ id: string; type: string; title?: string }> || [];
      const quizQuestions = application.jobs?.quiz_questions as Json[] | undefined;

      // Extract voice_interview step (goes AFTER review)
      const voiceInterviewStep = workflowSteps.find((step) => step.type === 'voice_interview');

      const allPhases: { id: string; type: string; title?: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];

      // Add quiz phase if quiz_questions exist
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }

      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      workflowSteps.filter((step) => step.type !== 'voice_interview').forEach((step) => {
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
      
      let currentIndex = allPhases.findIndex((p) => p.id === stepId);
      if (currentIndex === -1 && application.phase) {
        currentIndex = allPhases.findIndex(
          (p) => p.id === application.phase || p.type === application.phase
        );
      }
      
      let newPhase = application.phase;

      // Determine next phase
      let nextPhase: { id: string; type: string; title?: string } | null = null;
      if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
        nextPhase = allPhases[currentIndex + 1];
      }

      // Advance to next phase ONLY in auto mode
      if (isAutoMode) {
        if (nextPhase) {
          // STOP before voice_interview - requires employer to configure
          if (nextPhase.type === "voice_interview") {
            // Don't advance to voice interview - stay at current phase completion
            // Employer must manually configure and approve for Ava interview
            // Don't set nextPhaseInfo - no "Start Next Phase" button
          } else {
            newPhase = nextPhase.id;

            // DON'T show "Start Next Phase" button if next phase is review (only in auto mode)
            if (nextPhase.type !== "review") {
              setNextPhaseInfo({
                id: nextPhase.id,
                title: nextPhase.title || nextPhase.type,
              });
            }
          }
        }
      }

      const analysisText = aiAnalysis 
        ? `Portfolio: ${uploadedUrls.length} files. Score: ${aiAnalysis.score || 100}%. ${aiAnalysis.summary || ""}`
        : `Portfolio: ${uploadedUrls.length} files uploaded successfully.`;

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          // Manual mode must NEVER auto-advance phases
          phase: isAutoMode ? newPhase : application.phase,
          phase_ai_analysis: analysisText,
        })
        .eq("id", id!);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });
      
      if (isAutoMode) {
        // Show evaluating state while backend processes
        setEvaluationState("evaluating");
        
        // Trigger AVA analysis and WAIT for backend decision
        try {
          const { data: analysisResult, error: analysisError } = await invokeTriggerAvaAnalysis({
            applicationId: id!,
            autopilotDecision: true,
            currentPhaseId: stepId,
          });
          
          if (analysisError) {
            console.error("[PortfolioUploadPhase] AVA analysis error:", analysisError);
            // Keep evaluating state - backend is source of truth
            setEvaluationState("evaluating");
          } else {
            // Backend decides pass/fail based on weighted ai_score vs passing_score
            const decision = analysisResult?.decision;
            if (decision === "advanced") {
              setEvaluationState("passed");
            } else if (decision === "rejected") {
              setEvaluationState("failed"); // EvaluationScreen handles "failed"
            } else {
              // Fallback: check application status
              const { data: updatedApp } = await supabase
                .from("applications")
                .select("status, ai_score")
                .eq("id", id!)
                .single();
              
              if (updatedApp?.status === "rejected") {
                setEvaluationState("failed");
              } else {
                setEvaluationState("passed");
              }
            }
          }
        } catch (err) {
          console.error("[PortfolioUploadPhase] Backend analysis failed:", err);
          // Keep evaluating state - backend is source of truth, no local fallback
          setEvaluationState("evaluating");
        }
      } else {
        // Manual mode - just trigger analysis in background, toast and navigate
        invokeTriggerAvaAnalysis({
          applicationId: id!,
        }).catch(err => console.error("[PortfolioUploadPhase] AVA analysis trigger failed:", err));
        
        toast.success("Portfolio submitted!", {
          description: "Your portfolio has been uploaded. The employer will review your work.",
        });
        navigate(`/applications/${id}`);
      }
    } catch (error) {
      console.error("Error submitting portfolio:", error);
      toast.error("Failed to submit portfolio");
      setEvaluationState(null);
    } finally {
      setIsSubmitting(false);
      setIsAnalyzing(false);
    }
  };

  // Handlers for evaluation screen
  const handleStartNextPhase = () => {
    if (!nextPhaseInfo || !application) return;
    const workflowSteps = application.jobs?.workflow_steps as Array<{ id: string; type: string; title?: string }> || [];
    const nextStep = workflowSteps.find((s: any) => s.id === nextPhaseInfo.id);
    if (nextStep) {
      const phaseRoutes: Record<string, string> = {
        typing_test: "typing-test", video_intro: "video-intro", portfolio_upload: "portfolio",
        chat_simulation: "chat-simulation", chat_interview: "chat-interview",
        sales_simulation: "sales-simulation", voice_interview: "voice-interview", quiz: "quiz",
      };
      navigate(`/applications/${id}/${phaseRoutes[nextStep.type] || nextStep.type}/${nextPhaseInfo.id}`);
    } else {
      navigate(`/applications/${id}`);
    }
  };

  const handleDoLater = () => navigate(`/applications/${id}`);

  // Check if already submitted - check both stepId key and global portfolioResult key
  const existingResult = (() => {
    // If application was reconsidered (status reset to pending), allow re-submission
    if (application?.status === "pending" && application?.phase === stepId) {
      return null;
    }
    if (!application?.notes) return null;
    try {
      const notes = JSON.parse(application.notes);
      // Check both the stepId key and the global portfolioResult key
      return notes[stepId!] || notes.portfolioResult || null;
    } catch {
      return null;
    }
  })();

  if (authLoading || isLoading) {
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

  // Show already submitted view
  if (existingResult) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName="Portfolio Upload"
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
        <Button 
          variant="outline" 
          onClick={() => navigate(`/applications/${id}`)} 
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Application
        </Button>
        
        <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
          <FolderOpen className="h-4 w-4" />
          Portfolio Upload
        </Badge>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Upload Your Portfolio
          </CardTitle>
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Instructions */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <p className="text-foreground">{portfolioConfig.prompt}</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <ImageIcon className="h-4 w-4" />
                <span>Images (JPG, PNG, WebP, GIF)</span>
              </div>
              <div className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                <span>PDF documents</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                <span>Max {portfolioConfig.maxFiles} files, 10MB each</span>
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer hover:border-primary/50 ${
              files.length >= portfolioConfig.maxFiles ? "opacity-50 pointer-events-none" : "border-border"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_TYPES.join(",")}
              onChange={handleFileSelect}
              className="hidden"
              disabled={files.length >= portfolioConfig.maxFiles}
            />
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-foreground font-medium">
              {files.length >= portfolioConfig.maxFiles 
                ? "Maximum files reached" 
                : "Click to upload or drag and drop"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {files.length} / {portfolioConfig.maxFiles} files selected
            </p>
          </div>

          {/* File Previews */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((fileItem) => (
                <div
                  key={fileItem.id}
                  className="relative group border border-border rounded-lg overflow-hidden bg-muted/30"
                >
                  {/* Preview */}
                  <div className="aspect-square flex items-center justify-center">
                    {fileItem.preview ? (
                      <img
                        src={fileItem.preview}
                        alt={fileItem.file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <FileText className="h-12 w-12 mb-2" />
                        <span className="text-xs">PDF</span>
                      </div>
                    )}
                    
                    {/* Upload/compress status overlay */}
                    {(fileItem.compressing || fileItem.uploading || fileItem.uploaded) && (
                      <div className={`absolute inset-0 flex flex-col items-center justify-center ${
                        fileItem.uploaded ? "bg-success/20" : "bg-background/80"
                      }`}>
                        {fileItem.compressing && (
                          <>
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-xs text-primary mt-2">Compressing...</span>
                          </>
                        )}
                        {fileItem.uploading && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
                        {fileItem.uploaded && <CheckCircle className="h-8 w-8 text-success" />}
                      </div>
                    )}
                  </div>
                  
                  {/* File name */}
                  <div className="p-2 border-t border-border">
                    <p className="text-xs text-muted-foreground truncate">
                      {fileItem.file.name}
                    </p>
                  </div>
                  
                  {/* Remove button */}
                  {!isSubmitting && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(fileItem.id);
                      }}
                      className="absolute top-2 right-2 p-1 bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4 text-foreground" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {isSubmitting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {isAnalyzing ? "Analyzing portfolio..." : "Uploading files..."}
                </span>
                <span className="text-foreground">{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={isAnalyzing ? 100 : uploadProgress} className="h-2" />
              {isAnalyzing && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  <span>Analyzing your portfolio for relevance and quality...</span>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleSubmit}
              disabled={files.length === 0 || isSubmitting}
              size="lg"
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {isAnalyzing ? "Analyzing..." : "Uploading..."}
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Submit Portfolio ({files.length} {files.length === 1 ? "file" : "files"})
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
