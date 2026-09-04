import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
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
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { prefetchForPath } from "@/lib/prefetchRoutes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCockpitAccount } from "./hooks/useCockpitData";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { Wordmark } from "./components/Wordmark";
import { AccountMenu } from "./components/AccountMenu";

interface NavItem {
  label: string;
  to: string;
  icon: typeof Home;
}

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: Home },
  // People before job admin — the design puts Applicants second on purpose.
  { label: "Applicants", to: "/applicants", icon: Users },
  { label: "Jobs", to: "/jobs", icon: Briefcase },
  { label: "Interviews", to: "/interviews", icon: CalendarDays },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "Documents", to: "/documents", icon: FileText },
  { label: "Team", to: "/team", icon: UsersRound },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
];

const MOBILE_TABS = [
  { label: "Dashboard", to: "/dashboard", icon: Home },
  { label: "Applicants", to: "/applicants", icon: Users },
  { label: "Jobs", to: "/jobs", icon: Briefcase },
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
    // Brass costs money, and brass is outlined — the system has no filled brass
    // surface. The old gold wash put brass ink on a brass slab (~2.3:1); on the
    // sidebar an outline reads 5.1:1 in Paper and 9.0:1 in Ink.
    // Hidden in the collapsed rail, where there is no room for the words.
    <div
      className="hidden rounded-xl px-3.5 py-3 min-[1121px]:block"
      style={{ background: "transparent", border: "1px solid var(--brass-line)" }}
    >
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" style={{ color: "var(--hf-gold)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--hf-gold)" }}>
          {account.trialDaysLeft} days left
        </span>
      </div>
      <div className="mt-1 text-[12px]" style={{ color: "var(--hf-text-soft)" }}>
        Your trial ends {account.trialEnds}
      </div>
    </div>
  );
}

function Sidebar() {
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { pathname } = useLocation();
  const { account } = useCockpitAccount();
  return (
    // Two widths, as the design specifies: a 64px icon rail from md up to
    // 1120px, the full 216px column above that. --line is the only rule that
    // stays darker than both the sidebar and the page in either theme; a
    // surface-derived border inverts into a pale glow on Paper.
    <aside
      className="hidden md:flex w-16 min-[1121px]:w-[216px] shrink-0 flex-col px-2 py-5 min-[1121px]:px-3"
      style={{ background: "hsl(var(--ck-sidebar))", borderRight: "1px solid var(--line)" }}
    >
      <div className="pb-6 pt-1 min-[1121px]:px-2">
        <span className="flex justify-center min-[1121px]:hidden">
          <Wordmark size={26} markOnly />
        </span>
        <span className="hidden min-[1121px]:flex">
          <Wordmark size={26} />
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              // Warm the route's lazy chunk before the click lands — on
              // hover, on the initial touch/mouse-down, and on keyboard
              // focus, so whichever signal comes first starts the fetch.
              // No-ops for already-eager routes (routeImporters won't have
              // an entry for them).
              onMouseEnter={() => prefetchForPath(item.to)}
              onPointerDown={() => prefetchForPath(item.to)}
              onFocus={() => prefetchForPath(item.to)}
              // The label is display:none in the rail, so the name has to be
              // carried by aria-label or the link goes unnamed.
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl py-2.5 text-[14px] font-medium transition-colors",
                "justify-center px-0 min-[1121px]:justify-start min-[1121px]:px-3",
                // Hover and focus live in classes, not inline styles — an inline
                // background would beat any :hover rule we could write.
                "hover:bg-[var(--hf-surface-raised)] hover:text-[var(--hf-text)]",
                "focus-visible:[outline:2px_solid_var(--jade)] focus-visible:[outline-offset:-2px]",
                active
                  ? "bg-[var(--hf-surface-raised)] font-semibold text-[var(--hf-text)]"
                  : "text-[var(--hf-text-soft)]",
              )}
              // Jade marks where you are. Brass is money, and never the rail.
              style={active ? { boxShadow: "inset 2px 0 0 var(--jade), var(--hf-shadow-soft)" } : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:translate-x-px" />
              <span className="hidden min-[1121px]:inline">{item.label}</span>
              {item.to === "/messages" && unreadMessages > 0 && (
                <span
                  aria-label={`${unreadMessages} unread`}
                  className="ml-auto flex items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
                  style={{ minWidth: 16, height: 16, background: "var(--jade)", color: "var(--btn-fg)" }}
                >
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-3">
        <TrialBadge />
        {/* The design's app frame is rail + page, with no top bar, so the bell
            sits at the foot of the rail beside the account block — the one
            place the account is printed. */}
        <div className="flex flex-col items-center gap-2 min-[1121px]:flex-row">
          <div className="w-full min-w-0 min-[1121px]:flex-1">
            <AccountMenu align="start" side="top">
              <button
                aria-label="Account menu"
                className="flex w-full min-w-0 items-center justify-center gap-2.5 rounded-xl px-0 py-2.5 transition-colors min-[1121px]:justify-start min-[1121px]:px-3"
                style={{ background: "var(--hf-surface-raised)", border: "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)" }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: "linear-gradient(180deg, var(--hf-green-border), var(--hf-green-soft))", color: "var(--hf-text)" }}
                >
                  {account.initials}
                </span>
                {/* A long business name has to ellipsize, not wrap the chip onto
                    two lines and squeeze the bell beside it. */}
                <span
                  className="hidden min-w-0 flex-1 truncate text-left text-[14px] font-medium min-[1121px]:block"
                  style={{ color: "var(--hf-text)" }}
                  title={account.name}
                >
                  {account.name}
                </span>
                <ChevronDown className="hidden h-4 w-4 min-[1121px]:block" style={{ color: "var(--hf-text-muted)" }} />
              </button>
            </AccountMenu>
          </div>
          <ThemeSwitch />
          <NotificationBell />
        </div>
      </div>
    </aside>
  );
}

function ThemeSwitch({ compact }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const night = resolvedTheme === "dark";
  return (
    <button
      aria-label={night ? "Switch to Day" : "Switch to Night"}
      title={night ? "Switch to Day" : "Switch to Night"}
      onClick={() => setTheme(night ? "light" : "dark")}
      className="relative flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: 36,
        height: 36,
        background: compact ? "transparent" : "color-mix(in srgb, var(--hf-surface-raised) 70%, transparent)",
        border: compact ? "none" : "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)",
      }}
    >
      {night ? (
        <Sun className="h-5 w-5" style={{ color: "var(--hf-text-soft)" }} />
      ) : (
        <Moon className="h-5 w-5" style={{ color: "var(--hf-text-soft)" }} />
      )}
    </button>
  );
}

function NotificationBell({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { data: unread = 0 } = useUnreadCount();
  return (
    <button
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      onClick={() => navigate("/notifications")}
      onMouseEnter={() => prefetchForPath("/notifications")}
      onPointerDown={() => prefetchForPath("/notifications")}
      onFocus={() => prefetchForPath("/notifications")}
      className="relative flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: 36,
        height: 36,
        background: compact ? "transparent" : "color-mix(in srgb, var(--hf-surface-raised) 70%, transparent)",
        border: compact ? "none" : "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)",
      }}
    >
      {/* Brass is money. A bell is not, whether or not anything is unread. */}
      <Bell className="h-5 w-5" style={{ color: "var(--hf-text-soft)" }} />
      {unread > 0 && (
        <span
          className="absolute -right-1 -top-1 flex items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
          // Jade on --btn-fg, the system's filled-count pair: --crit is for
          // errors and for a candidate passed on, and raw white is not a token.
          // The ring takes the ground the bell actually sits on.
          style={{
            minWidth: 16,
            height: 16,
            background: "var(--jade)",
            color: "var(--btn-fg)",
            border: `1.5px solid hsl(var(--ck-${compact ? "bg" : "sidebar"}))`,
          }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

// There is no desktop top bar. The design's frame is rail + page: every page
// prints its own title, the account is printed once in the rail's foot, and the
// bell moved there with it. The old h-16 header spent 64px of every page on a
// duplicated account name and a "Today" pill that opened nothing.

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
        <ThemeSwitch compact />
        <NotificationBell compact />
      </div>
    </header>
  );
}

function MobileTabBar() {
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
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
            aria-current={active ? "page" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1 py-1"
          >
            {/* The sidebar's jade rail, rotated onto the tab bar's top edge. */}
            <span
              aria-hidden
              className="absolute -top-2 h-[2px] w-8 rounded-full"
              style={{ background: active ? "var(--jade)" : "transparent" }}
            />
            <span className="relative">
              <Icon className="h-[22px] w-[22px]" style={{ color: active ? "var(--hf-text)" : "var(--hf-text-muted)" }} />
              {tab.to === "/messages" && unreadMessages > 0 && (
                <span
                  aria-label={`${unreadMessages} unread`}
                  className="absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
                  style={{ minWidth: 16, height: 16, background: "var(--jade)", color: "var(--btn-fg)" }}
                >
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium" style={{ color: active ? "var(--hf-text)" : "var(--hf-text-muted)" }}>
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
        {/* Paper is a material — a whisper of grain so the ground reads as
            stock, not a hex fill. */}
        <div className="ck-grain" aria-hidden />
        <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
          {!hasOwnMobileHeader && <MobileTopBar />}
          <main
            // .main{padding:18px 26px 40px} in the design — with the top bar
            // gone the page title starts where the mockup starts it.
            className="ck-scroll flex-1 overflow-y-auto overflow-x-hidden px-4 pb-24 pt-1 md:px-[26px] md:pb-10 md:pt-[18px]"
            style={isMobile ? undefined : undefined}
          >
            {/* Keyed on the route so every navigation gets a quiet page-turn
                instead of a hard content swap. */}
            <div key={pathname} className="ck-page mx-auto w-full max-w-[1240px]">{children}</div>
          </main>
          <MobileTabBar />
        </div>
      </div>
    </div>
  );
}

export default CockpitShell;
