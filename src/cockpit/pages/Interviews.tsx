import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Mic,
  Users,
  CalendarCheck,
  ClipboardCheck,
  UserRound,
  Star,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { CandidateMark } from "../components/CandidateMark";
import { useCockpitInterviews } from "../hooks/useCockpitData";
import type { InterviewItem } from "../data";

const KPI_ICONS = {
  calendar: <CalendarDays className="h-[18px] w-[18px]" />,
  check: <CheckCircle2 className="h-[18px] w-[18px]" />,
  clock: <Clock className="h-[18px] w-[18px]" />,
};

const KIND = {
  "voice-scheduled": { icon: Mic, label: "Voice scheduled", tone: "hsl(150 12% 60%)" },
  "in-person-confirmed": { icon: Users, label: "In-person confirmed", tone: "hsl(152 46% 58%)" },
  "voice-completed": { icon: Mic, label: "Voice completed", tone: "hsl(152 46% 58%)" },
  scheduled: { icon: Clock, label: "Scheduled", tone: "hsl(150 12% 60%)" },
};

function Calendar({ daysWithInterviews, selectedDay }: { daysWithInterviews: number[]; selectedDay: number }) {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const trailing = [1, 2, 3, 4, 5];
  const monthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  return (
    <div className="ck-card p-5">
      <div className="flex items-center justify-between">
        <div className="font-display text-[17px]" style={{ color: "hsl(150 30% 91%)", fontWeight: 500 }}>{monthLabel}</div>
        <div className="flex items-center gap-1.5" style={{ color: "hsl(150 12% 56%)" }}>
          <button><ChevronLeft className="h-4 w-4" /></button>
          <button><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-y-2 text-center text-[11px]" style={{ color: "hsl(150 10% 48%)" }}>
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">
        {days.map((d) => {
          const has = daysWithInterviews.includes(d);
          const sel = d === selectedDay;
          return (
            <div key={d} className="flex flex-col items-center py-1">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
                style={sel ? { background: "hsl(152 40% 24%)", color: "hsl(150 32% 92%)", border: "1px solid hsl(152 46% 50%)" } : { color: "hsl(150 18% 76%)" }}
              >
                {d}
              </span>
              <span className="mt-0.5 h-1 w-1 rounded-full" style={{ background: has ? "hsl(152 50% 50%)" : "transparent" }} />
            </div>
          );
        })}
        {trailing.map((d) => (
          <div key={`t${d}`} className="flex flex-col items-center py-1">
            <span className="flex h-7 w-7 items-center justify-center text-[13px]" style={{ color: "hsl(150 8% 34%)" }}>{d}</span>
            <span className="mt-0.5 h-1 w-1" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(152 50% 50%)" }} />
        Has interviews
      </div>
    </div>
  );
}

function UpcomingRow({ it }: { it: InterviewItem }) {
  const k = KIND[it.kind];
  const Icon = k.icon;
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderTop: "1px solid hsl(150 12% 13% / 0.6)" }}>
      <CandidateMark who={it.avatar} size={38} variant="calm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold" style={{ color: "hsl(150 30% 91%)" }}>{it.name}</div>
        <div className="text-[12px]" style={{ color: "hsl(150 10% 54%)" }}>{it.role}</div>
      </div>
      <div className="text-[12.5px]" style={{ color: "hsl(150 18% 74%)" }}>{it.time}</div>
      <div className="flex w-[120px] items-center gap-1.5 text-[12px]" style={{ color: k.tone }}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{k.label}</span>
      </div>
    </div>
  );
}

export default function CockpitInterviews() {
  const { interviews, isLoading } = useCockpitInterviews();

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Interviews"
        subtitle="Upcoming voice and in-person conversations"
        actions={
          <>
            <button className="ck-btn ck-btn-brass"><CalendarCheck className="h-4 w-4" />Schedule interview</button>
            <button className="ck-btn ck-btn-outline"><ClipboardCheck className="h-4 w-4" />Review completed</button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {interviews.kpis.map((k, i) => (
          <StatCard key={k.label} label={k.label} value={k.value} icon={KPI_ICONS[k.icon]} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Calendar daysWithInterviews={interviews.daysWithInterviews} selectedDay={interviews.selectedDay} />

        <div className="ck-card p-5">
          <div className="font-display text-[17px]" style={{ color: "hsl(150 30% 91%)", fontWeight: 500 }}>Upcoming interviews</div>
          <div className="mt-1">
            {interviews.upcoming.length === 0 ? (
              <p className="py-6 text-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>
                No upcoming interviews scheduled. Candidates in the voice stage appear here when interviews are booked.
              </p>
            ) : (
              interviews.upcoming.map((it) => <UpcomingRow key={it.id} it={it} />)
            )}
          </div>
          <button className="ck-btn ck-btn-ghost mt-2 !px-0 !text-[13px]" style={{ color: "hsl(38 60% 64%)" }}>View all interviews<ChevronRight className="h-4 w-4" /></button>
        </div>

        <div className="ck-card p-5">
          <div className="font-display text-[17px]" style={{ color: "hsl(150 30% 91%)", fontWeight: 500 }}>Ava's interview reads</div>
          <div className="mt-2 flex justify-center">
            <AvaOrb size={140} reflection={false} amp={0.22} flow={0.5} />
          </div>
          <div className="mt-3 space-y-2.5">
            {interviews.reads.length === 0 ? (
              <p className="text-center text-[13px] py-4" style={{ color: "hsl(150 10% 56%)" }}>
                Interview summaries appear after candidates complete voice screening.
              </p>
            ) : (
              interviews.reads.map((r) => {
              const Icon = r.icon === "user" ? UserRound : Star;
              return (
                <div key={r.id} className="ck-inset flex items-center gap-3 p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "hsl(152 30% 15%)", color: "hsl(152 46% 60%)" }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px]" style={{ color: "hsl(150 20% 80%)" }}>{r.text}</span>
                  <ChevronRight className="h-4 w-4" style={{ color: "hsl(150 10% 46%)" }} />
                </div>
              );
            })
            )}
          </div>
          <button className="ck-btn ck-btn-ghost mt-3 !px-0 !text-[13px]" style={{ color: "hsl(38 60% 64%)" }}>View all reads<ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
