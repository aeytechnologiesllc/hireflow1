import { useNavigate } from "react-router-dom";
import { Clock, UserCheck, Star, MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
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
      <span className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>{title}</span>
      <button className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px]" style={{ border: "1px solid var(--hf-border-strong)", color: "var(--hf-text-muted)" }}>
        Last 30 days<ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      className="mt-3 flex items-center justify-center rounded-md text-center text-[12px]"
      style={{ height: 130, border: "1px dashed var(--hf-border-strong)", color: "var(--hf-text-muted)" }}
    >
      <span className="max-w-[220px] px-3">{message}</span>
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
            <text x={0} y={y + 3} fontSize="8" fill="var(--hf-text-muted)">{t}</text>
            <line x1={padL} y1={y} x2={W} y2={y} stroke="var(--hf-border-strong)" strokeWidth="0.5" />
          </g>
        );
      })}
      <defs>
        <linearGradient id="lcArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--hf-green)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--hf-green)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lcArea)" />
      <path d={line} fill="none" stroke="var(--hf-green)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--hf-green)" />
    </svg>
  );
}

export default function CockpitAnalytics() {
  const navigate = useNavigate();
  const { analytics, pipeline, isLoading } = useCockpitAnalytics();
  const { account } = useCockpitAccount();
  const maxSource = Math.max(...analytics.sources.map((s) => s.value), 1);
  const hasTrend = analytics.trend.length >= 2 && analytics.trend.some((v) => v > 0);
  const hasQuality = analytics.quality.length >= 2 && analytics.quality.some((v) => v > 0);

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--hf-green)] border-t-transparent" /></div>;
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
          {hasTrend ? (
            <>
              <LineChart data={analytics.trend} yMax={Math.max(...analytics.trend, 5)} yTicks={[0, 15, 30, 45, 60]} />
              <div className="mt-1 flex justify-between px-1 text-[10.5px]" style={{ color: "var(--hf-text-muted)" }}>
                {analytics.trendLabels.map((l) => <span key={l}>{l}</span>)}
              </div>
            </>
          ) : (
            <EmptyChart message="No applications in the last 30 days yet. Share your apply link to start seeing trends." />
          )}
        </div>

        <div className="ck-card p-5">
          <span className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Applications by source</span>
          {analytics.sources.length > 0 ? (
            <div className="mt-4 space-y-3">
              {analytics.sources.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="w-[78px] shrink-0 text-[12px]" style={{ color: "var(--hf-text-soft)" }}>{s.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-sm" style={{ background: "var(--hf-surface-raised)" }}>
                    <div className="h-full rounded-sm" style={{ width: `${(s.value / maxSource) * 100}%`, background: "var(--hf-green)" }} />
                  </div>
                  <span className="w-[64px] shrink-0 text-right text-[11.5px]" style={{ color: "var(--hf-text-soft)" }}>{s.value} ({s.pct})</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart message="No applications yet — your source breakdown appears here once candidates apply." />
          )}
        </div>

        <div className="ck-card p-5">
          <CardTitle title="Applicant quality score over time" />
          {hasQuality ? (
            <>
              <LineChart data={analytics.quality} yMax={100} yTicks={[0, 25, 50, 75, 100]} />
              <div className="mt-1 flex justify-between px-1 text-[10.5px]" style={{ color: "var(--hf-text-muted)" }}>
                {analytics.trendLabels.map((l) => <span key={l}>{l}</span>)}
              </div>
            </>
          ) : (
            <EmptyChart message="Quality trends appear here as Ava screens and scores your candidates." />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="ck-card p-5 md:p-6">
          <span className="font-display text-[18px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>Funnel conversion</span>
          <div className="mt-5"><Pipeline variant="funnel" nodes={pipeline} /></div>
          <div className="mt-4 text-center text-[12px]" style={{ color: "var(--hf-text-muted)" }}>Conversion rate from previous stage</div>
        </div>

        <div className="ck-card flex items-center gap-4 p-5 md:p-6">
          <AvaOrb size={150} reflection={false} amp={0.22} flow={0.5} />
          <div className="min-w-0">
            <div className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
              Ava's insight
            </div>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--hf-text-soft)" }}>{analytics.insight}</p>
            <button className="ck-btn ck-btn-outline mt-4" onClick={() => navigate("/applicants")}>
              View recommendations
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
