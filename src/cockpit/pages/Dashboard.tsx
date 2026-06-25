import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Users,
  Clock,
  CheckCircle2,
  ChevronRight,
  Mic,
  Star,
  Sparkles,
  UserPlus,
  CalendarDays,
  Megaphone,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { StatCard } from "../components/StatCard";
import { Pipeline } from "../components/Pipeline";
import { CandidateMark } from "../components/CandidateMark";
import { useCockpitDashboard } from "../hooks/useCockpitData";

const KPI_ICONS = {
  briefcase: <Briefcase className="h-[18px] w-[18px]" />,
  users: <Users className="h-[18px] w-[18px]" />,
  clock: <Clock className="h-[18px] w-[18px]" />,
  check: <CheckCircle2 className="h-[18px] w-[18px]" />,
};

const ACTIVITY_ICONS = {
  mic: Mic,
  star: Star,
  sparkle: Sparkles,
  userplus: UserPlus,
};

function ActivityRow({ item, first }: { item: ReturnType<typeof useCockpitDashboard>["dashboard"]["activity"][number]; first?: boolean }) {
  const Icon = ACTIVITY_ICONS[item.icon];
  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ borderTop: first ? "none" : "1px solid hsl(150 12% 14% / 0.7)" }}
    >
      <div className="relative shrink-0">
        {item.avatar ? (
          <CandidateMark who={item.avatar} size={34} variant="calm" />
        ) : (
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full"
            style={{ background: "hsl(152 30% 16%)", color: "hsl(152 46% 62%)" }}
          >
            <UserPlus className="h-4 w-4" />
          </div>
        )}
      </div>
      <Icon className="h-4 w-4 shrink-0" style={{ color: "hsl(38 60% 64%)" }} />
      <p className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: "hsl(150 12% 64%)" }}>
        <span style={{ color: "hsl(150 30% 92%)", fontWeight: 600 }}>{item.name}</span> {item.action}
      </p>
      <span className="shrink-0 text-[12px]" style={{ color: "hsl(150 10% 48%)" }}>
        {item.time}
      </span>
    </div>
  );
}

export default function CockpitDashboard() {
  const navigate = useNavigate();
  const { dashboard, pipeline, isLoading } = useCockpitDashboard();
  const { hero, kpis, activity } = dashboard;

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-7">
      {/* ── Hero (mobile) ────────────────────────────────── */}
      <section
        className="ck-rise relative overflow-hidden rounded-2xl border p-4 md:hidden"
        style={{ background: "var(--gradient-hero)", borderColor: "hsl(150 12% 15% / 0.6)" }}
      >
        <div className="flex items-center gap-3">
          <AvaOrb size={116} reflection={false} amp={0.24} flow={0.55} />
          <div className="min-w-0">
            <h1 className="font-display" style={{ fontSize: 22, lineHeight: 1.08, color: "hsl(150 33% 95%)", fontWeight: 500 }}>
              {hero.headline}
            </h1>
            <p className="mt-2 text-[13px]" style={{ color: "hsl(150 12% 64%)" }}>
              I screened 42 applicants for Maria's Café.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button className="ck-btn ck-btn-brass !px-3" onClick={() => navigate("/applicants")}>
            Review shortlist
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="ck-btn ck-btn-outline !px-3" onClick={() => navigate("/interviews")}>
            <CalendarDays className="h-4 w-4" style={{ color: "hsl(150 14% 64%)" }} />
            Schedule
          </button>
          <button className="ck-btn ck-btn-outline !px-3" onClick={() => navigate("/jobs")}>
            <Megaphone className="h-4 w-4" style={{ color: "hsl(150 14% 64%)" }} />
            Publish role
          </button>
        </div>
      </section>

      {/* ── Hero (desktop) ───────────────────────────────── */}
      <section
        className="ck-rise relative hidden overflow-hidden md:grid"
        style={{ gridTemplateColumns: "minmax(260px,360px) 1fr", alignItems: "center", columnGap: 32, background: "var(--gradient-hero)" }}
      >
        <div className="flex justify-center">
          <AvaOrb size={320} reflection={false} amp={0.24} flow={0.55} />
        </div>
        <div className="min-w-0">
          <h1 className="font-display" style={{ fontSize: "clamp(34px, 3.6vw, 52px)", lineHeight: 1.05, color: "hsl(150 33% 95%)", fontWeight: 500 }}>
            {hero.headline}
          </h1>
          <p className="mt-3 text-[16px]" style={{ color: "hsl(150 12% 64%)", maxWidth: 460 }}>
            {hero.sub}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="ck-btn ck-btn-brass" onClick={() => navigate("/applicants")}>
              Review shortlist
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="ck-btn ck-btn-outline" onClick={() => navigate("/interviews")}>
              <CalendarDays className="h-4 w-4" style={{ color: "hsl(150 14% 64%)" }} />
              Schedule interviews
            </button>
            <button className="ck-btn ck-btn-outline" onClick={() => navigate("/jobs")}>
              <Megaphone className="h-4 w-4" style={{ color: "hsl(150 14% 64%)" }} />
              Publish barista role
            </button>
          </div>
        </div>
      </section>

      {/* ── KPIs ─────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {kpis.map((k, i) => (
          <StatCard key={k.label} label={k.label} value={k.value} icon={KPI_ICONS[k.icon]} index={i} />
        ))}
      </section>

      {/* ── Pipeline + Activity ──────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr] md:gap-5">
        <div className="ck-card ck-reveal p-5 md:p-6" style={{ ["--ck-i" as string]: 4 }}>
          <h2 className="font-display text-[19px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>
            Pipeline Health
          </h2>
          <div className="mt-5">
            <Pipeline variant="health" nodes={pipeline} />
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[13.5px]" style={{ color: "hsl(150 28% 88%)" }}>
                <span className="ck-dot ck-dot-closed" />
                Voice is your bottleneck
              </div>
              <p className="mt-1 text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>
                Most drop-off happens at the voice interview stage.
              </p>
            </div>
            <button
              className="ck-btn ck-btn-outline !py-2 !text-[13px]"
              onClick={() => navigate("/analytics")}
            >
              View pipeline insights
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="ck-card ck-reveal p-5 md:p-6" style={{ ["--ck-i" as string]: 5 }}>
          <h2 className="font-display text-[19px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>
            Recent Activity
          </h2>
          <div className="mt-2">
            {activity.map((item, i) => (
              <div key={item.id} className="ck-reveal" style={{ ["--ck-i" as string]: 6 + i }}>
                <ActivityRow item={item} first={i === 0} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
