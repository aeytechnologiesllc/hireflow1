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
  CheckCircle2,
  XCircle,
  CalendarPlus,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { PageHeader } from "../components/PageHeader";
import { Pipeline } from "../components/Pipeline";
import { CandidateMark } from "../components/CandidateMark";
import { ActionDialog } from "../components/ActionDialog";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import InterviewSchedulingWizard from "@/components/InterviewSchedulingWizard";
import { SearchInput, FilterSelect, type FilterOption } from "../components/controls";
import { useCockpitCandidates, useCockpitActions, nextAdvanceStatus, advanceTargetLabel, avaAdvanceRec } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";
import type { Candidate, CandidateStage, PipelineNode, StageKey } from "../data";

/** Stage-aware decision buttons shared by the detail panel, the table rows and the
 *  mobile cards. Terminal states show a badge; an offered candidate gets Hire +
 *  Decline; everyone else gets Advance + Pass. */
function RowActions({
  status,
  variant,
  onAdvance,
  onHire,
  onReject,
}: {
  status?: string;
  variant: "panel" | "row" | "card";
  onAdvance: () => void;
  onHire: () => void;
  onReject: () => void;
}) {
  const hired = status === "hired";
  const rejected = status === "rejected";
  const offered = status === "offered";
  const canAdvance = !!nextAdvanceStatus(status);

  if (hired || rejected) {
    return (
      <span
        className="ck-pill"
        style={
          hired
            ? { color: "hsl(152 52% 64%)", background: "hsl(152 46% 40% / 0.16)", borderColor: "hsl(152 46% 45% / 0.3)" }
            : { color: "hsl(8 60% 66%)", background: "hsl(8 40% 40% / 0.12)", borderColor: "hsl(8 40% 45% / 0.25)" }
        }
      >
        {hired ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {hired ? "Hired" : "Passed"}
      </span>
    );
  }

  if (variant === "panel") {
    return offered ? (
      <>
        <button className="ck-btn ck-btn-brass w-full" onClick={onHire}><CheckCircle2 className="h-4 w-4" />Hire</button>
        <button className="ck-btn ck-btn-outline w-full" style={{ color: "hsl(8 66% 66%)", borderColor: "hsl(8 50% 40% / 0.5)" }} onClick={onReject}>Decline Offer</button>
      </>
    ) : (
      <>
        {canAdvance && <button className="ck-btn ck-btn-brass w-full" onClick={onAdvance}>Advance<ChevronRight className="h-4 w-4" /></button>}
        <button className="ck-btn ck-btn-outline w-full" onClick={onReject}>Pass</button>
      </>
    );
  }

  const sm = "!px-3 !py-1.5 !text-[12px]";
  return offered ? (
    <button className={`ck-btn ck-btn-brass ${sm}`} onClick={onHire}><CheckCircle2 className="h-3.5 w-3.5" />Hire</button>
  ) : canAdvance ? (
    <button className={`ck-btn ck-btn-brass ${sm}`} onClick={onAdvance}>Advance<ChevronRight className="h-3.5 w-3.5" /></button>
  ) : null;
}

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];
const PAGE_SIZE = 8;
const STAGES: CandidateStage[] = ["Application", "Quiz", "Voice", "Shortlist", "Hired", "Rejected"];

/** A candidate has real screening signal once any score exists; until then we don't fake strengths. */
function isAnalyzed(c: Candidate): boolean {
  return (c.overall ?? 0) > 0 || c.quiz != null || c.voice != null;
}

function StagePill({ stage }: { stage: CandidateStage }) {
  if (stage === "Rejected") {
    return (
      <span className="ck-pill" style={{ color: "hsl(8 60% 66%)", background: "hsl(8 40% 40% / 0.12)", borderColor: "hsl(8 40% 45% / 0.25)" }}>
        Passed
      </span>
    );
  }
  const cls =
    stage === "Voice" ? "ck-pill-stage-voice" : stage === "Application" ? "ck-pill-stage-neutral" : "ck-pill-stage";
  return <span className={`ck-pill ${cls}`}>{stage}</span>;
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[15px]" style={{ color: "hsl(150 10% 42%)" }}>—</span>;
  return <span className="ck-num text-[15px]" style={{ color: "hsl(150 28% 88%)" }}>{value}%</span>;
}

function DetailPanel({ c, status, onClose, onAdvance, onHire, onReject, onSchedule, onViewProfile }: { c: Candidate; status?: string; onClose?: () => void; onAdvance: () => void; onHire: () => void; onReject: () => void; onSchedule: () => void; onViewProfile: () => void }) {
  const analyzed = isAnalyzed(c);
  const canSchedule = status !== "rejected" && status !== "hired";
  return (
    <div className="ck-card flex max-h-[calc(100dvh-104px)] flex-col p-5">
      {/* compact header — name, stage, match all visible at a glance */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-[19px]" style={{ color: "hsl(150 30% 93%)", fontWeight: 500 }}>{c.name}</div>
          <div className="mt-0.5 truncate text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>{c.role} · {c.appliedAgo}</div>
          <div className="mt-1.5"><StagePill stage={c.stage} /></div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {analyzed && (
            <div className="text-right">
              <div className="ck-num leading-none text-[22px]" style={{ color: "hsl(152 52% 58%)" }}>{c.overall}<span className="text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>%</span></div>
              <div className="text-[10.5px]" style={{ color: "hsl(150 10% 56%)" }}>match</div>
            </div>
          )}
          {onClose && (
            <button onClick={onClose} style={{ color: "hsl(150 10% 56%)" }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Ava's read — first content, no scrolling needed */}
      <div className="ck-inset mt-3 p-3">
        <div className="flex items-center gap-2">
          <AvaOrb size={34} reflection={false} glow={false} amp={0.22} flow={0.5} />
          <span className="font-display text-[14px]" style={{ color: "hsl(150 30% 90%)", fontWeight: 500 }}>Ava's read</span>
        </div>
        {analyzed ? (
          <p className="mt-2 text-[12.5px] leading-snug" style={{ color: "hsl(150 14% 66%)" }}>{c.readFull}</p>
        ) : (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug" style={{ color: "hsl(150 12% 60%)" }}>
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: "hsl(152 46% 58%)" }} />
            Ava is screening this candidate. Scores and strengths appear here once screening completes.
          </p>
        )}
      </div>

      {/* primary actions — reachable without scrolling past the read */}
      <div className="mt-3 space-y-2">
        <RowActions status={status} variant="panel" onAdvance={onAdvance} onHire={onHire} onReject={onReject} />
        {canSchedule && (
          <button className="ck-btn ck-btn-outline w-full" onClick={onSchedule}><CalendarPlus className="h-4 w-4" />Schedule interview</button>
        )}
        <button className="ck-btn ck-btn-ghost mx-auto !text-[12.5px]" onClick={onViewProfile}>View full profile<ExternalLink className="h-3.5 w-3.5" /></button>
      </div>

      {/* details (scroll for more) */}
      <div className="ck-scroll mt-4 flex-1 space-y-4 overflow-y-auto">
        {analyzed && c.strengths.length > 0 && (
          <div>
            <div className="text-[14px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>Top strengths</div>
            <div className="mt-2.5 space-y-2.5">
              {c.strengths.map((s, i) => {
                const Icon = STRENGTH_ICONS[i % STRENGTH_ICONS.length];
                return (
                  <div key={s} className="flex items-start gap-2.5 text-[13px]" style={{ color: "hsl(150 20% 78%)" }}>
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "hsl(152 30% 15%)", color: "hsl(152 46% 60%)" }}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1">{s}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {analyzed && (
          <div>
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
      </div>
    </div>
  );
}

export default function CockpitApplicants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleIdFilter = searchParams.get("roleId");
  const { candidates, pipeline, applications, isLoading } = useCockpitCandidates();
  const { advance, hire, reject, isUpdating } = useCockpitActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{ type: "hire" | "reject" | "advance"; cand: Candidate } | null>(null);
  const [hirePrompt, setHirePrompt] = useState<Candidate | null>(null);
  const [scheduleCand, setScheduleCand] = useState<Candidate | null>(null);

  // Map application id → live status (candidate.id === application.id in both schema modes).
  const statusById = useMemo(() => {
    const m: Record<string, string> = {};
    applications.forEach((a) => { m[a.id] = (a as { status?: string }).status ?? ""; });
    return m;
  }, [applications]);

  // The role identifier differs by schema: showcase apps carry `role_id`, hireflow1 apps carry
  // `job_id`. Support both so the Role filter + the Jobs "View" deep-link (?roleId=<jobId>) work.
  const appRoleId = (a: (typeof applications)[number]): string | null =>
    ((a as { role_id?: string | null }).role_id ?? (a as { job_id?: string | null }).job_id) ?? null;

  // Role-scoped set (drives the funnel + the role title) — only the URL roleId filter applies here.
  const roleScoped = useMemo(() => {
    if (!roleIdFilter) return candidates;
    const appIds = new Set(applications.filter((a) => appRoleId(a) === roleIdFilter).map((a) => a.id));
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
      const rid = appRoleId(a);
      const c = candidates.find((x) => x.id === a.id);
      if (rid && c?.role) map.set(rid, c.role);
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

  const pipelineTotal = filteredPipeline.reduce((s, n) => s + n.count, 0);

  const effectiveSelectedId = selectedId ?? paged[0]?.id ?? null;
  const selected = listCandidates.find((c) => c.id === effectiveSelectedId) ?? paged[0];

  // Funnel focus: the aggregate overview is the default. Only when the employer
  // *actively* clicks a row (selectedId set — not the auto-highlighted first row)
  // does the funnel switch to that one candidate's progress.
  const candidateFocused = selectedId !== null && !!selected;
  const candidateNodes = useMemo<PipelineNode[]>(() => {
    if (!candidateFocused || !selected) return [];
    const order: { key: StageKey; label: string; stage: CandidateStage }[] = [
      { key: "application", label: "Application", stage: "Application" },
      { key: "quiz", label: "Quiz", stage: "Quiz" },
      { key: "voice", label: "Voice", stage: "Voice" },
      { key: "shortlist", label: "Shortlist", stage: "Shortlist" },
      { key: "hired", label: "Hired", stage: "Hired" },
    ];
    const rejected = selected.stage === "Rejected";
    const curIdx = order.findIndex((o) => o.stage === selected.stage);
    return order.map((o, i) => {
      let state: PipelineNode["state"];
      if (rejected || curIdx < 0 || i > curIdx) state = "upcoming";
      else if (i === curIdx) state = "current";
      else state = "done";
      return { key: o.key, label: o.label, count: 0, pct: "", tone: "muted" as const, state };
    });
  }, [candidateFocused, selected]);

  const statusOf = (id: string) => (applications.find((a) => a.id === id) as { status?: string } | undefined)?.status;
  const openAdvance = (c: Candidate) => setActionDialog({ type: "advance", cand: c });
  const openHire = (c: Candidate) => setActionDialog({ type: "hire", cand: c });
  const openReject = (c: Candidate) => setActionDialog({ type: "reject", cand: c });
  const confirmAdvance = async () => {
    if (!actionDialog) return;
    await advance(actionDialog.cand.id, statusOf(actionDialog.cand.id));
    setActionDialog(null);
  };
  const confirmHire = async () => {
    if (!actionDialog) return;
    const c = actionDialog.cand;
    await hire(c.id);
    setActionDialog(null);
    setHirePrompt(c);
  };
  const confirmReject = async (reason?: string) => {
    if (!actionDialog) return;
    await reject(actionDialog.cand.id, reason);
    setActionDialog(null);
  };
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

      {/* Two-column command center: left = pipeline + filters + table · right = sticky candidate inspector */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-5">
          <div className="ck-card p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-[16px]" style={{ color: "hsl(150 28% 88%)", fontWeight: 500 }}>
            {candidateFocused && selected ? `Where ${selected.name.split(" ")[0]} is` : "Where your applicants are"}
          </h2>
          {candidateFocused && selected ? (
            <button
              onClick={() => setSelectedId(null)}
              className="inline-flex items-center gap-1.5 text-[12.5px] transition-opacity hover:opacity-80"
              style={{ color: "hsl(38 64% 66%)" }}
            >
              <X className="h-3.5 w-3.5" /> View whole pipeline
            </button>
          ) : (
            <span className="text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>
              {pipelineTotal} {pipelineTotal === 1 ? "candidate" : "candidates"} in your pipeline · each number is how many sit at that stage
            </span>
          )}
        </div>
        <Pipeline variant="large" nodes={candidateFocused ? candidateNodes : filteredPipeline} />
        <p className="mt-4 text-[12px]" style={{ color: "hsl(150 10% 50%)" }}>
          {candidateFocused && selected
            ? selected.stage === "Rejected"
              ? `${selected.name} was passed and is no longer active in this pipeline.`
              : `${selected.name} is at the ${selected.stage} stage right now — amber marks where they are. Click any other row to switch, or “View whole pipeline” to see everyone.`
            : "Quiz and Voice fill in only after a candidate completes those screening steps — that’s why their scores read “—” until then."}
        </p>
      </div>

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
                    className="grid cursor-pointer items-center gap-3 px-4 py-3 transition-colors"
                    style={{
                      gridTemplateColumns: "1.5fr 0.7fr 0.9fr 0.7fr 0.7fr 2fr 1.2fr",
                      borderBottom: "1px solid hsl(150 12% 13% / 0.6)",
                      background: isSel ? "hsl(38 40% 14% / 0.5)" : "transparent",
                      boxShadow: isSel ? "inset 4px 0 0 hsl(38 64% 60%)" : "none",
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
                    <div className="relative flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        status={statusById[c.id]}
                        variant="row"
                        onAdvance={() => openAdvance(c)}
                        onHire={() => openHire(c)}
                        onReject={() => openReject(c)}
                      />
                      <button style={{ color: "hsl(150 10% 52%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id); }}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuId === c.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuId(null); }} />
                          <div className="absolute right-0 top-9 z-50 min-w-[170px] overflow-hidden rounded-xl py-1" style={{ background: "hsl(156 16% 9%)", border: "1px solid hsl(150 12% 18%)", boxShadow: "0 16px 40px hsl(0 0% 0% / 0.5)" }}>
                            <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "hsl(150 20% 80%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(null); navigate(`/applicants/${c.id}`); }}>View full profile</button>
                            <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "hsl(150 20% 80%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(null); navigate(`/messages?candidate=${c.id}`); }}>Message</button>
                            {statusById[c.id] !== "hired" && statusById[c.id] !== "rejected" && (
                              <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "hsl(8 60% 64%)" }} onClick={(e) => { e.stopPropagation(); setMenuId(null); openReject(c); }}>
                                {statusById[c.id] === "offered" ? "Decline offer" : "Pass"}
                              </button>
                            )}
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
                    <div className="flex shrink-0 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        status={statusById[c.id]}
                        variant="card"
                        onAdvance={() => openAdvance(c)}
                        onHire={() => openHire(c)}
                        onReject={() => openReject(c)}
                      />
                      {statusById[c.id] !== "hired" && statusById[c.id] !== "rejected" && (
                        <button className="ck-btn ck-btn-outline !px-3 !py-1.5 !text-[12px]" onClick={(e) => { e.stopPropagation(); openReject(c); }}>
                          {statusById[c.id] === "offered" ? "Decline" : "Pass"}
                        </button>
                      )}
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
        </section>

        {/* right column — sticky candidate inspector, aligned high with the pipeline */}
        <aside className="hidden min-w-0 lg:block">
          {selected ? (
            <div className="hf-inspector-enter sticky top-4">
              <DetailPanel
                c={selected}
                status={statusById[selected.id]}
                onClose={() => setSelectedId(null)}
                onAdvance={() => openAdvance(selected)}
                onHire={() => openHire(selected)}
                onReject={() => openReject(selected)}
                onSchedule={() => setScheduleCand(selected)}
                onViewProfile={() => navigate(`/applicants/${selected.id}`)}
              />
            </div>
          ) : null}
        </aside>
      </div>

      {actionDialog?.type === "advance" && (() => {
        const cand = actionDialog.cand;
        const st = statusById[cand.id];
        const label = advanceTargetLabel(st);
        const rec = avaAdvanceRec(cand.overall ?? 0, isAnalyzed(cand));
        return (
          <ActionDialog
            open
            title={`Advance ${cand.name}?`}
            description={label ? `This moves ${cand.name} into your ${label} stage and notifies them of the progress.` : `This moves ${cand.name} forward in your pipeline.`}
            confirmLabel={label ? `Move to ${label}` : "Advance"}
            tone="brass"
            busy={isUpdating}
            note={rec.text}
            noteTone={rec.tone}
            onConfirm={() => void confirmAdvance()}
            onClose={() => setActionDialog(null)}
          />
        );
      })()}
      <ActionDialog
        open={actionDialog?.type === "hire"}
        title={actionDialog ? `Hire ${actionDialog.cand.name}?` : ""}
        description={actionDialog ? `This marks ${actionDialog.cand.name} as hired for ${actionDialog.cand.role} and lets them know. You can send an offer letter next.` : ""}
        confirmLabel="Confirm hire"
        tone="brass"
        busy={isUpdating}
        onConfirm={() => void confirmHire()}
        onClose={() => setActionDialog(null)}
      />
      <ActionDialog
        open={actionDialog?.type === "reject"}
        title={actionDialog ? (statusById[actionDialog.cand.id] === "offered" ? `Decline offer to ${actionDialog.cand.name}?` : `Pass on ${actionDialog.cand.name}?`) : ""}
        description={
          actionDialog && statusById[actionDialog.cand.id] === "offered"
            ? "This withdraws the offer and notifies the candidate. Add a short note for your records (optional)."
            : "This removes the candidate from your active pipeline and notifies them. Add a short note for your records (optional)."
        }
        confirmLabel={actionDialog && statusById[actionDialog.cand.id] === "offered" ? "Decline offer" : "Pass candidate"}
        tone="danger"
        busy={isUpdating}
        withReason
        reasonLabel="Reason (optional, private to you)"
        reasonPlaceholder="e.g. Strong, but went with someone with more weekend availability."
        onConfirm={(reason) => void confirmReject(reason)}
        onClose={() => setActionDialog(null)}
      />
      {hirePrompt && (
        <HiringDocumentPromptDialog
          open={!!hirePrompt}
          onOpenChange={(o) => { if (!o) setHirePrompt(null); }}
          candidateName={hirePrompt.name}
          jobTitle={hirePrompt.role}
          applicationId={hirePrompt.id}
          onSkip={() => setHirePrompt(null)}
        />
      )}
      {scheduleCand && (
        <InterviewSchedulingWizard
          open={!!scheduleCand}
          onOpenChange={(o) => { if (!o) setScheduleCand(null); }}
          applicationId={scheduleCand.id}
          candidateName={scheduleCand.name}
          candidateEmail={scheduleCand.email ?? undefined}
          jobTitle={scheduleCand.role}
        />
      )}
    </div>
  );
}
