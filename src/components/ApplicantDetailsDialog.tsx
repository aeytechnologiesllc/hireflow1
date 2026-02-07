import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  MapPin, Briefcase, Mail, Phone, Linkedin, 
  Globe, FileText, Sparkles, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";
import { applicationStatusColors, getApplicationStatusLabel } from "@/lib/terminology";

interface ApplicantDetailsDialogProps {
  application: ApplicationWithCandidate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnalyze?: (analysis: string, score: number | null) => void;
}

export default function ApplicantDetailsDialog({
  application,
  open,
  onOpenChange,
  onAnalyze,
}: ApplicantDetailsDialogProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!application) return null;

  const profile = application.profiles;
  const job = application.jobs;

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || "?";

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      // SINGLE SOURCE OF TRUTH: Use trigger-ava-analysis backend function
      // DO NOT call ai-analyze directly - backend handles all scoring
      const { data, error } = await supabase.functions.invoke("trigger-ava-analysis", {
        body: {
          applicationId: application.id,
          force: true, // Force re-analysis
        },
      });

      if (error) throw error;

      // Refetch the application to get updated analysis
      // The backend will have updated ai_analysis and ai_score
      if (onAnalyze && data) {
        onAnalyze(data.analysis || "Analysis completed", data.score || null);
      }

      toast.success("Ava analysis completed!");
    } catch (error) {
      console.error("Ava analysis error:", error);
      toast.error("Failed to run Ava analysis");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name || "Candidate"} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-xl text-foreground">
                {profile?.full_name || "Unknown Candidate"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Applied for {job?.title || "Unknown Position"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-6">
            {/* Status & Score */}
            <div className="flex items-center gap-4">
              <Badge className={applicationStatusColors[application.status]}>
                {getApplicationStatusLabel(application.status)}
              </Badge>
              {application.ai_score && (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Ava Score: {application.ai_score}%
                  </span>
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                Applied {format(new Date(application.created_at), "MMM d, yyyy")}
              </span>
            </div>

            <Separator />

            {/* Contact Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Contact Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{profile?.email}</span>
                </div>
                {profile?.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile?.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>{profile.location}</span>
                  </div>
                )}
                {profile?.experience_years && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-4 w-4 flex-shrink-0" />
                    <span>{profile.experience_years} years experience</span>
                  </div>
                )}
              </div>

              {/* Links */}
              <div className="flex gap-3">
                {profile?.linkedin_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer">
                      <Linkedin className="h-4 w-4 mr-2" />
                      LinkedIn
                    </a>
                  </Button>
                )}
                {profile?.portfolio_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer">
                      <Globe className="h-4 w-4 mr-2" />
                      Portfolio
                    </a>
                  </Button>
                )}
                {application.resume_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={application.resume_url} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4 mr-2" />
                      Resume
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Skills */}
            {profile?.skills && profile.skills.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill, index) => (
                    <Badge key={index} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Bio */}
            {profile?.bio && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">About</h3>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{profile.bio}</p>
              </div>
            )}

            {/* Cover Letter */}
            {application.cover_letter && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Cover Letter</h3>
                <Card className="bg-secondary/30 border-border">
                  <CardContent className="p-4">
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      {application.cover_letter}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* AI Analysis */}
            {application.ai_analysis && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Ava's Analysis
                </h3>
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      {application.ai_analysis}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!application.ai_analysis && (
            <Button onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Sparkles className="mr-2 h-4 w-4" />
              Run Ava Analysis
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
