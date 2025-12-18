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
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-card/95 backdrop-blur-lg border border-border rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4">
            <div className="flex items-center gap-3 pr-4 border-r border-border">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">{selectedCount}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                applicant{selectedCount !== 1 ? "s" : ""} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              {canManagePipeline && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReject}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              )}
              
              {canScheduleInterviews && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onScheduleInterview}
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Schedule Interview
                </Button>
              )}
              
              {canSendDocuments && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSendDocument}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Send Document
                </Button>
              )}
              
              {canMessageCandidates && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSendMessage}
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Message
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              className="ml-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
