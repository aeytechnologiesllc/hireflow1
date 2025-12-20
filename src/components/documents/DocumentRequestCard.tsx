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
  User,
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

const statusConfig: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  pending: {
    color: "bg-yellow-500/20 text-yellow-500",
    icon: Clock,
    label: "Pending Upload",
  },
  submitted: {
    color: "bg-success/20 text-success",
    icon: CheckCircle,
    label: "Received",
  },
  reviewed: {
    color: "bg-success/20 text-success",
    icon: CheckCircle,
    label: "Received",
  },
  approved: {
    color: "bg-success/20 text-success",
    icon: CheckCircle,
    label: "Approved",
  },
  rejected: {
    color: "bg-destructive/20 text-destructive",
    icon: XCircle,
    label: "Rejected",
  },
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
  const status = statusConfig[request.status];
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
        "bg-card border-border hover:border-primary/50 transition-all duration-300",
        isOverdue && "border-destructive/50"
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left section */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Document icon */}
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                {/* Document type and name */}
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground">
                    {request.custom_document_name || getDocumentTypeLabel(request.document_type)}
                  </p>
                  {request.is_required && (
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  )}
                  {request.status !== "pending" && (
                    <SecurityBadge variant="encrypted" size="sm" />
                  )}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                  {isEmployer && (
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={request.candidate_profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                      </Avatar>
                      <span>{candidateName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>Requested {format(new Date(request.created_at), "MMM d, yyyy")}</span>
                  </div>
                  {request.due_date && (
                    <div className={cn(
                      "flex items-center gap-1",
                      isOverdue && "text-destructive"
                    )}>
                      <Clock className="h-3 w-3" />
                      <span>Due {format(new Date(request.due_date), "MMM d, yyyy")}</span>
                      {isOverdue && <span className="font-medium">(Overdue)</span>}
                    </div>
                  )}
                </div>

                {/* Description */}
                {request.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {request.description}
                  </p>
                )}

                {/* Rejection reason */}
                {request.status === "rejected" && request.rejection_reason && (
                  <div className="mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive">
                      <strong>Reason:</strong> {request.rejection_reason}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right section - Status and actions */}
            <div className="flex items-center gap-3 shrink-0">
              <Badge className={status.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>

              {/* Action buttons based on role and status */}
              <div className="flex items-center gap-1">
                {/* Candidate actions */}
                {!isEmployer && request.status === "pending" && onUpload && (
                  <Button size="sm" onClick={() => onUpload(request)}>
                    <Upload className="h-4 w-4 mr-1" />
                    Upload
                  </Button>
                )}
                {!isEmployer && request.status === "rejected" && onUpload && (
                  <Button size="sm" variant="outline" onClick={() => onUpload(request)}>
                    <Upload className="h-4 w-4 mr-1" />
                    Re-upload
                  </Button>
                )}

                {/* Employer actions - view and download only (no approve/reject for document requests) */}
                {isEmployer && request.status === "submitted" && (
                  <>
                    {onView && (
                      <Button size="icon" variant="ghost" onClick={() => onView(request)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {onDownload && (
                      <Button size="icon" variant="ghost" onClick={() => onDownload(request)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}

                {/* View for approved documents */}
                {request.status === "approved" && request.file_url && (
                  <>
                    {onView && (
                      <Button size="icon" variant="ghost" onClick={() => onView(request)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {onDownload && (
                      <Button size="icon" variant="ghost" onClick={() => onDownload(request)}>
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
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(request)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
