import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, Settings, User, Menu } from "lucide-react";
import TrialCountdownBanner from "@/components/subscription/TrialCountdownBanner";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/applicants": "Applicants",
  "/interviews": "Interviews",
  "/messages": "Messages",
  "/documents": "Documents",
  "/team": "Team",
  "/analytics": "Analytics",
  "/find-jobs": "Find Jobs",
  "/applications": "My Applications",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/profile": "Profile",
};

interface AppHeaderProps {
  onMenuClick: () => void;
  isMobile: boolean;
}

export default function AppHeader({ onMenuClick, isMobile }: AppHeaderProps) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  const userName = user?.user_metadata?.full_name || user?.email || "User";
  const pageTitle = pageTitles[location.pathname] || "";
  
  // Hide title on detail pages (routes with IDs like /applicants/:id, /jobs/:id)
  const isDetailPage = /\/(applicants|jobs|interviews|applications)\/[a-zA-Z0-9-]+/.test(location.pathname);

  return (
    <header className="h-14 md:h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 overflow-hidden">
      {/* Left side - Menu button (mobile) + Page Title */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="h-9 w-9 text-muted-foreground hover:text-primary flex-shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        {!isDetailPage && pageTitle && (
          <h1 className="text-lg md:text-xl font-semibold text-foreground truncate">{pageTitle}</h1>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
        {/* Trial Countdown */}
        {role === 'employer' && <TrialCountdownBanner />}
        
        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground">{userName}</span>
                <span className="text-xs text-muted-foreground capitalize">{role}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
