import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Globe, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvaInterviewConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (duration: number) => void;
  candidateName: string;
  language?: string;
}

const DURATION_OPTIONS = [
  { value: 5, label: "5 min", description: "Quick screening" },
  { value: 10, label: "10 min", description: "Standard" },
  { value: 15, label: "15 min", description: "In-depth" },
  { value: 20, label: "20 min", description: "Comprehensive" },
];

export function AvaInterviewConfigDialog({
  open,
  onOpenChange,
  onConfirm,
  candidateName,
  language = "English",
}: AvaInterviewConfigDialogProps) {
  const [selectedDuration, setSelectedDuration] = useState(10);

  const handleConfirm = () => {
    onConfirm(selectedDuration);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Set Up Ava Interview
          </DialogTitle>
          <DialogDescription>
            Configure the interview for <span className="font-medium text-foreground">{candidateName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Duration Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Interview Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedDuration(option.value)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-lg border transition-all",
                    selectedDuration === option.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <span className={cn(
                    "text-lg font-semibold",
                    selectedDuration === option.value ? "text-primary" : "text-foreground"
                  )}>
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Language Display (read-only) */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Interview Language</span>
            </div>
            <Badge variant="secondary">{language}</Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
