import { useEffect, useRef } from "react";
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, useDeleteAllNotifications } from "@/hooks/useNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, MessageSquare, Briefcase, Calendar, Users, AlertCircle, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import type { Notification } from "@/hooks/useNotifications";

const notificationIcons: Record<string, React.ElementType> = {
  message: MessageSquare,
  application: Briefcase,
  interview: Calendar,
  status_update: AlertCircle,
  team: Users,
  system: Bell,
};

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

function NotificationCard({ notification, onMarkAsRead }: NotificationCardProps) {
  const Icon = notificationIcons[notification.type] || Bell;

  const content = (
    <Card 
      className={cn(
        "bg-card border-border hover:border-primary/50 transition-colors cursor-pointer",
        !notification.is_read && "border-l-4 border-l-primary"
      )}
      onClick={() => !notification.is_read && onMarkAsRead(notification.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
            notification.is_read ? "bg-secondary" : "bg-primary/10"
          )}>
            <Icon className={cn(
              "h-5 w-5",
              notification.is_read ? "text-muted-foreground" : "text-primary"
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
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {notification.message}
            </p>
            {!notification.is_read && (
              <Badge variant="secondary" className="mt-2 text-xs">
                New
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (notification.link) {
    return <Link to={notification.link}>{content}</Link>;
  }

  return content;
}

export default function Notifications() {
  const { data: notifications, isLoading } = useNotifications();
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
                When you receive new messages, application updates, or interview invitations, they'll appear here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
