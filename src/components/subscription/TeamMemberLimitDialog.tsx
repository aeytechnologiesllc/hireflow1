import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Users, Sparkles } from "lucide-react";

interface TeamMemberLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCount?: number;
  limit?: number;
}

export function TeamMemberLimitDialog({
  open,
  onOpenChange,
  currentCount = 0,
  limit = 0,
}: TeamMemberLimitDialogProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate("/settings?tab=subscription");
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <ResponsiveDialogTitle className="text-center">
            Team Member Limit Reached
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-center">
            You've reached your team member limit ({currentCount}/{limit}).
            <span className="block mt-1">
              Upgrade your plan to add more team members and grow your hiring team.
            </span>
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleUpgrade} className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            Upgrade Plan
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Maybe Later
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
