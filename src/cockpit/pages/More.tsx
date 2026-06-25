import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  FileText,
  UsersRound,
  BarChart3,
  Settings,
  CreditCard,
  HelpCircle,
  ChevronRight,
  Clock,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { useCockpitAccount } from "../hooks/useCockpitData";

const ITEMS = [
  { label: "Interviews", to: "/interviews", icon: CalendarDays },
  { label: "Documents", to: "/documents", icon: FileText },
  { label: "Team", to: "/team", icon: UsersRound },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Billing", to: "/settings", icon: CreditCard },
  { label: "Help", to: "/settings", icon: HelpCircle },
];

export default function CockpitMore() {
  const navigate = useNavigate();
  const { account } = useCockpitAccount();
  return (
    <div className="mx-auto max-w-[640px] space-y-3 pb-6">
      {/* account card */}
      <div className="ck-card flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full text-[14px] font-bold" style={{ background: "linear-gradient(180deg, hsl(152 40% 28%), hsl(152 40% 20%))", color: "hsl(150 30% 90%)" }}>{account.initials}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold" style={{ color: "hsl(150 30% 92%)" }}>{account.name}</div>
          <div className="text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>Owner workspace</div>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium" style={{ background: "hsl(38 40% 14% / 0.5)", border: "1px solid hsl(38 50% 45% / 0.3)", color: "hsl(38 64% 70%)" }}>
          <Clock className="h-3.5 w-3.5" />{account.trialDaysLeft} days left
        </span>
      </div>

      {/* list */}
      <div className="ck-card overflow-hidden">
        {ITEMS.map((it, i) => (
          <button
            key={it.label}
            onClick={() => navigate(it.to)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            style={{ borderTop: i === 0 ? "none" : "1px solid hsl(150 12% 13% / 0.6)" }}
          >
            <it.icon className="h-5 w-5 shrink-0" style={{ color: "hsl(150 14% 60%)" }} />
            <span className="flex-1 text-[15px]" style={{ color: "hsl(150 24% 86%)" }}>{it.label}</span>
            <ChevronRight className="h-4 w-4" style={{ color: "hsl(150 10% 44%)" }} />
          </button>
        ))}
      </div>

      {/* Ava card */}
      <div className="ck-card flex items-center gap-3 p-4" onClick={() => navigate("/analytics")}>
        <AvaOrb size={84} reflection={false} amp={0.22} flow={0.5} />
        <div className="min-w-0">
          <div className="font-display text-[19px] leading-tight" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>Ava is watching your Barista pipeline</div>
          <button className="mt-1.5 flex items-center gap-1 text-[13px]" style={{ color: "hsl(38 62% 66%)" }}>View recommendations<ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* trial */}
      <div className="ck-card flex items-center gap-3 p-4">
        <Clock className="h-5 w-5" style={{ color: "hsl(38 64% 66%)" }} />
        <span className="flex-1 text-[14px]" style={{ color: "hsl(150 22% 82%)" }}>Trial ends {account.trialEnds}</span>
        <button className="ck-btn ck-btn-brass !px-4 !py-2 !text-[13px]" onClick={() => navigate("/settings")}>Manage plan</button>
      </div>
    </div>
  );
}
