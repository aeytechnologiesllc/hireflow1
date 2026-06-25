import { useNavigate } from "react-router-dom";
import { Clock, UserCheck, Star, MessageSquare, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { Pipeline } from "../components/Pipeline";
import { useCockpitAnalytics, useCockpitAccount } from "../hooks/useCockpitData";

const KPI_ICONS = {
  clock: <Clock className="h-[18px] w-[18px]" />,
  userCheck: <UserCheck className="h-[18px] w-[18px]" />,
  star: <Star className="h-[18px] w-[18px]" />,
  chat: <MessageSquare className="h-[18px] w-[18px]" />,
};

function CardTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[14px] font-semibold" style={{ color: "hsl(150 26% 86%)" }}>{title}</span>
      <button className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px]" style={{ border: "1px solid hsl(150 12% 16%)", color: "hsl(150 12% 60%)" }}>
        Last 30 days<ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}

function LineChart({ data, yMax, yTicks }: { data: number[]; yMax: number; yTicks: number[] }) {
  const W = 300, H = 120, padL = 22, padB = 18, padT = 6;
  const innerW = W - padL, innerH = H - padB - padT;
  const pts = data.map((v, i) => {
    const x = padL + (i / (data.length - 1)) * innerW;
    const y = padT + innerH - (v / yMax) * innerH;
    return [x, y];
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${padT + innerH} L${padL},${padT + innerH} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" style={{ height: 130 }}>
      {yTicks.map((t) => {
        const y = padT + innerH - (t / yMax) * innerH;
        return (
          <g key={t}>
            <text x={0} y={y + 3} fontSize="8" fill="hsl(150 10% 48%)">{t}</text>
            <line x1={padL} y1={y} x2={W} y2={y} stroke="hsl(150 12% 16%)" strokeWidth="0.5" />
          </g>
        );
      })}
      <defs>
        <linearGradient id="lcArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(152 50% 50%)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(152 50% 50%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lcArea)" />
      <path d={line} fill="none" stroke="hsl(152 52% 54%)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="hsl(152 60% 60%)" />
    </svg>
  );
}

export default function CockpitAnalytics() {
  const navigate = useNavigate();
  const { analytics, pipeline, isLoading } = useCockpitAnalytics();
  const { account } = useCockpitAccount();
  const maxSource = Math.max(...analytics.sources.map((s) => s.value), 1);

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" subtitle={`Hiring performance for ${account.name}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {analytics.kpis.map((k, i) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={k.value}
            unit={k.unit}
            icon={KPI_ICONS[k.icon]}
            delta={{ text: k.delta, trend: k.trend, good: k.good }}
            index={i}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:gap-5">
        <div className="ck-card p-5">
          <CardTitle title="Application trend" />
          <LineChart data={analytics.trend} yMax={60} yTicks={[0, 15, 30, 45, 60]} />
          <div className="mt-1 flex justify-between px-1 text-[10.5px]" style={{ color: "hsl(150 10% 50%)" }}>
            {analytics.trendLabels.map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>

        <div className="ck-card p-5">
          <span className="text-[14px] font-semibold" style={{ color: "hsl(150 26% 86%)" }}>Applications by source</span>
          <div className="mt-4 space-y-3">
            {analytics.sources.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-[68px] shrink-0 text-[12px]" style={{ color: "hsl(150 12% 62%)" }}>{s.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-sm" style={{ background: "hsl(150 12% 12%)" }}>
                  <div className="h-full rounded-sm" style={{ width: `${(s.value / maxSource) * 100}%`, background: "hsl(152 44% 52%)" }} />
                </div>
                <span className="w-[58px] shrink-0 text-right text-[11.5px]" style={{ color: "hsl(150 16% 70%)" }}>{s.value} ({s.pct})</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between pl-[80px] pr-[58px] text-[10.5px]" style={{ color: "hsl(150 10% 48%)" }}>
            <span>0</span><span>10</span><span>20</span>
          </div>
        </div>

        <div className="ck-card p-5">
          <CardTitle title="Applicant quality score over time" />
          <LineChart data={analytics.quality} yMax={100} yTicks={[0, 25, 50, 75, 100]} />
          <div className="mt-1 flex justify-between px-1 text-[10.5px]" style={{ color: "hsl(150 10% 50%)" }}>
            {analytics.trendLabels.map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="ck-card p-5 md:p-6">
          <span className="font-display text-[18px]" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>Funnel conversion</span>
          <div className="mt-5"><Pipeline variant="funnel" nodes={pipeline} /></div>
          <div className="mt-4 text-center text-[12px]" style={{ color: "hsl(150 10% 52%)" }}>Conversion rate from previous stage</div>
        </div>

        <div className="ck-card flex items-center gap-4 p-5 md:p-6">
          <AvaOrb size={150} reflection={false} amp={0.22} flow={0.5} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-display text-[20px]" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>
              Ava's insight<Sparkles className="h-4 w-4" style={{ color: "hsl(38 64% 66%)" }} />
            </div>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "hsl(150 14% 66%)" }}>{analytics.insight}</p>
            <button className="ck-btn ck-btn-outline mt-4" onClick={() => navigate("/applicants")}>
              <Sparkles className="h-4 w-4" style={{ color: "hsl(38 64% 66%)" }} />View recommendations
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
