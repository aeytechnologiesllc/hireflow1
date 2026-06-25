import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  UserRound,
  MessageCircle,
  Target,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { CandidateMark } from "../components/CandidateMark";
import { useCockpitCandidate, useCockpitActions, useCockpitAccount } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];

export default function CockpitCandidateDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { candidate: c, application, isLoading } = useCockpitCandidate(id);
  const { advance, pass } = useCockpitActions();
  const { account } = useCockpitAccount();

  if (isLoading || !c) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" />
      </div>
    );
  }

  const handleAdvance = () => {
    if (application) void advance(c.id, application.status);
  };

  const handlePass = () => {
    void pass(c.id);
  };

  return (
    <div className="mx-auto max-w-[640px] pb-28">
      <div className="mb-3 flex items-center gap-3 md:hidden">
        <button onClick={() => navigate(-1)} style={{ color: "hsl(150 22% 80%)" }}><ChevronLeft className="h-6 w-6" /></button>
        <span className="min-w-0 flex-1 truncate font-display text-[20px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>{c.name}</span>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{ background: "hsl(156 16% 9% / 0.8)", border: "1px solid hsl(150 12% 16% / 0.9)", color: "hsl(150 28% 88%)" }}
        >
          <span className="text-[13px] font-medium">{account.name}</span>
          <ChevronDown className="h-3.5 w-3.5" style={{ color: "hsl(150 10% 58%)" }} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="ck-card flex items-center gap-4 p-4">
          <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={72} score={c.overall} rich variant="signal" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[24px]" style={{ color: "hsl(150 30% 94%)", fontWeight: 500 }}>{c.name}</div>
            <div className="text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>{c.role} · {c.appliedAgo}</div>
            <div className="mt-1.5"><span className="ck-pill ck-pill-stage">{c.stage}</span></div>
          </div>
          <div className="text-right">
            <div className="ck-num leading-none" style={{ fontSize: 36, color: "hsl(150 30% 94%)" }}>
              {c.overall}<span className="text-[16px]" style={{ color: "hsl(150 12% 56%)" }}>%</span>
            </div>
            <div className="text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>match</div>
          </div>
        </div>

        <div className="ck-card flex items-start gap-3 p-4">
          <AvaOrb size={72} reflection={false} glow={false} amp={0.22} flow={0.5} />
          <div className="min-w-0">
            <div className="font-display text-[16px]" style={{ color: "hsl(150 30% 91%)", fontWeight: 500 }}>Ava's read</div>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: "hsl(150 12% 64%)" }}>{c.readFull}</p>
          </div>
        </div>

        <div className="ck-card p-4">
          <div className="text-[14px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>Top strengths</div>
          <div className="mt-2 space-y-1">
            {c.strengths.map((s, i) => {
              const Icon = STRENGTH_ICONS[i % STRENGTH_ICONS.length];
              return (
                <div key={s} className="flex items-center gap-2.5 py-1.5 text-[13px]" style={{ color: "hsl(150 20% 80%)" }}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "hsl(152 30% 15%)", color: "hsl(152 46% 60%)" }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1">{s}</span>
                  <ChevronRight className="h-4 w-4" style={{ color: "hsl(150 10% 44%)" }} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Quiz", v: c.quiz },
            { label: "Voice", v: c.voice },
            { label: "Overall", v: c.overall },
          ].map((s) => (
            <div key={s.label} className="ck-card p-4 text-center">
              <div className="text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>{s.label}</div>
              <div className="ck-num leading-none" style={{ fontSize: 28, color: "hsl(150 30% 92%)" }}>
                {s.v ?? "—"}{s.v !== null ? <span className="text-[14px]" style={{ color: "hsl(150 12% 56%)" }}>%</span> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="ck-card flex items-center gap-3 p-4">
          <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "hsl(152 46% 58%)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>Risk factors</div>
            <div className="text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>{c.risk.level} — {c.risk.note}</div>
          </div>
          <ChevronRight className="h-4 w-4" style={{ color: "hsl(150 10% 44%)" }} />
        </div>
      </div>

      <div
        className="fixed inset-x-0 z-30 flex items-center gap-2 px-4 py-3 md:absolute md:rounded-2xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", background: "hsl(156 20% 5% / 0.96)", borderTop: "1px solid hsl(150 12% 13%)" }}
      >
        <button className="ck-btn ck-btn-brass flex-1" onClick={handleAdvance}>Advance<ChevronRight className="h-4 w-4" /></button>
        <button className="ck-btn ck-btn-outline flex-1" onClick={handlePass}>Pass</button>
        <button className="ck-btn ck-btn-outline flex-1" onClick={() => navigate(`/messages?candidate=${c.avatar}`)}><MessageSquare className="h-4 w-4" />Message</button>
      </div>
    </div>
  );
}
