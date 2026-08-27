import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight, CalendarDays, Briefcase } from "lucide-react";
import { clearDraft } from "@/lib/avaEngine/draft";
import AvaSeal from "@/components/ava/AvaSeal";
import CkAvatar from "../components/Avatar";
import {
  useCockpitAccount,
  useCockpitCandidates,
  useCockpitActions,
  useCockpitInterviews,
  useCockpitJobsData,
} from "../hooks/useCockpitData";

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

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || full;
}

function SealedRow({
  candidate,
  index,
  onPass,
  onInterview,
  onOpen,
  busy,
}: {
  candidate: ReturnType<typeof useCockpitCandidates>["candidates"][number];
  index: number;
  onPass: () => void;
  onInterview: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  return (
    <div className="ck-card ck-reveal p-4 md:p-5" style={{ ["--ck-i" as string]: 2 + index }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* who */}
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left md:flex-none md:basis-[210px]"
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
              className="block truncate text-[15px] font-semibold"
              style={{ color: "var(--hf-text)" }}
            >
              {candidate.name}
            </span>
            <span className="block truncate text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
              {candidate.role}
            </span>
          </span>
        </button>

        {/* why — Ava's evidence. Never truncate the meaning; the mapper caps the length. */}
        <p
          className="order-3 min-w-0 flex-1 basis-full text-[14px] leading-snug md:order-none md:basis-0"
          style={{
            color: "var(--hf-text-soft)",
            borderLeft: "2px solid var(--hf-gold-border)",
            paddingLeft: 14,
          }}
        >
          {candidate.read}
        </p>

        {/* the score */}
        <div className="shrink-0 text-center">
          <div
            className="font-display leading-none"
            style={{ fontSize: 34, fontWeight: 600, color: "var(--hf-text)" }}
          >
            {candidate.overall}
          </div>
          <div
            className="mt-1 text-[10px] tracking-[0.14em]"
            style={{ color: "var(--hf-text-muted)" }}
          >
            SEALED
          </div>
        </div>

        {/* the only two decisions */}
        <div className="flex shrink-0 items-center gap-2">
          <button className="ck-btn ck-btn-outline !py-2 !text-[13px]" onClick={onPass} disabled={busy}>
            Pass
          </button>
          <button className="ck-btn ck-btn-primary !py-2 !text-[13px]" onClick={onInterview} disabled={busy}>
            Interview
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CockpitDashboard() {
  const navigate = useNavigate();
  const { account, profile } = useCockpitAccount();
  const { candidates, isLoading } = useCockpitCandidates();
  const { advance, pass, isUpdating } = useCockpitActions();
  const { interviews } = useCockpitInterviews();
  const { jobs } = useCockpitJobsData();

  // "Also today" is only worth a section when there is something real in it.
  const nextInterview = interviews.upcoming[0] ?? null;
  const liveJob = jobs.find((j) => j.status === "live") ?? null;

  const now = useMemo(() => new Date(), []);
  const who = firstName(profile?.full_name?.trim() || account.name);

  const { sealed, passedOver, readCount, hired } = useMemo(() => {
    const live = candidates.filter((c) => c.stage !== "Rejected");
    const ranked = [...live].sort((a, b) => b.overall - a.overall);
    return {
      sealed: ranked.slice(0, 3),
      passedOver: candidates.filter((c) => c.stage === "Rejected").length,
      readCount: candidates.length,
      hired: candidates.filter((c) => c.stage === "Hired").length,
    };
  }, [candidates]);

  const startRole = () => {
    clearDraft();
    sessionStorage.removeItem("ava-create-active");
    navigate("/jobs/create");
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="ck-reveal h-[52px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="ck-card ck-reveal h-[92px]"
            style={{ ["--ck-i" as string]: i, opacity: 0.55 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* ── The greeting carries the page ─────────────────── */}
      <header className="ck-rise flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1
            className="font-display"
            style={{ fontSize: "clamp(26px, 3.2vw, 38px)", lineHeight: 1.1, color: "var(--hf-text)", fontWeight: 500 }}
          >
            {greeting(now)}, {who}.
          </h1>
          <span className="text-[14px]" style={{ color: "var(--hf-text-muted)" }}>
            {format(now, "EEEE, MMM d")}
          </span>
        </div>
        <button className="ck-btn ck-btn-primary !py-2 !text-[13.5px]" onClick={startRole}>
          + New job
        </button>
      </header>

      {readCount === 0 ? (
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
          {/* ── What Ava did, in one line ──────────────────── */}
          <section
            className="ck-rise flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "var(--slab)", color: "var(--slab-ink)" }}
          >
            <AvaSeal size={26} />
            <p className="min-w-0 text-[14px] leading-snug">
              <span style={{ fontWeight: 600 }}>Ava has been working.</span>{" "}
              Read {readCount} {readCount === 1 ? "applicant" : "applicants"}
              {sealed.length > 0 ? ` · sealed ${sealed.length}` : ""} — none of your time, nobody
              left waiting.
            </p>
          </section>

          {/* ── The people worth your time ─────────────────── */}
          {sealed.map((c, i) => (
            <SealedRow
              key={c.id}
              candidate={c}
              index={i}
              busy={isUpdating}
              onOpen={() => navigate(`/applicants/${c.id}`)}
              onPass={() => pass(c.id)}
              onInterview={() => advance(c.id, undefined)}
            />
          ))}

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
                className="font-display mb-3 text-[19px]"
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
    </div>
  );
}
