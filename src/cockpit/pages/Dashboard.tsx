import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight, CalendarDays, Briefcase } from "lucide-react";
import { clearDraft } from "@/lib/avaEngine/draft";
import AvaSeal from "@/components/ava/AvaSeal";
import CkAvatar from "../components/Avatar";
import { ActionDialog } from "../components/ActionDialog";
import {
  useCockpitAccount,
  useCockpitCandidates,
  useCockpitActions,
  useCockpitInterviews,
  useCockpitJobsData,
  advanceTargetLabel,
  avaAdvanceRec,
} from "../hooks/useCockpitData";
import type { Candidate } from "../data";

/**
 * The morning read.
 *
 * This screen answers one question: who is worth your time today. Ava says what
 * she did overnight in one line, then the people she sealed, each with the one
 * piece of evidence behind the score and the only two decisions that matter —
 * pass, or talk to them. Everything else is a link away.
 *
 * No hero graphic: the greeting carries the page.
 */

/** Real wax never sits square. A stable per-row tilt, so it does not jitter on re-render. */
const TILTS = [-6, 4, -3, 5, -4];

/**
 * A person is only "sealed" once Ava has real screening signal on them. Until
 * then there is no seal, no number and no place on this page — the same test
 * the Applicants list uses to decide who gets a score and who gets a dash.
 */
function isAnalyzed(c: Candidate): boolean {
  return (c.overall ?? 0) > 0 || c.quiz != null || c.voice != null;
}

/**
 * Ava files her report with section headers and markdown emphasis. The employer
 * should read her sentences, not the scaffolding, so the marks are stripped and
 * the bare headers dropped. Display only — the stored record is untouched.
 */
function avaProse(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/\*\*/g, "").replace(/^[-–—•*]+\s*/, "").trim())
    .filter((line) => line.length > 2 && !/^[A-Z0-9 ,/&'()-]+:?$/.test(line))
    .join(" ")
    .trim();
}

/** Cut at a sentence end where there is one, a word boundary otherwise — never mid-word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.45) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max).trimEnd()}…`;
}

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Greet a person by their first name; greet a business by its whole name.
 * Splitting on the first word turns "Ridgeway Garage" into "Ridgeway" — wrong
 * but survivable — and the generic "Your business" placeholder into "Your",
 * which reads as broken. Returns null when we have nothing worth saying.
 */
function greetingName(fullName: string | null | undefined, company: string) {
  const person = fullName?.trim();
  if (person) return person.split(/\s+/)[0];
  const business = company.trim();
  if (!business || /^your business$/i.test(business)) return null;
  return business;
}

function SealedRow({
  candidate,
  index,
  showRole,
  advanceLabel,
  onPass,
  onAdvance,
  onOpen,
  busy,
}: {
  candidate: Candidate;
  index: number;
  /** The role only earns the meta line when the sealed three span more than one job. */
  showRole: boolean;
  /** The stage this person lands in, so the button never says something vague. */
  advanceLabel: string | null;
  onPass: () => void;
  onAdvance: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  // One finished sentence of Ava's evidence — never her raw report.
  const why = clip(avaProse(candidate.readFull) || candidate.read, 120);

  return (
    <div className="ck-card ck-reveal px-4 py-3" style={{ ["--ck-i" as string]: 2 + index }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* who */}
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left min-[621px]:flex-none min-[621px]:basis-[210px]"
        >
          <span className="relative shrink-0">
            <CkAvatar who={candidate.name} size={40} />
            <AvaSeal
              size={20}
              tilt={TILTS[index % TILTS.length]}
              style={{ position: "absolute", right: -6, bottom: -6 }}
            />
          </span>
          <span className="min-w-0">
            <span
              className="block truncate text-[14px] font-semibold leading-[1.3]"
              style={{ color: "var(--hf-text)" }}
            >
              {candidate.name}
            </span>
            {/* What tells these three apart — not the role they all applied to. */}
            <span
              className="block truncate text-[12px] leading-[1.35]"
              style={{ color: "var(--hf-text-muted)" }}
            >
              {showRole ? `${candidate.role} · ${candidate.appliedAgo}` : candidate.appliedAgo}
            </span>
          </span>
        </button>

        {/* why — Ava's evidence. On a phone it sits above the decision, never under it. */}
        <p
          className="min-w-0 flex-1 border-l-2 pl-[14px] text-[13px] leading-[1.5] max-[620px]:order-3 max-[620px]:basis-full max-[620px]:border-l-0 max-[620px]:pl-0"
          style={{ color: "var(--hf-text-soft)", borderColor: "var(--hf-gold-border)" }}
        >
          {why}
        </p>

        {/* the score — Ava's verdict, and the one jade thing on the row */}
        <div className="min-w-[58px] shrink-0 text-right">
          <div
            className="ck-num font-semibold"
            style={{ fontSize: 38, lineHeight: 0.85, color: "var(--jade)" }}
          >
            {candidate.overall}
          </div>
          <div
            className="mt-[5px] text-[10px] font-bold uppercase leading-[1.2] tracking-[0.08em]"
            style={{ color: "var(--hf-text-muted)" }}
          >
            Sealed
          </div>
        </div>

        {/* the only two decisions */}
        <div className="flex shrink-0 items-center gap-2 max-[620px]:order-4 max-[620px]:w-full max-[620px]:justify-end">
          <button className="ck-btn ck-btn-outline !py-2 !text-[13px]" onClick={onPass} disabled={busy}>
            Pass
          </button>
          {advanceLabel && (
            <button className="ck-btn ck-btn-primary !py-2 !text-[13px]" onClick={onAdvance} disabled={busy}>
              {advanceLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CockpitDashboard() {
  const navigate = useNavigate();
  const { account, profile } = useCockpitAccount();
  const { candidates, applications, isLoading } = useCockpitCandidates();
  const { advance, reject, isUpdating } = useCockpitActions();
  const { interviews } = useCockpitInterviews();
  const { jobs } = useCockpitJobsData();

  /* Both decisions reach the candidate by email. This is the screen an owner
     skims half-awake, so neither one goes through on a single stray click —
     same confirm, same words, as the Applicants page. */
  const [actionDialog, setActionDialog] = useState<{ type: "pass" | "advance"; cand: Candidate } | null>(null);

  // "Also today" is only worth a section when there is something real in it.
  const nextInterview = interviews.upcoming[0] ?? null;
  const liveJob = jobs.find((j) => j.status === "live") ?? null;

  const now = useMemo(() => new Date(), []);
  const who = greetingName(profile?.full_name, account.name);

  /** The real pipeline status, so Advance moves them one stage — not back to the start. */
  const statusById = useMemo(() => {
    const m: Record<string, string> = {};
    applications.forEach((a) => {
      m[a.id] = (a as { status?: string }).status ?? "";
    });
    return m;
  }, [applications]);
  const statusOf = (id: string) => statusById[id] || undefined;

  const { sealed, passedOver, readCount, hired, stillReading, multiRole } = useMemo(() => {
    // Only people Ava has actually finished get ranked, sealed or counted.
    const analyzed = candidates.filter(isAnalyzed);
    // A decision you have already made is not one waiting on you today, so
    // people who are hired or passed do not belong in the shortlist.
    const live = analyzed.filter((c) => c.stage !== "Rejected" && c.stage !== "Hired");
    const top = [...live].sort((a, b) => b.overall - a.overall).slice(0, 3);
    return {
      sealed: top,
      passedOver: candidates.filter((c) => c.stage === "Rejected").length,
      readCount: analyzed.length,
      hired: candidates.filter((c) => c.stage === "Hired").length,
      stillReading: candidates.filter((c) => !isAnalyzed(c) && c.stage !== "Rejected").length,
      multiRole: new Set(top.map((c) => c.role)).size > 1,
    };
  }, [candidates]);

  const startRole = () => {
    clearDraft();
    sessionStorage.removeItem("ava-create-active");
    navigate("/jobs/create");
  };

  const confirmPass = async (reason?: string) => {
    if (!actionDialog) return;
    await reject(actionDialog.cand.id, reason);
    setActionDialog(null);
  };
  const confirmAdvance = async () => {
    if (!actionDialog) return;
    await advance(actionDialog.cand.id, statusOf(actionDialog.cand.id));
    setActionDialog(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="ck-reveal h-[52px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="ck-card ck-reveal h-[66px]"
              style={{ ["--ck-i" as string]: i, opacity: 0.55 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── The greeting carries the page ─────────────────── */}
      <header className="ck-rise flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1
            className="font-display"
            style={{ fontSize: "clamp(26px, 3.2vw, 38px)", lineHeight: 1.1, color: "var(--hf-text)", fontWeight: 500 }}
          >
            {greeting(now)}{who ? `, ${who}` : ""}.
          </h1>
          <span className="text-[14px]" style={{ color: "var(--hf-text-muted)" }}>
            {format(now, "EEEE, MMM d")}
          </span>
        </div>
        <button className="ck-btn ck-btn-primary !py-2 !text-[13.5px]" onClick={startRole}>
          + New job
        </button>
      </header>

      {candidates.length === 0 ? (
        /* ── Nothing has come in yet. Say so plainly. ─────── */
        <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
          <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Nobody has applied yet.
          </h2>
          <p className="mt-2 max-w-[52ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
            Publish a role and share its link. The moment someone applies, Ava screens them and
            they show up here — already read, already scored.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="ck-btn ck-btn-primary" onClick={startRole}>
              Post your first job
            </button>
            <button className="ck-btn ck-btn-outline" onClick={() => navigate("/jobs")}>
              See your jobs
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* ── What Ava did, in one line. Only once she has read someone. ── */}
          {readCount > 0 && (
            <section
              className="ck-rise flex items-center gap-3 rounded-[10px] px-[15px] py-[11px]"
              style={{
                background: "var(--slab)",
                color: "var(--slab-ink)",
                /* In Night the slab sits ~1.2:1 off the ground — the shadow's inset
                   hairline is the only thing that draws the panel's top edge. */
                boxShadow: "var(--shadow-md)",
                border: "1px solid transparent",
              }}
            >
              <AvaSeal size={26} />
              <p
                className="min-w-0 flex-1 text-[13px] min-[901px]:truncate max-[900px]:line-clamp-2 max-[900px]:text-[12px] max-[900px]:leading-[1.35]"
                style={{ color: "var(--slab-ink-2)" }}
              >
                <span className="font-semibold" style={{ color: "var(--slab-ink)" }}>
                  Ava has been working.
                </span>{" "}
                Read{" "}
                <span className="ck-num font-semibold" style={{ color: "var(--jade-bright)" }}>
                  {readCount}
                </span>{" "}
                {readCount === 1 ? "applicant" : "applicants"}
                {sealed.length > 0 && (
                  <>
                    {" · sealed "}
                    <span className="ck-num font-semibold" style={{ color: "var(--jade-bright)" }}>
                      {sealed.length}
                    </span>
                  </>
                )}
                {" — none of your time, nobody left waiting."}
              </p>
            </section>
          )}

          {/* ── The people worth your time — one tight, ranked list ───────── */}
          {sealed.length > 0 ? (
            <div className="flex flex-col gap-2">
              {sealed.map((c, i) => (
                <SealedRow
                  key={c.id}
                  candidate={c}
                  index={i}
                  showRole={multiRole}
                  advanceLabel={advanceTargetLabel(statusOf(c.id))}
                  busy={isUpdating}
                  onOpen={() => navigate(`/applicants/${c.id}`)}
                  onPass={() => setActionDialog({ type: "pass", cand: c })}
                  onAdvance={() => setActionDialog({ type: "advance", cand: c })}
                />
              ))}
            </div>
          ) : (
            stillReading > 0 && (
              /* Applicants are in, but none are finished. No seal, no number, no rank. */
              <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
                <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                  I&rsquo;m still reading.
                </h2>
                <p className="mt-2 max-w-[52ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
                  {stillReading} {stillReading === 1 ? "person is" : "people are"} in the queue. The moment
                  I finish one, they land here with a score and the evidence behind it.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="ck-btn ck-btn-outline" onClick={() => navigate("/applicants")}>
                    See everyone who applied
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )
          )}

          {passedOver > 0 && (
            <div className="ck-card-flat ck-reveal flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
                <span style={{ color: "var(--hf-text)", fontWeight: 600 }}>
                  {passedOver} didn&rsquo;t make the cut
                </span>{" "}
                — every one already got a polite reply in your name.
              </p>
              <button
                className="text-[13px]"
                style={{ color: "var(--hf-gold)" }}
                onClick={() => navigate("/applicants")}
              >
                Review them →
              </button>
            </div>
          )}

          {/* ── Also today — real items only, never filler ──── */}
          {(nextInterview || liveJob) && (
            <section>
              <h2
                className="font-display mb-2 text-[16px]"
                style={{ color: "var(--hf-text)", fontWeight: 500 }}
              >
                Also today
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {nextInterview && (
                  <div className="ck-card ck-reveal flex flex-wrap items-center gap-3 p-4">
                    <CalendarDays className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--hf-gold)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
                        {nextInterview.time} — {nextInterview.name}
                      </p>
                      <p className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>
                        {nextInterview.role} · the slot is held — confirm it
                      </p>
                    </div>
                    <button
                      className="ck-btn ck-btn-primary !py-2 !text-[13px]"
                      onClick={() => navigate("/interviews")}
                    >
                      Confirm
                    </button>
                  </div>
                )}
                {liveJob && (
                  <button
                    className="ck-card ck-reveal flex items-center gap-3 p-4 text-left"
                    onClick={() => navigate("/jobs")}
                  >
                    <Briefcase className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--hf-gold)" }} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
                        {liveJob.title} is live
                      </span>
                      <span className="block text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>
                        {liveJob.applicants} applied · {liveJob.dateLabel.toLowerCase()} {liveJob.date}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}

          {/* ── The record, only when there is one ─────────── */}
          {hired > 0 && (
            <div className="ck-card-flat flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
                <span style={{ color: "var(--hf-text)", fontWeight: 600 }}>Your record:</span>{" "}
                {hired} {hired === 1 ? "hire" : "hires"} made through HireFlow.
              </p>
              <button
                className="text-[13px]"
                style={{ color: "var(--hf-gold)" }}
                onClick={() => navigate("/analytics")}
              >
                See analytics →
              </button>
            </div>
          )}
        </>
      )}

      {actionDialog?.type === "advance" && (() => {
        const cand = actionDialog.cand;
        const label = advanceTargetLabel(statusOf(cand.id));
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
        open={actionDialog?.type === "pass"}
        title={
          actionDialog
            ? statusOf(actionDialog.cand.id) === "offered"
              ? `Decline offer to ${actionDialog.cand.name}?`
              : `Pass on ${actionDialog.cand.name}?`
            : ""
        }
        description={
          actionDialog && statusOf(actionDialog.cand.id) === "offered"
            ? "This withdraws the offer and notifies the candidate. Add a short note for your records (optional)."
            : "This removes the candidate from your active pipeline and notifies them. Add a short note for your records (optional)."
        }
        confirmLabel={actionDialog && statusOf(actionDialog.cand.id) === "offered" ? "Decline offer" : "Pass candidate"}
        tone="danger"
        busy={isUpdating}
        withReason
        reasonLabel="Reason (optional, private to you)"
        reasonPlaceholder="e.g. Strong, but went with someone with more weekend availability."
        onConfirm={(reason) => void confirmPass(reason)}
        onClose={() => setActionDialog(null)}
      />
    </div>
  );
}
