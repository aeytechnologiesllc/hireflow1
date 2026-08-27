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
        style={{ background: "color-mix(in srgb, var(--hf-surface-raised) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)" }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: "linear-gradient(180deg, var(--hf-green-border), var(--hf-green-soft))", color: "var(--hf-text)" }}
        >
          {account.initials}
        </span>
        {!compact && (
          <span className="text-[13px] font-medium" style={{ color: "var(--hf-text)" }}>
            {account.name}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--hf-text-muted)" }} />
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
      style={{ background: "color-mix(in srgb, var(--hf-gold-hover) 40%, transparent)", border: "1px solid color-mix(in srgb, var(--hf-gold-hover) 30%, transparent)" }}
    >
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" style={{ color: "var(--hf-gold)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--hf-gold)" }}>
          {account.trialDaysLeft} days left
        </span>
      </div>
      <div className="mt-1 text-[12px]" style={{ color: "var(--hf-text-muted)" }}>
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
      style={{ background: "hsl(var(--ck-sidebar))", borderRight: "1px solid color-mix(in srgb, var(--hf-surface-raised) 70%, transparent)" }}
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
                background: active ? "var(--hf-surface-raised)" : "transparent",
                color: active ? "var(--hf-text)" : "var(--hf-text-soft)",
              }}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: active ? "var(--hf-gold)" : "var(--hf-text-muted)" }} />
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
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--hf-surface-raised)]"
            style={{ background: "var(--hf-surface-raised)", border: "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)" }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold"
              style={{ background: "linear-gradient(180deg, var(--hf-green-border), var(--hf-green-soft))", color: "var(--hf-text)" }}
            >
              {account.initials}
            </span>
            <span className="flex-1 text-left text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>
              {account.name}
            </span>
            <ChevronDown className="h-4 w-4" style={{ color: "var(--hf-text-muted)" }} />
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
        background: compact ? "transparent" : "color-mix(in srgb, var(--hf-surface-raised) 70%, transparent)",
        border: compact ? "none" : "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)",
      }}
    >
      <Bell className="h-5 w-5" style={{ color: "var(--hf-gold)" }} />
      {unread > 0 && (
        <span
          className="absolute -right-1 -top-1 flex items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
          style={{ minWidth: 16, height: 16, background: "var(--hf-danger)", color: "hsl(0 0% 100%)", border: "1.5px solid hsl(var(--ck-bg))" }}
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
      style={{ background: "color-mix(in srgb, var(--hf-surface-raised) 70%, transparent)", border: "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)", color: "var(--hf-text-soft)" }}
    >
      <CalIcon className="h-4 w-4" style={{ color: "var(--hf-text-muted)" }} />
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
            <span style={{ color: "var(--hf-gold)" }}>Dashboard</span>
            <span style={{ color: "var(--hf-text-muted)" }}>/</span>
            <AccountMenu align="start" side="bottom">
              <button aria-label="Account menu" className="flex items-center gap-1.5" style={{ color: "var(--hf-text-soft)" }}>
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
      <h1 className="min-w-0 flex-1 truncate font-display text-[26px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
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
        background: "var(--hf-bg)",
        borderTop: "1px solid var(--hf-surface-raised)",
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
            <Icon className="h-[22px] w-[22px]" style={{ color: active ? "var(--hf-gold)" : "var(--hf-text-muted)" }} />
            <span className="text-[11px] font-medium" style={{ color: active ? "var(--hf-gold)" : "var(--hf-text-muted)" }}>
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
        {/* Three slow lights drifting behind everything, so the page is never
            a flat sheet. Cheap: transform-only, and off under reduced motion. */}
        <div className="ck-ambient" aria-hidden>
          <i />
          <i />
          <i />
        </div>
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
