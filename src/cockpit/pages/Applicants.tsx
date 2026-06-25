import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  X,
  SlidersHorizontal,
  UserRound,
  MessageCircle,
  Target,
  BookOpen,
  ShieldCheck,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { PageHeader } from "../components/PageHeader";
import { Pipeline } from "../components/Pipeline";
import { CandidateMark } from "../components/CandidateMark";
import { SearchInput, FilterSelect } from "../components/controls";
import { useCockpitCandidates, useCockpitActions } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";
import type { Candidate, CandidateStage } from "../data";

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];

function StagePill({ stage }: { stage: CandidateStage }) {
  const cls =
    stage === "Voice" ? "ck-pill-stage-voice" : stage === "Application" ? "ck-pill-stage-neutral" : "ck-pill-stage";
  return <span className={`ck-pill ${cls}`}>{stage}</span>;
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[15px]" style={{ color: "hsl(150 10% 42%)" }}>—</span>;
  return <span className="ck-num text-[15px]" style={{ color: "hsl(150 28% 88%)" }}>{value}%</span>;
}

function DetailPanel({ c, onClose, onAdvance, onPass }: { c: Candidate; onClose?: () => void; onAdvance: () => void; onPass: () => void }) {
  return (
    <div className="ck-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display text-[20px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>{c.name}</div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>{c.appliedAgo}</div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ color: "hsl(150 10% 56%)" }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3">
        <AvaOrb size={72} reflection={false} glow={false} amp={0.22} flow={0.5} />
        <div className="min-w-0">
          <div className="font-display text-[15px]" style={{ color: "hsl(150 30% 90%)", fontWeight: 500 }}>Ava's read</div>
          <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "hsl(150 12% 64%)" }}>{c.readFull}</p>
          <div className="mt-2 ck-num text-[18px]" style={{ color: "hsl(152 50% 56%)" }}>
            {c.overall}% <span className="text-[12px] font-sans" style={{ color: "hsl(150 10% 56%)" }}>match</span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[14px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>Top strengths</div>
        <div className="mt-2.5 space-y-2.5">
          {c.strengths.map((s, i) => {
            const Icon = STRENGTH_ICONS[i % STRENGTH_ICONS.length];
            return (
              <div key={s} className="flex items-center gap-2.5 text-[13px]" style={{ color: "hsl(150 20% 78%)" }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "hsl(152 30% 15%)", color: "hsl(152 46% 60%)" }}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {s}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>Risk factors</span>
          <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "hsl(152 46% 58%)" }}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {c.risk.level}
          </span>
        </div>
        <p className="mt-1 text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>{c.risk.note}</p>
      </div>

      <div className="mt-auto space-y-2 pt-5">
        <button className="ck-btn ck-btn-brass w-full" onClick={onAdvance}>Advance<ChevronRight className="h-4 w-4" /></button>
        <button className="ck-btn ck-btn-outline w-full" onClick={onPass}>Pass</button>
        <button className="ck-btn ck-btn-ghost mx-auto !text-[12.5px]">View full profile<ExternalLink className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export default function CockpitApplicants() {
  const navigate = useNavigate();
  const { candidates, pipeline, applications, isLoading } = useCockpitCandidates();
  const { advance, pass } = useCockpitActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const effectiveSelectedId = selectedId ?? candidates[0]?.id ?? null;
  const selected = candidates.find((c) => c.id === effectiveSelectedId) ?? candidates[0];
  const selectedApp = applications.find((a) => a.id === effectiveSelectedId);

  const handleAdvance = (id: string) => {
    const app = applications.find((a) => a.id === id);
    if (app) void advance(id, app.status);
  };

  const handlePass = (id: string) => {
    void pass(id);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Applicants" subtitle={candidates[0]?.role ? `${candidates[0].role} pipeline` : "Your hiring pipeline"} />

      {/* Pipeline */}
      <div className="ck-card p-5 md:p-6">
        <Pipeline variant="large" nodes={pipeline} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_316px]">
        {/* left: filters + list */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput placeholder="Search candidates…" className="min-w-[160px] flex-1" />
            <FilterSelect label="Role" value="All roles" />
            <FilterSelect label="Stage" value="All stages" />
            <FilterSelect label="Score" value="All scores" />
            <button className="ck-btn ck-btn-outline !py-2.5 !text-[13px]"><SlidersHorizontal className="h-3.5 w-3.5" />More filters</button>
          </div>

          {/* desktop table */}
          <div className="ck-card hidden overflow-hidden md:block">
            <div
              className="grid items-center gap-3 px-4 py-3 text-[12px]"
              style={{ gridTemplateColumns: "1.5fr 0.7fr 0.9fr 0.7fr 0.7fr 2fr 1.2fr", color: "hsl(150 10% 54%)", borderBottom: "1px solid hsl(150 12% 14%)" }}
            >
              <div>Candidate</div><div>Role</div><div>Stage</div><div>Quiz score</div><div>Voice score</div><div>Ava's read</div><div>Actions</div>
            </div>
            {candidates.length === 0 ? (
              <div className="p-8 text-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>No applicants yet.</div>
            ) : (
              candidates.map((c, i) => {
              const isSel = c.id === effectiveSelectedId;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  data-selected={isSel}
                  className="grid cursor-pointer items-center gap-3 px-4 py-3"
                  style={{
                    gridTemplateColumns: "1.5fr 0.7fr 0.9fr 0.7fr 0.7fr 2fr 1.2fr",
                    borderBottom: "1px solid hsl(150 12% 13% / 0.6)",
                    background: isSel ? "hsl(156 18% 10%)" : "transparent",
                    boxShadow: isSel ? "inset 2px 0 0 hsl(38 60% 60%)" : "none",
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={34} score={c.overall} index={i} variant="signal" />
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold" style={{ color: "hsl(150 30% 91%)" }}>{c.name}</div>
                      <div className="truncate text-[11.5px]" style={{ color: "hsl(150 10% 52%)" }}>{c.appliedAgo}</div>
                    </div>
                  </div>
                  <div className="text-[13px]" style={{ color: "hsl(150 14% 66%)" }}>{c.role}</div>
                  <div><StagePill stage={c.stage} /></div>
                  <div><Score value={c.quiz} /></div>
                  <div><Score value={c.voice} /></div>
                  <div className="truncate pr-2 text-[12.5px]" style={{ color: "hsl(150 10% 58%)" }}>{c.read}</div>
                  <div className="flex items-center gap-1.5">
                    <button className="ck-btn ck-btn-outline !px-3 !py-1.5 !text-[12.5px]" onClick={(e) => { e.stopPropagation(); handleAdvance(c.id); }}>
                      Advance<ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button style={{ color: "hsl(150 10% 52%)" }}><MoreHorizontal className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })
            )}
            <div className="flex items-center justify-between px-4 py-3 text-[12.5px]" style={{ color: "hsl(150 10% 54%)" }}>
              <span>Showing {candidates.length} candidate{candidates.length === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-1">
                {["1", "2", "3", "…", "9"].map((p, i) => (
                  <button
                    key={i}
                    className="flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[12.5px]"
                    style={i === 0 ? { background: "hsl(152 30% 16%)", color: "hsl(150 30% 88%)" } : { color: "hsl(150 12% 56%)" }}
                  >
                    {p}
                  </button>
                ))}
                <button className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color: "hsl(150 12% 56%)" }}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 md:hidden">
            {candidates.map((c, i) => (
              <div key={c.id} className="ck-row p-3.5" onClick={() => navigate(`/applicants/${c.id}`)}>
                <div className="flex items-start gap-3">
                  <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={48} score={c.overall} index={i} variant="signal" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold" style={{ color: "hsl(150 30% 91%)" }}>{c.name}</div>
                    <div className="text-[12px]" style={{ color: "hsl(150 10% 54%)" }}>{c.role}</div>
                    <div className="mt-1"><StagePill stage={c.stage} /></div>
                  </div>
                  <div className="flex shrink-0 gap-4 text-center">
                    <div><div className="text-[10.5px]" style={{ color: "hsl(150 10% 54%)" }}>Score</div><div className="ck-num text-[16px]" style={{ color: "hsl(150 28% 88%)" }}>{c.overall || "—"}</div></div>
                    <div><div className="text-[10.5px]" style={{ color: "hsl(150 10% 54%)" }}>Quiz</div><div className="ck-num text-[16px]" style={{ color: "hsl(150 28% 88%)" }}>{c.quiz ? `${c.quiz}%` : "—"}</div></div>
                    <div><div className="text-[10.5px]" style={{ color: "hsl(150 10% 54%)" }}>Voice</div><div className="ck-num text-[16px]" style={{ color: "hsl(150 28% 88%)" }}>{c.voice ? `${c.voice}%` : "—"}</div></div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px]" style={{ color: "hsl(150 10% 56%)" }}>Ava's read</div>
                    <p className="text-[12px] leading-snug" style={{ color: "hsl(150 12% 62%)" }}>{c.read}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button className="ck-btn ck-btn-brass !px-3 !py-1.5 !text-[12px]" onClick={(e) => { e.stopPropagation(); handleAdvance(c.id); }}>Advance<ChevronRight className="h-3.5 w-3.5" /></button>
                    <button className="ck-btn ck-btn-outline !px-3 !py-1.5 !text-[12px]" onClick={(e) => { e.stopPropagation(); handlePass(c.id); }}>Pass</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* right detail panel (desktop) */}
        <div className="hidden lg:block">
          {selected ? (
            <DetailPanel
              c={selected}
              onClose={() => undefined}
              onAdvance={() => handleAdvance(selected.id)}
              onPass={() => handlePass(selected.id)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
