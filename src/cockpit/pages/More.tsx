import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  FileText,
  UsersRound,
  BarChart3,
  Settings,
  User as UserIcon,
  CreditCard,
  HelpCircle,
  ChevronRight,
  Clock,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import AvaOrb from "@/components/ava/AvaOrb";
import { useCockpitAccount } from "../hooks/useCockpitData";
import { useAuth } from "@/hooks/useAuth";

const ITEMS = [
  { label: "Interviews", to: "/interviews", icon: CalendarDays },
  { label: "Documents", to: "/documents", icon: FileText },
  { label: "Team", to: "/team", icon: UsersRound },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Profile", to: "/profile", icon: UserIcon },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Billing", to: "/settings?tab=subscription", icon: CreditCard },
  { label: "Help", to: "/settings", icon: HelpCircle },
];

export default function CockpitMore() {
  const navigate = useNavigate();
  const { account, showTrialAccess } = useCockpitAccount();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Signed out");
    } catch {
      // local state is cleared by signOut; navigate regardless.
    } finally {
      navigate("/auth", { replace: true });
    }
  };

  return (
    <div className="mx-auto max-w-[640px] space-y-3 pb-6">
      {/* account card */}
      <div className="ck-card flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full text-[14px] font-bold" style={{ background: "linear-gradient(180deg, var(--hf-green-border), var(--hf-green-soft))", color: "var(--hf-text)" }}>{account.initials}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold" style={{ color: "var(--hf-text)" }}>{account.name}</div>
          <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>Owner workspace</div>
        </div>
        {showTrialAccess && (
          <span className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium" style={{ background: "color-mix(in srgb, var(--hf-gold-hover) 50%, transparent)", border: "1px solid color-mix(in srgb, var(--hf-gold-hover) 30%, transparent)", color: "var(--hf-gold)" }}>
            <Clock className="h-3.5 w-3.5" />{account.trialDaysLeft} days left
          </span>
        )}
      </div>

      {/* list */}
      <div className="ck-card overflow-hidden">
        {ITEMS.map((it, i) => (
          <button
            key={it.label}
            onClick={() => navigate(it.to)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            style={{ borderTop: i === 0 ? "none" : "1px solid color-mix(in srgb, var(--hf-surface-raised) 60%, transparent)" }}
          >
            <it.icon className="h-5 w-5 shrink-0" style={{ color: "var(--hf-text-muted)" }} />
            <span className="flex-1 text-[15px]" style={{ color: "var(--hf-text)" }}>{it.label}</span>
            <ChevronRight className="h-4 w-4" style={{ color: "var(--hf-text-muted)" }} />
          </button>
        ))}
      </div>

      {/* Ava card */}
      <div className="ck-card flex items-center gap-3 p-4" onClick={() => navigate("/analytics")}>
        <AvaOrb size={84} reflection={false} amp={0.22} flow={0.5} />
        <div className="min-w-0">
          <div className="font-display text-[19px] leading-tight" style={{ color: "var(--hf-text)", fontWeight: 500 }}>Ava is watching your pipeline</div>
          <button className="mt-1.5 flex items-center gap-1 text-[13px]" style={{ color: "var(--hf-gold)" }}>View recommendations<ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* trial */}
      {showTrialAccess && (
        <div className="ck-card flex items-center gap-3 p-4">
          <Clock className="h-5 w-5" style={{ color: "var(--hf-gold)" }} />
          <span className="flex-1 text-[14px]" style={{ color: "var(--hf-text)" }}>Trial ends {account.trialEnds}</span>
          <button className="ck-btn ck-btn-primary !px-4 !py-2 !text-[13px]" onClick={() => navigate("/settings?tab=subscription")}>Manage plan</button>
        </div>
      )}

      {/* log out */}
      <button
        onClick={handleLogout}
        className="ck-card flex w-full items-center gap-3 p-4 text-left transition-colors"
        style={{ color: "var(--hf-danger)" }}
      >
        <LogOut className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-[15px] font-medium">Log out</span>
        <ChevronRight className="h-4 w-4" style={{ color: "var(--hf-danger)" }} />
      </button>
    </div>
  );
}
