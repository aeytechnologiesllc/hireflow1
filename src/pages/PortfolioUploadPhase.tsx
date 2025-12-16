import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch application details
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
    enabled: !!id && !!user,
  });

  // Get portfolio config
  const portfolioConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as any[] | null;
    const portfolioStep = workflowSteps?.find(s => s.id === stepId || s.type === "portfolio_upload");
    return {
      prompt: portfolioStep?.config?.prompt || "Upload samples of your best work that demonstrate your skills relevant to this position.",
      maxFiles: portfolioStep?.config?.maxFiles || MAX_FILES,
    };
  })();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    // Validate files
    const validFiles: UploadedFile[] = [];
    
    for (const file of selectedFiles) {
      if (files.length + validFiles.length >= portfolioConfig.maxFiles) {
        toast.error(`Maximum ${portfolioConfig.maxFiles} files allowed`);
        break;
      }
      
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Unsupported file type. Use images (JPG, PNG, WebP, GIF) or PDF.`);
        continue;
      }
      
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: File too large. Maximum 10MB.`);
        continue;
      }
      
      // Create preview for images
      let preview: string | null = null;
      if (file.type.startsWith("image/")) {
        preview = URL.createObjectURL(file);
      }
      
      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview,
        uploading: false,
        uploaded: false,
      });
    }
    
    setFiles(prev => [...prev, ...validFiles]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
        console.warn("Portfolio analysis failed:", err);
        // Continue without AI analysis
      }
      
      setIsAnalyzing(false);

      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      
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
        score: aiAnalysis?.score || 100,
        passed: true,
      };
      
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: portfolioResult,
        portfolioResult,
      };

      // Determine next phase
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

      if (isAutoMode) {
        if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
          newPhase = allPhases[currentIndex + 1].id;
        }
        toast.success("Portfolio submitted!", {
          description: "Great work! You've advanced to the next phase.",
        });
      } else {
        toast.success("Portfolio submitted!", {
          description: "Your portfolio has been uploaded. The employer will review your work.",
        });
      }

      const analysisText = aiAnalysis 
        ? `Portfolio: ${uploadedUrls.length} files. Score: ${aiAnalysis.score || 100}%. ${aiAnalysis.summary || ""}`
        : `Portfolio: ${uploadedUrls.length} files uploaded successfully.`;

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase: newPhase,
          phase_ai_analysis: analysisText,
        })
        .eq("id", id!);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
      navigate(`/applications/${id}`);
    } catch (error) {
      console.error("Error submitting portfolio:", error);
      toast.error("Failed to submit portfolio");
    } finally {
      setIsSubmitting(false);
      setIsAnalyzing(false);
    }
  };

  // Check if already submitted
  const existingResult = (() => {
    if (!application?.notes) return null;
    try {
      const notes = JSON.parse(application.notes);
      return notes.portfolioResult || null;
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

  // Show already submitted view
  if (existingResult) {
    const { PhaseAlreadySubmitted } = require("@/components/PhaseAlreadySubmitted");
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName="Portfolio Upload"
        isManualMode={application.jobs?.processing_mode === "manual"}
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
                    
                    {/* Upload status overlay */}
                    {(fileItem.uploading || fileItem.uploaded) && (
                      <div className={`absolute inset-0 flex items-center justify-center ${
                        fileItem.uploaded ? "bg-success/20" : "bg-background/80"
                      }`}>
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