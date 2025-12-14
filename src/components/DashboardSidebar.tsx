import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import hireflowLogo from "@/assets/hireflow-logo.png";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  isActive?: boolean;
}

function NavItem({ icon: Icon, label, to, isActive }: NavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}

export default function DashboardSidebar() {
  const { role } = useAuth();
  const location = useLocation();
  const isEmployer = role === "employer";

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
    { icon: FileText, label: "Documents", to: "/documents" },
  ];

  const navItems = isEmployer ? employerNavItems : candidateNavItems;

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-border">
        <img src={hireflowLogo} alt="HireFlow" className="w-8 h-8 object-contain" />
        <span className="text-xl font-bold text-gradient">HireFlow</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
            isActive={location.pathname === item.to}
          />
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-border space-y-1">
        <NavItem
          icon={Bell}
          label="Notifications"
          to="/notifications"
          isActive={location.pathname === "/notifications"}
        />
        <NavItem
          icon={Settings}
          label="Settings"
          to="/settings"
          isActive={location.pathname === "/settings"}
        />
      </div>
    </aside>
  );
}
