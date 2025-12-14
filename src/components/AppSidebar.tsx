import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadCount as useUnreadNotificationCount } from "@/hooks/useNotifications";
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
  Search,
  UserPlus,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  badge?: number;
}

function NavItem({ icon: Icon, label, to, badge }: NavItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function AppSidebar() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: unreadNotifications } = useUnreadNotificationCount();

  const employerNavItems = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: Briefcase, label: "Jobs", to: "/jobs" },
    { icon: Users, label: "Applicants", to: "/applicants" },
    { icon: Calendar, label: "Interviews", to: "/interviews" },
    { icon: MessageSquare, label: "Messages", to: "/messages" },
    { icon: FileText, label: "Documents", to: "/documents" },
    { icon: UserPlus, label: "Team", to: "/team" },
    { icon: BarChart3, label: "Analytics", to: "/analytics" },
  ];

  const candidateNavItems = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: Search, label: "Find Jobs", to: "/find-jobs" },
    { icon: FileText, label: "Applications", to: "/applications" },
    { icon: Calendar, label: "Interviews", to: "/interviews" },
    { icon: MessageSquare, label: "Messages", to: "/messages" },
    { icon: User, label: "Profile", to: "/profile" },
  ];

  const navItems = isEmployer ? employerNavItems : candidateNavItems;

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-xl font-bold text-gradient">HireFlow</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
          />
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-border space-y-1">
        <NavItem icon={Bell} label="Notifications" to="/notifications" badge={unreadNotifications || 0} />
        <NavItem icon={Settings} label="Settings" to="/settings" />
      </div>
    </aside>
  );
}
