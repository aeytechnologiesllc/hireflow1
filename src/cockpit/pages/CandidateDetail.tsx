import { useState } from "react";
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
  CheckCircle2,
  XCircle,
  FileText,
  ArrowLeft,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { CandidateMark } from "../components/CandidateMark";
import { ActionDialog } from "../components/ActionDialog";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import { useCockpitCandidate, useCockpitActions, useCockpitAccount, nextAdvanceStatus, advanceTargetLabel, avaAdvanceRec } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];

export default function CockpitCandidateDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { candidate: c, application, isLoading } = useCockpitCandidate(id);
  const { advance, hire, reject, isUpdating } = useCockpitActions();
  const { account } = useCockpitAccount();
  const [dialog, setDialog] = useState<null | "hire" | "reject" | "advance">(null);
  const [hirePrompt, setHirePrompt] = useState(false);

  if (isLoading || !c) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" />
      </div>
    );
  }

  const status = application?.status;
  const isHired = status === "hired";
  const isRejected = status === "rejected";
  const isOffered = status === "offered";
  const isTerminal = isHired || isRejected;
  const canAdvance = !!nextAdvanceStatus(status);
  const analyzed = (c.overall ?? 0) > 0 || c.quiz != null || c.voice != null;
  const advanceLabel = advanceTargetLabel(status);
  const rec = avaAdvanceRec(c.overall ?? 0, analyzed);
  const resumeUrl = (application as { resume_url?: string | null } | null)?.resume_url ?? null;

  const doAdvance = async () => {
    if (application) await advance(c.id, application.status);
    setDialog(null);
  };
  const doHire = async () => {
    await hire(c.id);
    setDialog(null);
    setHirePrompt(true);
  };
  const doReject = async (reason?: string) => {
    await reject(c.id, reason);
    setDialog(null);
  };

  return (
    <div className="mx-auto max-w-[640px] pb-28">
      {/* desktop back */}
      <button
        onClick={() => navigate("/applicants")}
        className="mb-4 hidden items-center gap-1.5 text-[13.5px] md:inline-flex"
        style={{ color: "hsl(150 14% 64%)" }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to applicants
      </button>

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
                <div key={s} className="flex items-start gap-2.5 py-1.5 text-[13px]" style={{ color: "hsl(150 20% 80%)" }}>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "hsl(152 30% 15%)", color: "hsl(152 46% 60%)" }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1">{s}</span>
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
        </div>

        {/* Resume — clear about whether one was provided */}
        <div className="ck-card flex items-center gap-3 p-4">
          <FileText className="h-5 w-5 shrink-0" style={{ color: resumeUrl ? "hsl(152 46% 58%)" : "hsl(150 10% 48%)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>Resume</div>
            <div className="text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>
              {resumeUrl ? "Uploaded by the candidate." : "No resume provided — Ava scored this from the application answers."}
            </div>
          </div>
          {resumeUrl && (
            <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="ck-btn ck-btn-outline !px-3 !py-1.5 !text-[12.5px]">
              View
            </a>
          )}
        </div>
      </div>

      <div
        className="fixed inset-x-0 z-30 flex items-center gap-2 px-4 py-3 md:absolute md:rounded-2xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", background: "hsl(156 20% 5% / 0.96)", borderTop: "1px solid hsl(150 12% 13%)" }}
      >
        {isTerminal ? (
          <>
            <div
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold"
              style={
                isHired
                  ? { background: "hsl(152 46% 40% / 0.16)", color: "hsl(152 52% 64%)", border: "1px solid hsl(152 46% 45% / 0.3)" }
                  : { background: "hsl(8 40% 40% / 0.12)", color: "hsl(8 60% 66%)", border: "1px solid hsl(8 40% 45% / 0.25)" }
              }
            >
              {isHired ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {isHired ? "Hired" : "Not moving forward"}
            </div>
            <button className="ck-btn ck-btn-outline flex-1" onClick={() => navigate(`/messages?candidate=${c.avatar}`)}><MessageSquare className="h-4 w-4" />Message</button>
          </>
        ) : isOffered ? (
          <>
            <button className="ck-btn ck-btn-brass flex-1" onClick={() => setDialog("hire")}><CheckCircle2 className="h-4 w-4" />Hire</button>
            <button
              className="ck-btn ck-btn-outline flex-1"
              style={{ color: "hsl(8 66% 66%)", borderColor: "hsl(8 50% 40% / 0.5)" }}
              onClick={() => setDialog("reject")}
            >
              Decline Offer
            </button>
            <button className="ck-btn ck-btn-outline flex-1" onClick={() => navigate(`/messages?candidate=${c.avatar}`)}><MessageSquare className="h-4 w-4" />Message</button>
          </>
        ) : (
          <>
            {canAdvance && (
              <button className="ck-btn ck-btn-brass flex-1" onClick={() => setDialog("advance")} disabled={isUpdating}>Advance<ChevronRight className="h-4 w-4" /></button>
            )}
            <button className="ck-btn ck-btn-outline flex-1" onClick={() => setDialog("reject")}>Pass</button>
            <button className="ck-btn ck-btn-outline flex-1" onClick={() => navigate(`/messages?candidate=${c.avatar}`)}><MessageSquare className="h-4 w-4" />Message</button>
          </>
        )}
      </div>

      <ActionDialog
        open={dialog === "advance"}
        title={`Advance ${c.name}?`}
        description={advanceLabel ? `This moves ${c.name} into your ${advanceLabel} stage and notifies them of the progress.` : `This moves ${c.name} forward in your pipeline.`}
        confirmLabel={advanceLabel ? `Move to ${advanceLabel}` : "Advance"}
        tone="brass"
        busy={isUpdating}
        note={rec.text}
        noteTone={rec.tone}
        onConfirm={() => void doAdvance()}
        onClose={() => setDialog(null)}
      />
      <ActionDialog
        open={dialog === "hire"}
        title={`Hire ${c.name}?`}
        description={`This marks ${c.name} as hired for ${c.role} and lets them know. You can send an offer letter next.`}
        confirmLabel="Confirm hire"
        tone="brass"
        busy={isUpdating}
        onConfirm={() => void doHire()}
        onClose={() => setDialog(null)}
      />
      <ActionDialog
        open={dialog === "reject"}
        title={isOffered ? `Decline offer to ${c.name}?` : `Pass on ${c.name}?`}
        description={isOffered
          ? "This withdraws the offer and notifies the candidate. Add a short note for your records (optional)."
          : "This removes the candidate from your active pipeline and notifies them. Add a short note for your records (optional)."}
        confirmLabel={isOffered ? "Decline offer" : "Pass candidate"}
        tone="danger"
        busy={isUpdating}
        withReason
        reasonLabel="Reason (optional, private to you)"
        reasonPlaceholder="e.g. Strong, but went with someone with more weekend availability."
        onConfirm={(reason) => void doReject(reason)}
        onClose={() => setDialog(null)}
      />

      <HiringDocumentPromptDialog
        open={hirePrompt}
        onOpenChange={setHirePrompt}
        candidateName={c.name}
        jobTitle={c.role}
        applicationId={c.id}
        onSkip={() => setHirePrompt(false)}
      />
    </div>
  );
}
