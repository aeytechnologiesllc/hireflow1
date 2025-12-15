import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ApplicantNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  currentNotes: string | null;
  candidateName: string;
}

export default function ApplicantNotesDialog({
  open,
  onOpenChange,
  applicationId,
  currentNotes,
  candidateName,
}: ApplicantNotesDialogProps) {
  const [notes, setNotes] = useState(currentNotes || "");
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  // Sync state when dialog opens or currentNotes changes
  useEffect(() => {
    if (open) {
      setNotes(currentNotes || "");
    }
  }, [open, currentNotes]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({ employer_notes: notes || null })
        .eq("id", applicationId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
      toast.success("Notes saved successfully");
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving notes:", error);
      toast.error("Failed to save notes");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Internal Notes
          </DialogTitle>
          <DialogDescription>
            Add private notes about {candidateName}. These notes are only visible to your team.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this candidate..."
            className="min-h-[200px] resize-none"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Notes are automatically saved when you click Save. Only your team can see these notes.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Notes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
