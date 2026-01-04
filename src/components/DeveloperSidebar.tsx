import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Briefcase, 
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Terminal,
  LogOut,
  Sparkles
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface DeveloperSidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

const navItems = [
  { 
    title: "Dashboard", 
    path: "/developer", 
    icon: LayoutDashboard,
    description: "Overview & analytics"
  },
  { 
    title: "Users", 
    path: "/developer/users", 
    icon: Users,
    description: "User management"
  },
  { 
    title: "Subscriptions", 
    path: "/developer/subscriptions", 
    icon: CreditCard,
    description: "Subscription analytics"
  },
  { 
    title: "Jobs", 
    path: "/developer/jobs", 
    icon: Briefcase,
    description: "All platform jobs"
  },
  { 
    title: "Activity", 
    path: "/developer/activity", 
    icon: Activity,
    description: "Platform activity logs"
  },
  { 
    title: "Settings", 
    path: "/developer/settings", 
    icon: Settings,
    description: "Developer settings"
  },
];

export default function DeveloperSidebar({ isOpen, isMobile, onToggle, onNavigate }: DeveloperSidebarProps) {
  const { signOut } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  const sidebarVariants = {
    open: { 
      width: isMobile ? "280px" : "260px",
      transition: { duration: 0.3, ease: "easeInOut" as const }
    },
    closed: { 
      width: isMobile ? 0 : "72px",
      transition: { duration: 0.3, ease: "easeInOut" as const }
    }
  };

  const handleNavClick = () => {
    if (isMobile) {
      onNavigate();
    }
  };

  return (
    <motion.aside
      initial={false}
      animate={isOpen ? "open" : "closed"}
      variants={sidebarVariants}
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
      className={cn(
        "h-screen flex flex-col bg-card/95 backdrop-blur-xl border-r border-border/50 relative z-50 overflow-hidden flex-shrink-0",
        isMobile && !isOpen && "hidden",
        isMobile && isOpen && "fixed left-0 top-0"
      )}
    >
      {/* Premium gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      
      {/* Header */}
      <div className="relative z-10 p-4 flex items-center justify-between border-b border-border/30">
        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Terminal className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                  Dev Console
                </h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Admin Panel
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 rounded-lg hover:bg-muted/50"
          >
            {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 relative z-10 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/developer"}
            onClick={handleNavClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
              "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              !isOpen && "justify-center px-2"
            )}
            activeClassName="bg-gradient-to-r from-orange-500/10 to-red-500/10 text-foreground border border-orange-500/20 shadow-sm"
          >
            <item.icon className={cn(
              "h-5 w-5 flex-shrink-0 transition-colors",
              "group-hover:text-orange-400"
            )} />
            <AnimatePresence mode="wait">
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col overflow-hidden"
                >
                  <span className="text-sm font-medium whitespace-nowrap">{item.title}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.description}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="relative z-10 p-3 border-t border-border/30 space-y-2">
        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20"
            >
              <div className="flex items-center gap-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-muted-foreground">Developer Mode Active</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <Separator className="bg-border/30" />
        
        <Button
          variant="ghost"
          onClick={signOut}
          className={cn(
            "w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl",
            !isOpen && "justify-center px-2"
          )}
        >
          <LogOut className="h-4 w-4" />
          {isOpen && <span>Sign Out</span>}
        </Button>
      </div>
    </motion.aside>
  );
}
