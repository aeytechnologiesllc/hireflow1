import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { MapPin, Briefcase, DollarSign, Clock, Calendar, Users, Building } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { renderFormattedText } from "@/lib/formatText";
import type { Tables } from "@/integrations/supabase/types";

interface JobDetailsDialogProps {
  job: Tables<"jobs"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply?: () => void;
  showApplyButton?: boolean;
}

export default function JobDetailsDialog({
  job,
  open,
  onOpenChange,
  onApply,
  showApplyButton = true,
}: JobDetailsDialogProps) {
  if (!job) return null;

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null) => {
    if (!min && !max) return "Competitive";
    const curr = currency || "USD";
    if (min && max) return `${curr} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `${curr} ${min.toLocaleString()}+`;
    return `Up to ${curr} ${max?.toLocaleString()}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">{job.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {job.department && <span>{job.department} • </span>}
            Posted {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-6">
            {/* Quick Info */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{job.location || "Remote"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Briefcase className="h-4 w-4" />
                <span>{job.job_type || "Full-Time"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span>{formatSalary(job.salary_min, job.salary_max, job.salary_currency)}</span>
              </div>
              {job.experience_level && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{job.experience_level}</span>
                </div>
              )}
              {job.application_deadline && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Deadline: {format(new Date(job.application_deadline), "MMM d, yyyy")}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Description */}
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">About the Role</h3>
              <div className="text-muted-foreground">{renderFormattedText(job.description)}</div>
            </div>

            {/* Requirements */}
            {job.requirements && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Requirements</h3>
                <div className="text-muted-foreground">{renderFormattedText(job.requirements)}</div>
              </div>
            )}

            {/* Responsibilities */}
            {job.responsibilities && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Responsibilities</h3>
                <div className="text-muted-foreground">{renderFormattedText(job.responsibilities)}</div>
              </div>
            )}

            {/* Skills */}
            {job.skills_required && job.skills_required.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Required Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {job.skills_required.map((skill, index) => (
                    <Badge key={index} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Benefits */}
            {job.benefits && job.benefits.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Benefits</h3>
                <div className="flex flex-wrap gap-2">
                  {job.benefits.map((benefit, index) => (
                    <Badge key={index} variant="outline" className="bg-primary/10">
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {showApplyButton && onApply && (
            <Button onClick={onApply}>Apply Now</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
