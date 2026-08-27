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
import AvaSeal from "@/components/ava/AvaSeal";
import { CandidateMark } from "../components/CandidateMark";
import { ActionDialog } from "../components/ActionDialog";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import { useCockpitCandidate, useCockpitActions, useCockpitAccount, nextAdvanceStatus, advanceTargetLabel, avaAdvanceRec } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";
import { ResumeViewerDialog } from "../components/ResumeViewerDialog";

const STRENGTH_ICONS = [UserRound, MessageCircle, Target, BookOpen];

export default function CockpitCandidateDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { candidate: c, application, isLoading } = useCockpitCandidate(id);
  const { advance, hire, reject, isUpdating } = useCockpitActions();
  const { account } = useCockpitAccount();
  const [dialog, setDialog] = useState<null | "hire" | "reject" | "advance">(null);
  const [hirePrompt, setHirePrompt] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);

  // Go back to where they came from (the applicants list, with its filter +
  // selection intact); fall back to the list if this was a deep link.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/applicants");
  };

  if (isLoading || !c) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--hf-green)] border-t-transparent" />
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
      {/* Sticky back — stays pinned to the top of the profile while scrolling, so
          there's always a clear way back to the list (it used to scroll away). */}
      <div
        className="sticky top-0 z-20 mb-3 py-2.5"
        style={{ background: "hsl(var(--ck-bg) / 0.85)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      >
        {/* desktop */}
        <button
          onClick={goBack}
          className="hidden items-center gap-1.5 text-[13.5px] transition-opacity hover:opacity-80 md:inline-flex"
          style={{ color: "var(--hf-text-soft)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to applicants
        </button>
        {/* mobile */}
        <div className="flex items-center gap-3 md:hidden">
          <button onClick={goBack} aria-label="Back to applicants" style={{ color: "var(--hf-text)" }}><ChevronLeft className="h-6 w-6" /></button>
          <span className="min-w-0 flex-1 truncate font-display text-[18px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>{c.name}</span>
          <button
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{ background: "color-mix(in srgb, var(--hf-surface-raised) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--hf-border-strong) 90%, transparent)", color: "var(--hf-text)" }}
          >
            <span className="text-[13px] font-medium">{account.name}</span>
            <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--hf-text-muted)" }} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="ck-card flex items-center gap-4 p-4">
          <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={72} score={c.overall} rich variant="signal" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[24px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>{c.name}</div>
            <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>{c.role} · {c.appliedAgo}</div>
            <div className="mt-1.5"><span className="ck-pill ck-pill-stage">{c.stage}</span></div>
          </div>
          <div className="text-right">
            <div className="ck-num leading-none" style={{ fontSize: 36, color: "var(--hf-text)" }}>
              {c.overall}<span className="text-[16px]" style={{ color: "var(--hf-text-muted)" }}>%</span>
            </div>
            <div className="text-[12px]" style={{ color: "var(--hf-text-muted)" }}>match</div>
          </div>
        </div>

        <div className="ck-card flex items-start gap-3 p-4">
          <AvaSeal size={34} />
          <div className="min-w-0">
            <div className="font-display text-[16px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>Ava's read</div>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>{c.readFull}</p>
          </div>
        </div>

        <div className="ck-card p-4">
          <div className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Top strengths</div>
          <div className="mt-2 space-y-1">
            {c.strengths.map((s, i) => {
              const Icon = STRENGTH_ICONS[i % STRENGTH_ICONS.length];
              return (
                <div key={s} className="flex items-start gap-2.5 py-1.5 text-[13px]" style={{ color: "var(--hf-text)" }}>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--hf-green-soft)", color: "var(--hf-green)" }}>
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
              <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>{s.label}</div>
              <div className="ck-num leading-none" style={{ fontSize: 28, color: "var(--hf-text)" }}>
                {s.v ?? "—"}{s.v !== null ? <span className="text-[14px]" style={{ color: "var(--hf-text-muted)" }}>%</span> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="ck-card flex items-center gap-3 p-4">
          <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "var(--hf-green)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Risk factors</div>
            <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>{c.risk.level} — {c.risk.note}</div>
          </div>
        </div>

        {/* Resume — clear about whether one was provided */}
        <div className="ck-card flex items-center gap-3 p-4">
          <FileText className="h-5 w-5 shrink-0" style={{ color: resumeUrl ? "var(--hf-green)" : "var(--hf-text-muted)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Resume</div>
            <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>
              {resumeUrl ? "Uploaded by the candidate." : "No resume provided — Ava scored this from the application answers."}
            </div>
          </div>
          {resumeUrl && (
            <button onClick={() => setResumeOpen(true)} className="ck-btn ck-btn-outline !px-3 !py-1.5 !text-[12.5px]">
              View
            </button>
          )}
        </div>
      </div>

      <div
        className="fixed inset-x-0 z-30 flex items-center gap-2 px-4 py-3 md:absolute md:rounded-2xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", background: "color-mix(in srgb, var(--hf-bg) 96%, transparent)", borderTop: "1px solid var(--hf-surface-raised)" }}
      >
        {isTerminal ? (
          <>
            <div
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold"
              style={
                isHired
                  ? { background: "color-mix(in srgb, var(--hf-green) 16%, transparent)", color: "var(--hf-text-soft)", border: "1px solid color-mix(in srgb, var(--hf-green) 30%, transparent)" }
                  : { background: "color-mix(in srgb, var(--hf-danger) 12%, transparent)", color: "var(--hf-danger)", border: "1px solid color-mix(in srgb, var(--hf-danger) 25%, transparent)" }
              }
            >
              {isHired ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {isHired ? "Hired" : "Not moving forward"}
            </div>
            <button className="ck-btn ck-btn-outline flex-1" onClick={() => navigate(`/messages?candidate=${c.avatar}`)}><MessageSquare className="h-4 w-4" />Message</button>
          </>
        ) : isOffered ? (
          <>
            <button className="ck-btn ck-btn-primary flex-1" onClick={() => setDialog("hire")}><CheckCircle2 className="h-4 w-4" />Hire</button>
            <button
              className="ck-btn ck-btn-outline flex-1"
              style={{ color: "var(--hf-danger)", borderColor: "color-mix(in srgb, var(--hf-danger) 50%, transparent)" }}
              onClick={() => setDialog("reject")}
            >
              Decline Offer
            </button>
            <button className="ck-btn ck-btn-outline flex-1" onClick={() => navigate(`/messages?candidate=${c.avatar}`)}><MessageSquare className="h-4 w-4" />Message</button>
          </>
        ) : (
          <>
            {canAdvance && (
              <button className="ck-btn ck-btn-primary flex-1" onClick={() => setDialog("advance")} disabled={isUpdating}>Advance<ChevronRight className="h-4 w-4" /></button>
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

      <ResumeViewerDialog
        open={resumeOpen}
        url={resumeUrl}
        candidateName={c.name}
        avaRead={analyzed ? c.read : undefined}
        onClose={() => setResumeOpen(false)}
      />
    </div>
  );
}
