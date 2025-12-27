import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { XCircle, Calendar, FileText, MessageSquare, X } from "lucide-react";

interface BulkActionsBarProps {
  selectedCount: number;
  onReject: () => void;
  onScheduleInterview: () => void;
  onSendDocument: () => void;
  onSendMessage: () => void;
  onClearSelection: () => void;
  canManagePipeline?: boolean;
  canScheduleInterviews?: boolean;
  canSendDocuments?: boolean;
  canMessageCandidates?: boolean;
}

export default function BulkActionsBar({
  selectedCount,
  onReject,
  onScheduleInterview,
  onSendDocument,
  onSendMessage,
  onClearSelection,
  canManagePipeline = true,
  canScheduleInterviews = true,
  canSendDocuments = true,
  canMessageCandidates = true,
}: BulkActionsBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50"
        >
          <div className="bg-card/95 backdrop-blur-lg border border-border rounded-2xl shadow-2xl px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center justify-between sm:justify-start gap-3 sm:pr-4 sm:border-r border-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-base sm:text-lg font-bold text-primary">{selectedCount}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  applicant{selectedCount !== 1 ? "s" : ""} selected
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClearSelection}
                className="sm:hidden text-muted-foreground hover:text-foreground h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2">
              {canManagePipeline && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReject}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 h-9"
                >
                  <XCircle className="h-4 w-4" />
                  <span className="hidden xs:inline sm:inline">Reject</span>
                </Button>
              )}
              
              {canScheduleInterviews && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onScheduleInterview}
                  className="gap-2 h-9"
                >
                  <Calendar className="h-4 w-4" />
                  <span className="hidden xs:inline sm:inline">Interview</span>
                </Button>
              )}
              
              {canSendDocuments && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSendDocument}
                  className="gap-2 h-9"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden xs:inline sm:inline">Document</span>
                </Button>
              )}
              
              {canMessageCandidates && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSendMessage}
                  className="gap-2 h-9"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden xs:inline sm:inline">Message</span>
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              className="hidden sm:flex ml-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
