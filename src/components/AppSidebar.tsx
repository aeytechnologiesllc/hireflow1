import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { useUnreadCount as useUnreadNotificationCount } from "@/hooks/useNotifications";
import { usePendingDocumentsCount } from "@/hooks/usePendingDocumentsCount";
import { useEmployerPendingDocumentsCount } from "@/hooks/useEmployerPendingDocumentsCount";
import { usePendingActionsCount } from "@/hooks/usePendingActionsCount";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  MessageSquare,
  FileText,
  BarChart3,
  Settings,
  Bell,
  UserPlus,
  Sparkles,
  User,
  ClipboardCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  badge?: number;
  highlight?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}

function NavItem({ icon: Icon, label, to, badge, highlight, collapsed, onNavigate }: NavItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to;

  const content = (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        highlight && !isActive && "animate-pulse",
        collapsed && "justify-center px-2"
      )}
    >
      <div className={cn("flex items-center", collapsed ? "gap-0" : "gap-3")}>
        <Icon className={cn("h-5 w-5 shrink-0", highlight && !isActive && "text-primary")} />
        {!collapsed && <span>{label}</span>}
      </div>
      {badge !== undefined && badge > 0 && !collapsed && (
        <span className={cn(
          "px-2 py-0.5 text-xs rounded-full",
          highlight ? "bg-primary text-primary-foreground animate-bounce" : "bg-primary text-primary-foreground"
        )}>
          {badge}
        </span>
      )}
      {badge !== undefined && badge > 0 && collapsed && (
        <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full" />
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
              {badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export default function AppSidebar({ collapsed, onToggle, onNavigate }: AppSidebarProps) {
  const { role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const isEmployer = role === "employer";
  const { data: unreadNotifications } = useUnreadNotificationCount();
  const { data: pendingDocuments } = usePendingDocumentsCount();
  const { data: employerPendingDocuments } = useEmployerPendingDocumentsCount();
  const { data: pendingActions } = usePendingActionsCount();

  const employerNavItems: NavItemProps[] = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: Briefcase, label: "Jobs", to: "/jobs" },
    { icon: Users, label: "Applicants", to: "/applicants" },
    { icon: Calendar, label: "Interviews", to: "/interviews" },
    { icon: MessageSquare, label: "Messages", to: "/messages" },
    { icon: FileText, label: "Documents", to: "/documents", badge: employerPendingDocuments || 0, highlight: (employerPendingDocuments || 0) > 0 },
    { icon: UserPlus, label: "Team", to: "/team" },
    { icon: BarChart3, label: "Analytics", to: "/analytics" },
  ];

  // Team member navigation - always show all tabs, actions are controlled on individual pages
  const teamMemberNavItems: NavItemProps[] = [
    { icon: Building2, label: "Team Portal", to: "/team-portal" },
    { icon: Briefcase, label: "Jobs", to: "/jobs" },
    { icon: Users, label: "Applicants", to: "/applicants" },
    { icon: Calendar, label: "Interviews", to: "/interviews" },
    { icon: MessageSquare, label: "Messages", to: "/messages" },
    { icon: FileText, label: "Documents", to: "/documents", badge: employerPendingDocuments || 0, highlight: (employerPendingDocuments || 0) > 0 },
  ];

  const candidateNavItems: NavItemProps[] = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: Briefcase, label: "Apply Now", to: "/apply" },
    { icon: ClipboardCheck, label: "Applications", to: "/applications", badge: pendingActions || 0, highlight: (pendingActions || 0) > 0 },
    { icon: Calendar, label: "Interviews", to: "/interviews" },
    { icon: MessageSquare, label: "Messages", to: "/messages" },
    { icon: FileText, label: "Documents", to: "/documents", badge: pendingDocuments || 0, highlight: (pendingDocuments || 0) > 0 },
    { icon: User, label: "Profile", to: "/profile" },
  ];

  // Determine which nav items to show
  let navItems: NavItemProps[];
  if (isTeamMember) {
    navItems = teamMemberNavItems;
  } else if (isEmployer) {
    navItems = employerNavItems;
  } else {
    navItems = candidateNavItems;
  }

  return (
    <aside className={cn(
      "min-h-screen bg-card border-r border-border flex flex-col shrink-0 transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center border-b border-border",
        collapsed ? "justify-center px-2" : "gap-3 px-6"
      )}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        {!collapsed && <span className="text-xl font-bold text-gradient">HireFlow</span>}
      </div>

      {/* Collapse Toggle */}
      <div className={cn("px-2 py-2 flex", collapsed ? "justify-center" : "justify-end")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
            badge={item.badge}
            highlight={item.highlight}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-2 border-t border-border space-y-1">
        <NavItem 
          icon={Bell} 
          label="Notifications" 
          to="/notifications" 
          badge={unreadNotifications || 0} 
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <NavItem 
          icon={Settings} 
          label="Settings" 
          to="/settings" 
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
    </aside>
  );
}