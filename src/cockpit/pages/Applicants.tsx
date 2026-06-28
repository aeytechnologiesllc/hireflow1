import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  ChevronLeft,
  X,
  UserRound,
  MessageCircle,
  Target,
  BookOpen,
  ShieldCheck,
  MoreHorizontal,
  ExternalLink,
  Loader2,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { PageHeader } from "../components/PageHeader";
import { Pipeline } from "../components/Pipeline";
import { CandidateMark } from "../components/CandidateMark";
import { SearchInput, FilterSelect, type FilterOption } from "../components/controls";
import { useCockpitCandidates, useCockpitActions } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";
import type { Candidate, CandidateStage } from "../data";

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];
const PAGE_SIZE = 8;
const STAGES: CandidateStage[] = ["Application", "Quiz", "Voice", "Shortlist", "Hired"];

/** A candidate has real screening signal once any score exists; until then we don't fake strengths. */
function isAnalyzed(c: Candidate): boolean {
  return (c.overall ?? 0) > 0 || c.quiz != null || c.voice != null;
}

function StagePill({ stage }: { stage: CandidateStage }) {
  const cls =
    stage === "Voice" ? "ck-pill-stage-voice" : stage === "Application" ? "ck-pill-stage-neutral" : "ck-pill-stage";
  return <span className={`ck-pill ${cls}`}>{stage}</span>;
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[15px]" style={{ color: "hsl(150 10% 42%)" }}>—</span>;
  return <span className="ck-num text-[15px]" style={{ color: "hsl(150 28% 88%)" }}>{value}%</span>;
}

function DetailPanel({ c, onClose, onAdvance, onPass, onViewProfile }: { c: Candidate; onClose?: () => void; onAdvance: () => void; onPass: () => void; onViewProfile: () => void }) {
  const analyzed = isAnalyzed(c);
  return (
    <div className="ck-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display text-[20px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>{c.name}</div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>{c.role} · {c.appliedAgo}</div>
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
          {analyzed ? (
            <>
              <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "hsl(150 12% 64%)" }}>{c.readFull}</p>
              <div className="mt-2 ck-num text-[18px]" style={{ color: "hsl(152 50% 56%)" }}>
                {c.overall}% <span className="text-[12px] font-sans" style={{ color: "hsl(150 10% 56%)" }}>match</span>
              </div>
            </>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] leading-snug" style={{ color: "hsl(150 12% 60%)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "hsl(152 46% 58%)" }} />
              Ava is screening this candidate. Scores and strengths appear here once screening completes.
            </p>
          )}
        </div>
      </div>

      {analyzed && c.strengths.length > 0 && (
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
      )}

      {analyzed && (
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
      )}

      <div className="mt-auto space-y-2 pt-5">
        <button className="ck-btn ck-btn-brass w-full" onClick={onAdvance}>Advance<ChevronRight className="h-4 w-4" /></button>
        <button className="ck-btn ck-btn-outline w-full" onClick={onPass}>Pass</button>
        <button className="ck-btn ck-btn-ghost mx-auto !text-[12.5px]" onClick={onViewProfile}>View full profile<ExternalLink className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export default function CockpitApplicants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleIdFilter = searchParams.get("roleId");
  const { candidates, pipeline, applications, isLoading } = useCockpitCandidates();
  const { advance, pass } = useCockpitActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);

  // Role-scoped set (drives the funnel + the role title) — only the URL roleId filter applies here.
  const roleScoped = useMemo(() => {
    if (!roleIdFilter) return candidates;
    const appIds = new Set(applications.filter((a) => a.role_id === roleIdFilter).map((a) => a.id));
    return candidates.filter((c) => appIds.has(c.id));
  }, [candidates, applications, roleIdFilter]);

  // List set (drives the table) — role + search + stage + score filters.
  const listCandidates = useMemo(() => {
    let list = roleScoped;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q));
    if (stageFilter) list = list.filter((c) => c.stage === stageFilter);
    if (scoreFilter) {
      list = list.filter((c) => {
        const s = c.overall ?? 0;
        if (scoreFilter === "80") return s >= 80;
        if (scoreFilter === "50") return s >= 50 && s < 80;
        if (scoreFilter === "lt") return s > 0 && s < 50;
        if (scoreFilter === "none") return s === 0;
        return true;
      });
    }
    return list;
  }, [roleScoped, search, stageFilter, scoreFilter]);

  // Reset to page 1 whenever the filters change.
  useEffect(() => { setPage(1); }, [search, stageFilter, scoreFilter, roleIdFilter]);

  const totalPages = Math.max(1, Math.ceil(listCandidates.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageStart = (pageClamped - 1) * PAGE_SIZE;
  const paged = listCandidates.slice(pageStart, pageStart + PAGE_SIZE);

  const roleOptions = useMemo<FilterOption[]>(() => {
    const map = new Map<string, string>();
    for (const a of applications) {
      const c = candidates.find((x) => x.id === a.id);
      if (a.role_id && c?.role) map.set(a.role_id, c.role);
    }
    return [{ label: "All roles", value: "" }, ...[...map].map(([value, label]) => ({ label, value }))];
  }, [applications, candidates]);

  const stageOptions: FilterOption[] = [{ label: "All stages", value: "" }, ...STAGES.map((s) => ({ label: s, value: s }))];
  const scoreOptions: FilterOption[] = [
    { label: "All scores", value: "" },
    { label: "80% and up", value: "80" },
    { label: "50–79%", value: "50" },
    { label: "Below 50%", value: "lt" },
    { label: "Not yet scored", value: "none" },
  ];

  const filteredPipeline = useMemo(() => {
    if (!roleIdFilter) return pipeline;
    const total = Math.max(roleScoped.length, 1);
    const count = (stage: CandidateStage) => roleScoped.filter((c) => c.stage === stage).length;
    const application = count("Application");
    const quiz = count("Quiz");
    const voice = count("Voice");
    const shortlist = count("Shortlist");
    const hired = count("Hired");
    const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
    const drop = (from: number, to: number) => (from > 0 ? Math.max(0, from - to) : 0);
    return [
      { key: "application", label: "Application", count: application, pct: pct(application), tone: "green" as const, dropOff: drop(application, quiz) },
      { key: "quiz", label: "Quiz", count: quiz, pct: pct(quiz), tone: "green" as const, dropOff: drop(quiz, voice) },
      { key: "voice", label: "Voice", count: voice, pct: pct(voice), tone: voice > 0 && voice / total < 0.25 ? "bottleneck" as const : "green" as const, dropOff: drop(voice, shortlist) },
      { key: "shortlist", label: "Shortlist", count: shortlist, pct: pct(shortlist), tone: "muted" as const, dropOff: drop(shortlist, hired) },
      { key: "hired", label: "Hired", count: hired, pct: pct(hired), tone: "muted" as const },
    ];
  }, [roleScoped, pipeline, roleIdFilter]);

  const effectiveSelectedId = selectedId ?? paged[0]?.id ?? null;
  const selected = listCandidates.find((c) => c.id === effectiveSelectedId) ?? paged[0];

  const handleAdvance = (id: string) => {
    const app = applications.find((a) => a.id === id);
    if (app) void advance(id, app.status);
  };
  const handlePass = (id: string) => { void pass(id); };
  const setRole = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("roleId", value); else next.delete("roleId");
    setSearchParams(next);
  };

  const roleName = roleIdFilter ? roleOptions.find((o) => o.value === roleIdFilter)?.label : null;

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" />
      </div>
    );
  }

  const pageNumbers = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const set = new Set([1, 2, totalPages - 1, totalPages, pageClamped - 1, pageClamped, pageClamped + 1]);
    return Array.from(set).filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  })();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Applicants"
        subtitle={roleName ? `${roleName} pipeline` : roleIdFilter ? "Filtered to one role" : "Your hiring pipeline"}
      />

      <div className="ck-card p-5 md:p-6">
        <Pipeline variant="large" nodes={filteredPipeline} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_316px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput placeholder="Search candidates…" className="min-w-[160px] flex-1" value={search} onChange={setSearch} />
            <FilterSelect label="Role" value={roleIdFilter ?? ""} options={roleOptions} onChange={setRole} />
            <FilterSelect label="Stage" value={stageFilter} options={stageOptions} onChange={setStageFilter} />
            <FilterSelect label="Score" value={scoreFilter} options={scoreOptions} onChange={setScoreFilter} />
          </div>

          {/* desktop table */}
          <div className="ck-card hidden overflow-hidden md:block">
            <div
              className="grid items-center gap-3 px-4 py-3 text-[12px]"
              style={{ gridTemplateColumns: "1.5fr 0.7fr 0.9fr 0.7fr 0.7fr 2fr 1.2fr", color: "hsl(150 10% 54%)", borderBottom: "1px solid hsl(150 12% 14%)" }}
            >
              <div>Candidate</div><div>Role</div><div>Stage</div><div>Quiz score</div><div>Voice score</div><div>Ava's read</div><div>Actions</div>
            </div>
            {paged.length === 0 ? (
              <div className="p-8 text-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>
                {listCandidates.length === 0 && (roleIdFilter || search || stageFilter || scoreFilter)
                  ? "No applicants match these filters."
                  : "No applicants yet."}
              </div>
            ) : (
              paged.map((c, i) => {
                const isSel = c.id === effectiveSelectedId;
                const analyzed = isAnalyzed(c);
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
                      <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={34} score={c.overall} index={pageStart + i} variant="signal" />
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold" style={{ color: "hsl(150 30% 91%)" }}>{c.name}</div>
                        <div className="truncate text-[11.5px]" style={{ color: "hsl(150 10% 52%)" }}>{c.appliedAgo}</div>
                      </div>
                    </div>
                    <div className="text-[13px]" style={{ color: "hsl(150 14% 66%)" }}>{c.role}</div>
                    <div><StagePill stage={c.stage} /></div>
                    <div><Score value={c.quiz} /></div>
                    <div><Score value={c.voice} /></div>
                    <div className="truncate pr-2 text-[12.5px]" style={{ color: "hsl(150 10% 58%)" }}>{analyzed ? c.read : "Screening in progress…"}</div>
                    <div className="relative flex items-center gap-1.5">
                      <button className="ck-btn ck-btn-outline !px-3 !py-1.5 !text-[12.5px]" onClick={(e) => { e.stopPropagation(); handleAdvance(c.id); }}>
                        Advance<ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button style={{ color: "hsl(150 10% 52%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id); }}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuId === c.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuId(null); }} />
                          <div className="absolute right-0 top-9 z-50 min-w-[170px] overflow-hidden rounded-xl py-1" style={{ background: "hsl(156 16% 9%)", border: "1px solid hsl(150 12% 18%)", boxShadow: "0 16px 40px hsl(0 0% 0% / 0.5)" }}>
                            <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "hsl(150 20% 80%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(null); navigate(`/applicants/${c.id}`); }}>View full profile</button>
                            <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "hsl(150 20% 80%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(null); navigate(`/messages?candidate=${c.id}`); }}>Message</button>
                            <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "hsl(8 60% 64%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(null); handlePass(c.id); }}>Pass</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div className="flex items-center justify-between px-4 py-3 text-[12.5px]" style={{ color: "hsl(150 10% 54%)" }}>
              <span>
                {listCandidates.length === 0
                  ? "No candidates"
                  : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, listCandidates.length)} of ${listCandidates.length}`}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button disabled={pageClamped === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30" style={{ color: "hsl(150 12% 56%)" }}><ChevronLeft className="h-4 w-4" /></button>
                  {pageNumbers.map((n, idx) => {
                    const prev = pageNumbers[idx - 1];
                    const gap = prev != null && n - prev > 1;
                    return (
                      <span key={n} className="flex items-center">
                        {gap && <span className="px-1" style={{ color: "hsl(150 12% 45%)" }}>…</span>}
                        <button
                          onClick={() => setPage(n)}
                          className="flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[12.5px]"
                          style={n === pageClamped ? { background: "hsl(152 30% 16%)", color: "hsl(150 30% 88%)" } : { color: "hsl(150 12% 56%)" }}
                        >
                          {n}
                        </button>
                      </span>
                    );
                  })}
                  <button disabled={pageClamped === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30" style={{ color: "hsl(150 12% 56%)" }}><ChevronRight className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 md:hidden">
            {paged.map((c, i) => {
              const analyzed = isAnalyzed(c);
              return (
                <div key={c.id} className="ck-row p-3.5" onClick={() => navigate(`/applicants/${c.id}`)}>
                  <div className="flex items-start gap-3">
                    <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={48} score={c.overall} index={pageStart + i} variant="signal" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold" style={{ color: "hsl(150 30% 91%)" }}>{c.name}</div>
                      <div className="text-[12px]" style={{ color: "hsl(150 10% 54%)" }}>{c.role}</div>
                      <div className="mt-1"><StagePill stage={c.stage} /></div>
                    </div>
                    <div className="flex shrink-0 gap-4 text-center">
                      <div><div className="text-[10.5px]" style={{ color: "hsl(150 10% 54%)" }}>Score</div><div className="ck-num text-[16px]" style={{ color: "hsl(150 28% 88%)" }}>{c.overall || "—"}</div></div>
                      <div><div className="text-[10.5px]" style={{ color: "hsl(150 10% 54%)" }}>Quiz</div><div className="ck-num text-[16px]" style={{ color: "hsl(150 28% 88%)" }}>{c.quiz != null ? `${c.quiz}%` : "—"}</div></div>
                      <div><div className="text-[10.5px]" style={{ color: "hsl(150 10% 54%)" }}>Voice</div><div className="ck-num text-[16px]" style={{ color: "hsl(150 28% 88%)" }}>{c.voice != null ? `${c.voice}%` : "—"}</div></div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px]" style={{ color: "hsl(150 10% 56%)" }}>Ava's read</div>
                      <p className="text-[12px] leading-snug" style={{ color: "hsl(150 12% 62%)" }}>{analyzed ? c.read : "Screening in progress…"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button className="ck-btn ck-btn-brass !px-3 !py-1.5 !text-[12px]" onClick={(e) => { e.stopPropagation(); handleAdvance(c.id); }}>Advance<ChevronRight className="h-3.5 w-3.5" /></button>
                      <button className="ck-btn ck-btn-outline !px-3 !py-1.5 !text-[12px]" onClick={(e) => { e.stopPropagation(); handlePass(c.id); }}>Pass</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {paged.length === 0 && (
              <div className="ck-card p-8 text-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>No applicants yet.</div>
            )}
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
              onViewProfile={() => navigate(`/applicants/${selected.id}`)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
