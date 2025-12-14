import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateApplication } from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  ArrowLeft, FileText, MessageSquare, Sparkles, 
  XCircle, GripHorizontal, Clock, RefreshCw, 
  FileCheck, ClipboardList, Video, Keyboard, 
  Eye, Users, CheckCircle, Loader2, Mail
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface WorkflowStep {
  id: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  config?: Record<string, any>;
}

interface ApplicationDetails extends Tables<"applications"> {
  profiles: Tables<"profiles"> | null;
  jobs: (Tables<"jobs"> & { workflow_steps?: WorkflowStep[] }) | null;
}

// Default phases if job has no workflow
const defaultPhases = [
  { id: "application", title: "Application", icon: FileCheck, type: "application" },
  { id: "review", title: "Review", icon: Eye, type: "review" },
  { id: "interview", title: "Interview", icon: Users, type: "interview" },
  { id: "hired", title: "Hired", icon: CheckCircle, type: "hired" },
];

// Map workflow step types to icons
const stepTypeIcons: Record<string, any> = {
  application: FileCheck,
  quiz: ClipboardList,
  video_intro: Video,
  typing_test: Keyboard,
  chat_simulation: MessageSquare,
  review: Eye,
  interview: Users,
  hired: CheckCircle,
};

// Colors for different phase states
const phaseColors = {
  completed: "bg-success",
  current: "bg-warning",
  upcoming: "bg-muted",
};

export default function ApplicantDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const updateApplication = useUpdateApplication();
  const queryClient = useQueryClient();
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const { data: application, isLoading } = useQuery({
    queryKey: ["application", id],
    queryFn: async () => {
      const { data: app, error } = await supabase
        .from("applications")
        .select("*, jobs(*)")
        .eq("id", id!)
        .single();

      if (error) throw error;

      // Get profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", app.candidate_id)
        .single();

      return { ...app, profiles: profile, jobs: app.jobs } as ApplicationDetails;
    },
    enabled: !!id && !!user,
  });

  // Build phases from workflow_steps or use defaults
  const phases = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as WorkflowStep[] | undefined;
    
    if (workflowSteps && workflowSteps.length > 0) {
      // Start with application phase
      const allPhases = [
        { id: "application", title: "Application", icon: FileCheck, type: "application" },
        ...workflowSteps.map(step => ({
          id: step.id,
          title: step.title.length > 12 ? step.title.substring(0, 10) + "..." : step.title,
          icon: stepTypeIcons[step.type] || ClipboardList,
          type: step.type,
        })),
        { id: "review", title: "Review", icon: Eye, type: "review" },
        { id: "interview", title: "Interview", icon: Users, type: "interview" },
        { id: "hired", title: "Hired", icon: CheckCircle, type: "hired" },
      ];
      return allPhases;
    }
    return defaultPhases;
  })();

  // Find current phase index
  const currentPhaseIndex = phases.findIndex(p => p.id === application?.phase || p.type === application?.phase);
  const effectivePhaseIndex = currentPhaseIndex >= 0 ? currentPhaseIndex : 0;

  // Calculate avatar position based on phase
  useEffect(() => {
    if (sliderRef.current && !isDragging) {
      const percentage = (effectivePhaseIndex / (phases.length - 1)) * 100;
      setDragPosition(percentage);
    }
  }, [effectivePhaseIndex, phases.length, isDragging]);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setDragPosition(percentage);
  };

  const handleDragEnd = async () => {
    if (!isDragging || !application) return;
    setIsDragging(false);
    
    // Calculate nearest phase
    const stepSize = 100 / (phases.length - 1);
    const nearestIndex = Math.round(dragPosition / stepSize);
    const newPhase = phases[nearestIndex];
    
    if (newPhase && newPhase.id !== application.phase) {
      try {
        await updateApplication.mutateAsync({ 
          id: application.id, 
          phase: newPhase.id,
          status: newPhase.type === "interview" ? "interview" : 
                  newPhase.type === "hired" ? "hired" : 
                  application.status
        });
        queryClient.invalidateQueries({ queryKey: ["application", id] });
        toast.success(`Moved to ${newPhase.title} phase`);
      } catch (error) {
        toast.error("Failed to update phase");
      }
    }
    
    // Snap to position
    const snapPercentage = (nearestIndex / (phases.length - 1)) * 100;
    setDragPosition(snapPercentage);
  };

  const handleReject = async () => {
    if (!application) return;
    try {
      await updateApplication.mutateAsync({ id: application.id, status: "rejected" });
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      toast.success("Candidate rejected");
      navigate("/applicants");
    } catch (error) {
      toast.error("Failed to reject candidate");
    }
  };

  const handleReanalyze = async () => {
    if (!application) return;
    setIsAnalyzing(true);
    
    try {
      const content = `
Job Title: ${application.jobs?.title || "Unknown"}
Job Description: ${application.jobs?.description || "Not provided"}
Requirements: ${application.jobs?.requirements || "Not specified"}

Candidate Information:
Name: ${application.profiles?.full_name || "Unknown"}
Email: ${application.profiles?.email || "Not provided"}
Skills: ${application.profiles?.skills?.join(", ") || "Not specified"}
Bio: ${application.profiles?.bio || "Not provided"}

Cover Letter:
${application.cover_letter || "Not provided"}
      `;

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          type: "application",
          content,
          context: {
            skills_required: application.jobs?.skills_required,
            experience_level: application.jobs?.experience_level,
          },
        },
      });

      if (error) throw error;

      const scoreMatch = data.analysis?.match(/Score[:\s]+(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      await updateApplication.mutateAsync({
        id: application.id,
        ai_analysis: data.analysis,
        ai_score: score && score >= 0 && score <= 100 ? score : null,
      });

      queryClient.invalidateQueries({ queryKey: ["application", id] });
      toast.success("AI analysis completed!");
    } catch (error) {
      console.error("AI analysis error:", error);
      toast.error("Failed to run AI analysis");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Application Not Found</h2>
            <p className="text-muted-foreground">The application you're looking for doesn't exist.</p>
            <Button onClick={() => navigate("/applicants")} className="mt-4">
              Back to Applicants
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profile = application.profiles;
  const job = application.jobs;
  const isAutoPilot = job?.processing_mode === "auto";
  const passingScore = job?.passing_score || 60;
  
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || "?";

  // Parse phase scores from phase_ai_analysis if available
  const phaseScores: Record<string, number> = {};
  if (application.ai_score) {
    phaseScores["resume"] = application.ai_score;
  }

  return (
    <div 
      className="space-y-6"
      onMouseMove={handleDrag}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchMove={handleDrag}
      onTouchEnd={handleDragEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => navigate("/applicants")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Applicants
        </Button>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Notes
          </Button>
          <Button variant="outline" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Message
          </Button>
        </div>
      </div>

      {/* Candidate Journey */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Candidate Journey</span>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={handleReject}
                className="gap-2 text-destructive border-destructive/50 hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4" />
                Reject Candidate
              </Button>
              <Button variant="outline" className="gap-2">
                <GripHorizontal className="h-4 w-4" />
                Hold & Drag
              </Button>
            </div>
          </div>

          {/* Journey Slider */}
          <div 
            ref={sliderRef}
            className="relative h-20 select-none"
          >
            {/* Progress bar background */}
            <div className="absolute top-8 left-0 right-0 h-2 bg-muted rounded-full" />
            
            {/* Completed progress */}
            <div 
              className="absolute top-8 left-0 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${dragPosition}%`,
                background: "linear-gradient(90deg, hsl(var(--success)) 0%, hsl(var(--warning)) 100%)"
              }}
            />

            {/* Phase markers */}
            {phases.map((phase, index) => {
              const position = (index / (phases.length - 1)) * 100;
              const Icon = phase.icon;
              const isCompleted = index < effectivePhaseIndex;
              const isCurrent = index === effectivePhaseIndex;
              
              return (
                <div 
                  key={phase.id}
                  className="absolute flex flex-col items-center -translate-x-1/2"
                  style={{ left: `${position}%` }}
                >
                  {/* Dot */}
                  <div 
                    className={`w-4 h-4 rounded-full border-2 border-background mt-6 z-10 ${
                      isCompleted ? phaseColors.completed : 
                      isCurrent ? phaseColors.current : 
                      phaseColors.upcoming
                    }`}
                  />
                  
                  {/* Icon & Label */}
                  <div className="mt-3 flex flex-col items-center">
                    <Icon className={`h-5 w-5 ${
                      isCompleted ? "text-success" : 
                      isCurrent ? "text-warning" : 
                      "text-muted-foreground"
                    }`} />
                    <span className={`text-xs mt-1 ${
                      isCompleted ? "text-success" : 
                      isCurrent ? "text-warning" : 
                      "text-muted-foreground"
                    }`}>
                      {phase.title}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Draggable avatar */}
            <div 
              className="absolute top-3 -translate-x-1/2 cursor-grab active:cursor-grabbing z-20"
              style={{ left: `${dragPosition}%` }}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <Avatar className="h-10 w-10 ring-4 ring-primary/30">
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Pilot Mode */}
      {isAutoPilot && (
        <Card className="bg-card border-border border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-semibold text-primary">Auto-Pilot Mode Active</h3>
                <p className="text-sm text-muted-foreground">
                  AVA automatically evaluates, progresses, and notifies candidates based on a passing score of {passingScore}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Applicant Info */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          {/* Phase Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {isAutoPilot && (
              <Badge className="bg-primary/20 text-primary border-primary/30">
                <Sparkles className="h-3 w-3 mr-1" />
                Auto-Pilot
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <FileCheck className="h-3 w-3" />
              Application
            </Badge>
            {phaseScores["resume"] && (
              <Badge className="bg-success/20 text-success border-success/30">
                <FileText className="h-3 w-3 mr-1" />
                Resume ({phaseScores["resume"]})
              </Badge>
            )}
          </div>

          {/* Name & Details */}
          <h2 className="text-2xl font-bold text-foreground">{profile?.full_name || "Unknown Candidate"}</h2>
          <p className="text-muted-foreground mt-1">
            Applied for {job?.title || "Unknown Position"} at {profile?.company_name || "Company"}
          </p>
          
          <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <Mail className="h-4 w-4" />
            <span>{profile?.email}</span>
          </div>
          
          <p className="text-muted-foreground text-sm mt-1">
            Submitted on {format(new Date(application.created_at), "M/d/yyyy")}
          </p>
        </CardContent>
      </Card>

      {/* AVA's Analysis */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">AVA's Analysis</span>
              {application.ai_score && (
                <Badge className="bg-primary/20 text-primary">
                  {application.ai_score}/100
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {application.updated_at && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Updated: {format(new Date(application.updated_at), "MMM d, hh:mm a")}
                </div>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleReanalyze}
                disabled={isAnalyzing}
                className="gap-2"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Re-analyze
              </Button>
              <Button variant="outline" size="sm">
                Employer Only
              </Button>
            </div>
          </div>

          {/* What AVA analyzed */}
          {application.ai_analysis && (
            <>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-sm text-muted-foreground">AVA analyzed:</span>
                <Badge variant="outline" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1 text-success" />
                  Resume
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1 text-success" />
                  Application Answers
                </Badge>
              </div>

              {/* Recommendation */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-primary">AVA's Recommendation</span>
                  </div>
                  <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                    {application.ai_analysis}
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {!application.ai_analysis && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold text-foreground mb-2">No Analysis Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Run AI analysis to get AVA's recommendation on this candidate.
              </p>
              <Button onClick={handleReanalyze} disabled={isAnalyzing}>
                {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Sparkles className="mr-2 h-4 w-4" />
                Run AI Analysis
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}