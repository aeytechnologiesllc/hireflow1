import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  UserPlus, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Activity
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useActivityFeed, type ActivityItem } from "@/hooks/useActivityFeed";
import { cn } from "@/lib/utils";

const activityConfig: Record<ActivityItem["type"], { icon: React.ElementType; color: string; bgColor: string }> = {
  application: { icon: UserPlus, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  interview: { icon: Calendar, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  document: { icon: FileText, color: "text-amber-500", bgColor: "bg-amber-500/10" },
  status_change: { icon: RefreshCw, color: "text-muted-foreground", bgColor: "bg-muted" },
  hired: { icon: CheckCircle2, color: "text-primary", bgColor: "bg-primary/10" },
  rejected: { icon: XCircle, color: "text-destructive", bgColor: "bg-destructive/10" },
};

function ActivityItemRow({ activity }: { activity: ActivityItem }) {
  const navigate = useNavigate();
  const config = activityConfig[activity.type];
  const Icon = config.icon;

  const handleClick = () => {
    if (activity.link) {
      navigate(activity.link);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors",
        activity.link && "cursor-pointer hover:bg-muted/50"
      )}
    >
      <div className={cn("p-2 rounded-lg shrink-0", config.bgColor)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{activity.title}</p>
        <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

interface ActivityFeedProps {
  limit?: number;
  className?: string;
}

export default function ActivityFeed({ limit = 10, className }: ActivityFeedProps) {
  const { activities, isLoading } = useActivityFeed(limit);

  return (
    <Card className={cn("bg-card border-border", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[320px] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-3">
                  <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-1">
              {activities.map((activity) => (
                <ActivityItemRow key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Activity will appear here as you manage applicants
              </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
