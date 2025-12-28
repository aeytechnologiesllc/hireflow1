import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { useUnreadCount as useUnreadNotificationCount } from "@/hooks/useNotifications";
import { usePendingDocumentsCount } from "@/hooks/usePendingDocumentsCount";
import { useEmployerPendingDocumentsCount } from "@/hooks/useEmployerPendingDocumentsCount";
import { usePendingActionsCount } from "@/hooks/usePendingActionsCount";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useNewApplicantsCount } from "@/hooks/useNewApplicantsCount";
import { useUpcomingInterviewsCount } from "@/hooks/useUpcomingInterviewsCount";
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
  User,
  ClipboardCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import hireflowLogo from "@/assets/hireflow-logo.png";
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
        "group relative flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
        isActive
          ? "bg-primary/15 text-primary nav-item-active-glow"
          : "text-muted-foreground hover:text-foreground hover:bg-primary/5",
        collapsed && "justify-center px-2"
      )}
    >
      {/* Hover glow effect */}
      <div className={cn(
        "absolute inset-0 rounded-lg bg-primary/0 transition-all duration-300",
        "group-hover:bg-primary/5 group-hover:shadow-[0_0_20px_hsl(var(--primary)/0.15)]",
        isActive && "bg-primary/10 shadow-[0_0_25px_hsl(var(--primary)/0.2)]"
      )} />
      
      <div className={cn("relative flex items-center z-10", collapsed ? "gap-0" : "gap-3")}>
        <Icon className={cn(
          "h-5 w-5 shrink-0 transition-all duration-300",
          isActive && "text-primary animate-icon-glow",
          !isActive && "group-hover:text-primary/80 group-hover:scale-110",
          highlight && !isActive && "text-primary"
        )} />
        {!collapsed && (
          <span className={cn(
            "transition-all duration-300",
            isActive && "text-primary font-semibold"
          )}>
            {label}
          </span>
        )}
      </div>
      {badge !== undefined && badge > 0 && !collapsed && (
        <span className="relative z-10 px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.4)]">
          {badge}
        </span>
      )}
      {badge !== undefined && badge > 0 && collapsed && (
        <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2 bg-card/95 backdrop-blur-sm border-primary/20">
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
  isOpen: boolean;
  isMobile: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export default function AppSidebar({ isOpen, isMobile, onToggle, onNavigate }: AppSidebarProps) {
  const { role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const isEmployer = role === "employer";
  const { data: unreadNotifications } = useUnreadNotificationCount();
  const { data: pendingDocuments } = usePendingDocumentsCount();
  const { data: employerPendingDocuments } = useEmployerPendingDocumentsCount();
  const { data: pendingActions } = usePendingActionsCount();
  const { data: unreadMessages } = useUnreadMessagesCount();
  const { data: newApplicants } = useNewApplicantsCount();
  const { data: upcomingInterviews } = useUpcomingInterviewsCount();

  const employerNavItems: NavItemProps[] = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: Briefcase, label: "Jobs", to: "/jobs" },
    { icon: Users, label: "Applicants", to: "/applicants", badge: newApplicants || 0, highlight: (newApplicants || 0) > 0 },
    { icon: Calendar, label: "Interviews", to: "/interviews", badge: upcomingInterviews || 0 },
    { icon: MessageSquare, label: "Messages", to: "/messages", badge: unreadMessages || 0, highlight: (unreadMessages || 0) > 0 },
    { icon: FileText, label: "Documents", to: "/documents", badge: employerPendingDocuments || 0, highlight: (employerPendingDocuments || 0) > 0 },
    { icon: UserPlus, label: "Team", to: "/team" },
    { icon: BarChart3, label: "Analytics", to: "/analytics" },
  ];

  // Team member navigation - always show all tabs, actions are controlled on individual pages
  const teamMemberNavItems: NavItemProps[] = [
    { icon: Building2, label: "Team Portal", to: "/team-portal" },
    { icon: Briefcase, label: "Jobs", to: "/jobs" },
    { icon: Users, label: "Applicants", to: "/applicants", badge: newApplicants || 0, highlight: (newApplicants || 0) > 0 },
    { icon: Calendar, label: "Interviews", to: "/interviews", badge: upcomingInterviews || 0 },
    { icon: MessageSquare, label: "Messages", to: "/messages", badge: unreadMessages || 0, highlight: (unreadMessages || 0) > 0 },
    { icon: FileText, label: "Documents", to: "/documents", badge: employerPendingDocuments || 0, highlight: (employerPendingDocuments || 0) > 0 },
  ];

  const candidateNavItems: NavItemProps[] = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: Briefcase, label: "Apply Now", to: "/apply" },
    { icon: ClipboardCheck, label: "Applications", to: "/applications", badge: pendingActions || 0, highlight: (pendingActions || 0) > 0 },
    { icon: Calendar, label: "Interviews", to: "/interviews", badge: upcomingInterviews || 0 },
    { icon: MessageSquare, label: "Messages", to: "/messages", badge: unreadMessages || 0, highlight: (unreadMessages || 0) > 0 },
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

  // Desktop: show collapsed or expanded based on isOpen
  // Mobile: show as slide-out drawer
  const collapsed = !isMobile && !isOpen;

  // Critical: on mobile when closed, remove entirely so it can't affect layout
  if (isMobile && !isOpen) {
    return null;
  }

  return (
    <aside className={cn(
      "flex flex-col transition-all duration-300 sidebar-gradient-border z-50",
      "bg-gradient-to-b from-card via-card to-card/95",
      // Desktop: keep in normal layout flow
      !isMobile && "relative min-h-screen shrink-0",
      // Desktop: collapsed or expanded width
      !isMobile && (collapsed ? "w-16" : "w-64"),
      // Mobile: fixed overlay drawer (only rendered when open)
      isMobile && "fixed left-0 top-0 h-full translate-x-0 w-[280px] max-w-[85vw]"
    )}>
      {/* Animated gradient background overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 animate-sidebar-gradient pointer-events-none" />
      
      {/* Subtle glow orbs */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-glow-pulse pointer-events-none" />
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-24 h-24 bg-accent/15 rounded-full blur-3xl animate-glow-pulse pointer-events-none" style={{ animationDelay: '2s' }} />

      {/* Logo */}
      <div className={cn(
        "relative z-10 h-16 flex items-center",
        collapsed && !isMobile ? "justify-center px-2" : "gap-3 px-6"
      )}>
        <div className="relative shrink-0">
          {/* Glow effect behind logo */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/40 via-fuchsia-500/30 to-emerald-500/20 blur-lg scale-125 animate-glow-pulse" />
          <img 
            src={hireflowLogo} 
            alt="HireFlow" 
            className="relative w-9 h-9 rounded-xl animate-logo-breathe object-cover"
          />
        </div>
        {(!collapsed || isMobile) && (
          <span className="text-xl font-bold bg-gradient-to-r from-white via-white to-gray-300 bg-clip-text text-transparent tracking-tight">
            HireFlow
          </span>
        )}
        {/* Close button on mobile */}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="ml-auto h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Gradient divider */}
      <div className="relative z-10 mx-4 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Collapse Toggle - Desktop only */}
      {!isMobile && (
        <div className={cn("relative z-10 px-2 py-2 flex", collapsed ? "justify-center" : "justify-end")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-300"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {/* Navigation */}
      <nav className="relative z-10 flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
            badge={item.badge}
            highlight={item.highlight}
            collapsed={collapsed && !isMobile}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* Bottom section with gradient divider */}
      <div className="relative z-10">
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="p-2 space-y-1">
          <NavItem 
            icon={Bell} 
            label="Notifications" 
            to="/notifications" 
            badge={unreadNotifications || 0} 
            collapsed={collapsed && !isMobile}
            onNavigate={onNavigate}
          />
          <NavItem 
            icon={Settings} 
            label="Settings" 
            to="/settings" 
            collapsed={collapsed && !isMobile}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    </aside>
  );
}