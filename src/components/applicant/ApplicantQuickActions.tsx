import { Button } from "@/components/ui/button";
import { MessageSquare, FileText, Download, CheckCircle, XCircle, Loader2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ApplicantQuickActionsProps {
  onMessage: () => void;
  onViewNotes: () => void;
  onDownloadDossier: () => void;
  onHire: () => void;
  onReject: () => void;
  isGeneratingDossier?: boolean;
  isRejected?: boolean;
  isHired?: boolean;
  canMessage?: boolean;
  canManagePipeline?: boolean;
  className?: string;
  isMobile?: boolean;
}

export function ApplicantQuickActions({
  onMessage,
  onViewNotes,
  onDownloadDossier,
  onHire,
  onReject,
  isGeneratingDossier = false,
  isRejected = false,
  isHired = false,
  canMessage = true,
  canManagePipeline = true,
  className,
  isMobile = false,
}: ApplicantQuickActionsProps) {
  if (isMobile) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          variant="outline"
          size="sm"
          onClick={onMessage}
          disabled={!canMessage}
          className="gap-1.5"
        >
          <MessageSquare className="h-4 w-4" />
          Message
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border">
            <DropdownMenuItem onClick={onViewNotes}>
              <FileText className="h-4 w-4 mr-2" />
              View Notes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownloadDossier} disabled={isGeneratingDossier}>
              {isGeneratingDossier ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download Dossier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!isHired && !isRejected && canManagePipeline && (
              <>
                <DropdownMenuItem 
                  onClick={onHire}
                  className="text-primary focus:text-primary"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Hire Candidate
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={onReject}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onMessage}
        disabled={!canMessage}
        className="gap-1.5"
      >
        <MessageSquare className="h-4 w-4" />
        Message
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onViewNotes}
        className="gap-1.5"
      >
        <FileText className="h-4 w-4" />
        Notes
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onDownloadDossier}
        disabled={isGeneratingDossier}
        className="gap-1.5"
      >
        {isGeneratingDossier ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Dossier
      </Button>

      {!isHired && !isRejected && canManagePipeline && (
        <>
          <Button
            variant="default"
            size="sm"
            onClick={onHire}
            className="gap-1.5 bg-primary hover:bg-primary/90"
          >
            <CheckCircle className="h-4 w-4" />
            Hire
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </>
      )}
    </div>
  );
}

export default ApplicantQuickActions;
