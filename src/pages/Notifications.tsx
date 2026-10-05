import { useEffect, useRef } from "react";
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, useDeleteAllNotifications } from "@/hooks/useNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, MessageSquare, Briefcase, Calendar, Users, AlertCircle, Trash2, ChevronRight, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import type { Notification } from "@/hooks/useNotifications";
import { parseIntegrityCard } from "@/cockpit/lib/assessmentRecord";

const notificationIcons: Record<string, React.ElementType> = {
  message: MessageSquare,
  application: Briefcase,
  interview: Calendar,
  status_update: AlertCircle,
  team: Users,
  system: Bell,
  // One live card per applicant per test (public.assessment_integrity_alert):
  // it counts up and comes back as unread on every new switch away or paste.
  integrity: ShieldAlert,
};

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

function NotificationCard({ notification, onMarkAsRead }: NotificationCardProps) {
  const Icon = notificationIcons[notification.type] || Bell;
  // The integrity card: "Integrity — Robin Okafor", then the test and the
  // running tally as separate marks, and a link straight to that test's
  // timeline. Its created_at is the time of the latest event ("updated").
  const integrity = notification.type === "integrity" ? parseIntegrityCard(notification) : null;
  const link = integrity?.link ?? notification.link;

  const content = (
    <Card 
      className={cn(
        "bg-card border-border card-interactive",
        !notification.is_read && "border-l-4 border-l-primary"
      )}
      onClick={() => !notification.is_read && onMarkAsRead(notification.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
              integrity ? "" : notification.is_read ? "bg-secondary" : "bg-primary/10"
            )}
            style={integrity ? { background: "var(--amber-bg)", color: "var(--amber-fg)" } : undefined}
          >
            <Icon className={cn(
              "h-5 w-5",
              integrity ? "" : notification.is_read ? "text-muted-foreground" : "text-primary"
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className={cn(
                "font-medium",
                notification.is_read ? "text-muted-foreground" : "text-foreground"
              )}>
                {notification.title}
              </h3>
              {/* An integrity card keeps its time under the title: the name
                  needs the width, and "updated" is the point of the line. */}
              {!integrity && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
            {integrity ? (
              <>
                <p className="text-sm text-muted-foreground mt-1">
                  {integrity.during ? `During ${integrity.during} · ` : ""}
                  updated {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What was recorded">
                  {integrity.parts.map((part) => (
                    <li
                      key={part}
                      className="rounded-md border px-2 py-0.5 text-xs font-medium leading-snug"
                      style={{ color: "var(--amber-fg)", background: "var(--amber-bg)", borderColor: "var(--brass-line, transparent)" }}
                    >
                      {part.charAt(0).toUpperCase() + part.slice(1)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {notification.message}
              </p>
            )}
            {!notification.is_read && (
              <Badge variant="secondary" className="mt-2 text-xs">
                New
              </Badge>
            )}
          </div>
          {link && (
            <ChevronRight className="h-5 w-5 text-muted-foreground/50 hidden max-sm:block self-center flex-shrink-0 animate-fade-in" />
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (link) {
    return <Link to={link}>{content}</Link>;
  }

  return content;
}

export default function Notifications() {
  const { data: notifications, isLoading, refetch: refetchNotifications } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const deleteAll = useDeleteAllNotifications();
  

  // Track if we've already auto-marked as read this session
  const hasAutoMarkedRef = useRef(false);

  // Auto-mark all notifications as read when visiting the page
  useEffect(() => {
    if (
      notifications && 
      notifications.some(n => !n.is_read) && 
      !hasAutoMarkedRef.current &&
      !markAllAsRead.isPending
    ) {
      hasAutoMarkedRef.current = true;
      markAllAsRead.mutate();
    }
  }, [notifications, markAllAsRead]);

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0;

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate(id);
  };

  const handleClearAll = () => {
    deleteAll.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Notifications</h2>
          <p className="text-muted-foreground mt-1">
            Stay updated on your hiring activity
            {unreadCount > 0 && (
              <span className="ml-2 text-primary">
                ({unreadCount} unread)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2 h-9"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              <Check className="h-4 w-4" />
              <span className="hidden sm:inline">Mark All as Read</span>
              <span className="sm:hidden">Read All</span>
            </Button>
          )}
          {notifications && notifications.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2 h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClearAll}
              disabled={deleteAll.isPending}
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear All</span>
              <span className="sm:hidden">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={handleMarkAsRead}
            />
          ))
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <Bell className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No notifications</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Application updates and interview invitations will appear here. Messages live in their own tab.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
