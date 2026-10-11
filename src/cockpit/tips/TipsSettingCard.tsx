import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useGuidedTipsState } from "./GuidedTips";

/**
 * "Show tips" in Settings (the "Guided start" mock-up): only for someone who
 * gets tips at all. Off is "No more tips"; turning it back on shows the tips
 * they haven't seen yet, never the ones they put away.
 */
export function TipsSettingCard() {
  const tips = useGuidedTipsState();
  if (!tips.ready) return null;
  const toggle = async (on: boolean) => {
    try {
      if (on) {
        await tips.bringBack();
        toast.success("Tips are on. You'll see the ones you haven't seen yet.");
      } else {
        await tips.turnOff();
        toast.success("Tips are off.");
      }
    } catch {
      toast.error("That didn't save. Please try again.");
    }
  };
  return (
    <Card className="bg-card border-border" data-tips-setting>
      <CardHeader>
        <CardTitle className="text-lg">Tips</CardTitle>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        <div className="flex items-center justify-between gap-4 pr-1">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Show tips</p>
            <p className="text-sm text-muted-foreground">Short tips the first time you use each part of HireFlow. Turning it back on shows the tips you haven't seen yet.</p>
          </div>
          <Switch className="shrink-0 ml-3" checked={!tips.off} onCheckedChange={(checked) => void toggle(checked)} aria-label="Show tips" data-tips-switch />
        </div>
      </CardContent>
    </Card>
  );
}
