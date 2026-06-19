import { motion } from "framer-motion";
import { format } from "date-fns";
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Upload,
  Eye,
  Download,
  Trash2,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SecurityBadge } from "./SecurityBadge";
import { DocumentRequestWithDetails, getDocumentTypeLabel } from "@/hooks/useDocumentRequests";
import { cn } from "@/lib/utils";

interface DocumentRequestCardProps {
  request: DocumentRequestWithDetails;
  isEmployer: boolean;
  onUpload?: (request: DocumentRequestWithDetails) => void;
  onView?: (request: DocumentRequestWithDetails) => void;
  onDownload?: (request: DocumentRequestWithDetails) => void;
  onApprove?: (request: DocumentRequestWithDetails) => void;
  onReject?: (request: DocumentRequestWithDetails) => void;
  onDelete?: (request: DocumentRequestWithDetails) => void;
}

// Status labels vary by role - candidates see "Completed" after uploading
const getStatusConfig = (status: string, isEmployer: boolean): { color: string; icon: typeof Clock; label: string } => {
  const configs: Record<string, { color: string; icon: typeof Clock; label: string; candidateLabel?: string }> = {
    pending: {
      color: "bg-warning/20 text-warning",
      icon: Clock,
      label: "Pending Upload",
    },
    submitted: {
      color: "bg-success/20 text-success",
      icon: CheckCircle,
      label: "Received",
      candidateLabel: "Completed",
    },
    reviewed: {
      color: "bg-success/20 text-success",
      icon: CheckCircle,
      label: "Reviewed",
      candidateLabel: "Completed",
    },
    approved: {
      color: "bg-success/20 text-success",
      icon: CheckCircle,
      label: "Approved",
      candidateLabel: "Completed",
    },
    rejected: {
      color: "bg-destructive/20 text-destructive",
      icon: XCircle,
      label: "Rejected",
    },
  };
  
  const config = configs[status] || configs.pending;
  return {
    color: config.color,
    icon: config.icon,
    label: !isEmployer && config.candidateLabel ? config.candidateLabel : config.label,
  };
};

export function DocumentRequestCard({
  request,
  isEmployer,
  onUpload,
  onView,
  onDownload,
  onApprove,
  onReject,
  onDelete,
}: DocumentRequestCardProps) {
  const status = getStatusConfig(request.status, isEmployer);
  const StatusIcon = status.icon;
  const candidateName = request.candidate_profile?.full_name || request.candidate_profile?.email || "Unknown";
  const initials = candidateName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isOverdue = request.due_date && new Date(request.due_date) < new Date() && request.status === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={cn(
        "bg-card border-border card-interactive",
        isOverdue && "border-destructive/50"
      )}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            {/* Left section - Document info */}
            <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
              {/* Document icon */}
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                {/* Document type and name */}
                <p className="font-medium text-foreground text-sm sm:text-base truncate">
                  {request.custom_document_name || getDocumentTypeLabel(request.document_type)}
                </p>
                
                {/* Badges row - separate from title */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {request.is_required && !isEmployer && (
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  )}
                  {request.status !== "pending" && (
                    <SecurityBadge variant="encrypted" size="sm" />
                  )}
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-xs sm:text-sm text-muted-foreground">
                  {isEmployer && (
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={request.candidate_profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-[100px] sm:max-w-none">{candidateName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span className="hidden sm:inline">Requested {format(new Date(request.created_at), "MMM d, yyyy")}</span>
                    <span className="sm:hidden">{format(new Date(request.created_at), "MMM d")}</span>
                  </div>
                  {request.due_date && (
                    <div className={cn(
                      "flex items-center gap-1",
                      isOverdue && "text-destructive"
                    )}>
                      <Clock className="h-3 w-3" />
                      <span className="hidden sm:inline">Due {format(new Date(request.due_date), "MMM d, yyyy")}</span>
                      <span className="sm:hidden">Due {format(new Date(request.due_date), "MMM d")}</span>
                      {isOverdue && <span className="font-medium">(Overdue)</span>}
                    </div>
                  )}
                </div>

                {/* Description - only on larger screens or if short */}
                {request.description && (
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 line-clamp-2">
                    {request.description}
                  </p>
                )}

                {/* Rejection reason */}
                {request.status === "rejected" && request.rejection_reason && (
                  <div className="mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <p className="text-xs sm:text-sm text-destructive">
                      <strong>Reason:</strong> {request.rejection_reason}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right section - Status and actions - stacks below on mobile */}
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 sm:shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
              <Badge className={cn(status.color, "text-xs sm:text-sm")}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>

              {/* Action buttons based on role and status */}
              <div className="flex items-center gap-1">
                {/* Candidate actions */}
                {!isEmployer && request.status === "pending" && onUpload && (
                  <Button size="sm" onClick={() => onUpload(request)} className="h-8 text-xs sm:text-sm">
                    <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    Upload
                  </Button>
                )}
                {!isEmployer && request.status === "rejected" && onUpload && (
                  <Button size="sm" variant="outline" onClick={() => onUpload(request)} className="h-8 text-xs sm:text-sm">
                    <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    Re-upload
                  </Button>
                )}

                {/* Employer actions - view and download only (no approve/reject for document requests) */}
                {isEmployer && (request.status === "submitted" || request.status === "reviewed") && (
                  <>
                    {onView && (
                      <Button size="icon" variant="ghost" onClick={() => onView(request)} className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {onDownload && (
                      <Button size="icon" variant="ghost" onClick={() => onDownload(request)} className="h-8 w-8">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}

                {/* View for approved documents */}
                {request.status === "approved" && request.file_url && (
                  <>
                    {onView && (
                      <Button size="icon" variant="ghost" onClick={() => onView(request)} className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {onDownload && (
                      <Button size="icon" variant="ghost" onClick={() => onDownload(request)} className="h-8 w-8">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}

                {/* Delete button for employers */}
                {isEmployer && onDelete && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(request)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/50 hidden max-sm:block self-center animate-fade-in" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
