import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Briefcase,
  Users,
  CalendarDays,
  MessageSquare,
  FileText,
  UsersRound,
  BarChart3,
  Clock,
  ChevronDown,
  Bell,
  MoreHorizontal,
  CalendarDays as CalIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCockpitAccount } from "./hooks/useCockpitData";
import { useUnreadCount } from "@/hooks/useNotifications";
import { Wordmark } from "./components/Wordmark";
import { AccountMenu } from "./components/AccountMenu";

interface NavItem {
  label: string;
  to: string;
  icon: typeof Home;
}

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: Home },
  { label: "Jobs", to: "/jobs", icon: Briefcase },
  { label: "Applicants", to: "/applicants", icon: Users },
  { label: "Interviews", to: "/interviews", icon: CalendarDays },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "Documents", to: "/documents", icon: FileText },
  { label: "Team", to: "/team", icon: UsersRound },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
];

const MOBILE_TABS = [
  { label: "Dashboard", to: "/dashboard", icon: Home },
  { label: "Jobs", to: "/jobs", icon: Briefcase },
  { label: "Applicants", to: "/applicants", icon: Users },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "More", to: "/more", icon: MoreHorizontal },
];

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/applicants": "Applicants",
  "/interviews": "Interviews",
  "/messages": "Messages",
  "/documents": "Documents",
  "/team": "Team",
  "/analytics": "Analytics",
  "/more": "More",
};

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

function AccountChip({ compact }: { compact?: boolean }) {
  const { account } = useCockpitAccount();
  return (
    <AccountMenu align="end" side="bottom">
      <button
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full px-2.5 py-1.5"
        style={{ background: "hsl(156 16% 9% / 0.8)", border: "1px solid hsl(150 12% 16% / 0.9)" }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: "linear-gradient(180deg, hsl(152 40% 28%), hsl(152 40% 20%))", color: "hsl(150 30% 90%)" }}
        >
          {account.initials}
        </span>
        {!compact && (
          <span className="text-[13px] font-medium" style={{ color: "hsl(150 28% 90%)" }}>
            {account.name}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5" style={{ color: "hsl(150 10% 58%)" }} />
      </button>
    </AccountMenu>
  );
}

function TrialBadge() {
  const { account, showTrialAccess } = useCockpitAccount();

  if (!showTrialAccess) return null;

  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{ background: "hsl(38 40% 14% / 0.4)", border: "1px solid hsl(38 50% 45% / 0.3)" }}
    >
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" style={{ color: "hsl(38 64% 66%)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "hsl(38 64% 72%)" }}>
          {account.trialDaysLeft} days left
        </span>
      </div>
      <div className="mt-1 text-[12px]" style={{ color: "hsl(150 10% 58%)" }}>
        Your trial ends {account.trialEnds}
      </div>
    </div>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  const { account } = useCockpitAccount();
  return (
    <aside
      className="hidden md:flex w-[216px] shrink-0 flex-col px-3 py-5"
      style={{ background: "hsl(var(--ck-sidebar))", borderRight: "1px solid hsl(150 12% 12% / 0.7)" }}
    >
      <div className="px-2 pb-6 pt-1">
        <Wordmark size={26} />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors"
              style={{
                background: active ? "hsl(152 28% 13%)" : "transparent",
                color: active ? "hsl(150 32% 94%)" : "hsl(150 10% 64%)",
              }}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: active ? "hsl(38 64% 68%)" : "hsl(150 12% 56%)" }} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-3">
        <TrialBadge />
        <AccountMenu align="start" side="top">
          <button
            aria-label="Account menu"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-[hsl(152_24%_11%)]"
            style={{ background: "hsl(156 16% 9%)", border: "1px solid hsl(150 12% 15% / 0.9)" }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold"
              style={{ background: "linear-gradient(180deg, hsl(152 40% 28%), hsl(152 40% 20%))", color: "hsl(150 30% 90%)" }}
            >
              {account.initials}
            </span>
            <span className="flex-1 text-left text-[14px] font-medium" style={{ color: "hsl(150 28% 90%)" }}>
              {account.name}
            </span>
            <ChevronDown className="h-4 w-4" style={{ color: "hsl(150 10% 58%)" }} />
          </button>
        </AccountMenu>
      </div>
    </aside>
  );
}

function NotificationBell({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { data: unread = 0 } = useUnreadCount();
  return (
    <button
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      onClick={() => navigate("/notifications")}
      className="relative flex items-center justify-center rounded-lg"
      style={{
        width: 36,
        height: 36,
        background: compact ? "transparent" : "hsl(156 16% 9% / 0.7)",
        border: compact ? "none" : "1px solid hsl(150 12% 15% / 0.9)",
      }}
    >
      <Bell className="h-5 w-5" style={{ color: "hsl(38 60% 64%)" }} />
      {unread > 0 && (
        <span
          className="absolute -right-1 -top-1 flex items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
          style={{ minWidth: 16, height: 16, background: "hsl(8 70% 55%)", color: "hsl(0 0% 100%)", border: "1.5px solid hsl(var(--ck-bg))" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

function TodayPill() {
  return (
    <button
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px]"
      style={{ background: "hsl(156 16% 9% / 0.7)", border: "1px solid hsl(150 12% 15% / 0.9)", color: "hsl(150 14% 72%)" }}
    >
      <CalIcon className="h-4 w-4" style={{ color: "hsl(150 12% 56%)" }} />
      Today
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}

function DesktopTopBar() {
  const { pathname } = useLocation();
  const { account } = useCockpitAccount();
  const isDashboard = isActive(pathname, "/dashboard");
  // Dashboard: breadcrumb on the left (matches mockup). Other pages: the big
  // page title lives in the PageHeader, so the bar only carries the account +
  // date controls on the right — no duplicate-title breadcrumb.
  return (
    <header className="hidden md:flex h-16 shrink-0 items-center justify-between px-10">
      {isDashboard ? (
        <>
          <div className="flex items-center gap-2 text-[14px]">
            <span style={{ color: "hsl(38 60% 64%)" }}>Dashboard</span>
            <span style={{ color: "hsl(150 10% 38%)" }}>/</span>
            <AccountMenu align="start" side="bottom">
              <button aria-label="Account menu" className="flex items-center gap-1.5" style={{ color: "hsl(150 12% 64%)" }}>
                {account.name}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </AccountMenu>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <TodayPill />
          </div>
        </>
      ) : (
        <>
          <div />
          <div className="flex items-center gap-3">
            <NotificationBell />
            <AccountChip />
            <TodayPill />
          </div>
        </>
      )}
    </header>
  );
}

function MobileTopBar() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "";
  return (
    <header
      className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3"
      style={{ background: "hsl(var(--ck-bg))" }}
    >
      <h1 className="min-w-0 flex-1 truncate font-display text-[26px]" style={{ color: "hsl(150 32% 95%)", fontWeight: 500 }}>
        {title}
      </h1>
      <div className="flex shrink-0 items-center gap-2">
        <AccountChip />
        <NotificationBell compact />
      </div>
    </header>
  );
}

function MobileTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const moreActive = ["/interviews", "/documents", "/team", "/analytics", "/more", "/settings"].some((p) => isActive(pathname, p));
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around px-2 pt-2"
      style={{
        background: "hsl(156 20% 4%)",
        borderTop: "1px solid hsl(150 12% 12%)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
      }}
    >
      {MOBILE_TABS.map((tab) => {
        const active = tab.to === "/more" ? moreActive : isActive(pathname, tab.to);
        const Icon = tab.icon;
        return (
          <button
            key={tab.to}
            onClick={() => navigate(tab.to)}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 py-1"
          >
            <Icon className="h-[22px] w-[22px]" style={{ color: active ? "hsl(38 64% 66%)" : "hsl(150 12% 52%)" }} />
            <span className="text-[11px] font-medium" style={{ color: active ? "hsl(38 64% 70%)" : "hsl(150 12% 52%)" }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function CockpitShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  // Detail/sub-routes (e.g. /applicants/:id) and the messages thread render
  // their own mobile header, so we suppress the shared mobile app bar there.
  const SELF_HEADER_ROUTES = ["/messages"];
  const hasOwnMobileHeader = !(pathname in TITLES) || SELF_HEADER_ROUTES.includes(pathname);
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden" style={{ background: "hsl(var(--ck-bg))" }}>
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ambient depth — one cheap, living jade aurora behind the cockpit */}
        <div className="ck-aurora" aria-hidden />
        <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
          <DesktopTopBar />
          {!hasOwnMobileHeader && <MobileTopBar />}
          <main
            className="ck-scroll flex-1 overflow-y-auto overflow-x-hidden px-4 pb-24 pt-1 md:px-10 md:pb-10 md:pt-2"
            style={isMobile ? undefined : undefined}
          >
            <div className="mx-auto w-full max-w-[1240px]">{children}</div>
          </main>
          <MobileTabBar />
        </div>
      </div>
    </div>
  );
}

export default CockpitShell;
