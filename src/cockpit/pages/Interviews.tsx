import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, format, isSameDay, isToday, startOfDay, startOfWeek } from "date-fns";
import { AlertCircle, HelpCircle, ShieldCheck, Video, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import AvaSeal from "@/components/ava/AvaSeal";
import { EmployerRescheduleReviewDialog } from "@/components/EmployerRescheduleReviewDialog";
import { useInterviews, useUpdateInterview, type InterviewWithDetails } from "@/hooks/useInterviews";
import { supabase } from "@/integrations/supabase/client";
import { notifyInterviewCancelled } from "@/utils/emailNotifications";
import CkAvatar from "../components/Avatar";
import { ActionDialog } from "../components/ActionDialog";
import { PageHeader } from "../components/PageHeader";
import { useCockpitCandidates, useCockpitInterviews } from "../hooks/useCockpitData";
import type { CandidateStage } from "../data";

/**
 * Scheduling v2 (employer_windows / meeting_provider / meeting_room_*) landed
 * on the live table just ahead of the generated Supabase types — read it off
 * the row with a narrow local shape rather than waiting on a regen.
 */
interface SchedulingV2Row {
  employer_windows: unknown;
  meeting_provider: string | null;
  meeting_room_url: string | null;
}

/**
 * The week ahead.
 *
 * Five weekday cards so you can see the shape of the week at a glance, the
 * held times underneath with the one that needs your call first, the brief for
 * whoever you are meeting next, and the record of who you have already sat
 * with. Nothing here is projected: a day is only marked if a real interview
 * sits on it.
 */

/** Real wax never sits square. A stable per-row tilt, so it does not jitter on re-render. */
const TILTS = [-6, 4, -3, 5, -4];

/** Monday-first, because nobody schedules an interview on a Sunday. */
const WEEK_OPTS = { weekStartsOn: 1 as const };

type Response = "confirmed" | "reschedule_requested" | "awaiting_pick" | "pending";

interface Session {
  id: string;
  /** Application id — the key the applicant record is keyed by. Null in the showcase dataset. */
  applicationId: string | null;
  /** Candidate's user id — needed to address a notification to them. Null in the showcase dataset. */
  candidateId: string | null;
  name: string;
  role: string;
  /** Real timestamp. Null only when the source has no dated row to offer. */
  at: Date | null;
  /** Stand-in label for a session with no real timestamp. */
  timeLabel: string;
  status: string;
  response: Response;
  minutes: number | null;
  type: string | null;
  /** The questions Ava prepared for this conversation. */
  questions: string[];
  candidateNote: string | null;
  proposedTimes: Array<{ datetime: string }>;
  /** How many windows the employer offered when handing the pick to the candidate. */
  windowsOffered: number;
  /** 'daily' -> an in-app call room; anything else with a link is a legacy external meeting_link. */
  meetingProvider: string | null;
  meetingLink: string | null;
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || full;
}

/** The wizard writes "video" | "phone" | "in-person"; older rows use "in_person" / "voice". */
function typeLabel(type: string | null) {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === "in-person" || t === "in_person") return "in person";
  if (t === "video") return "video call";
  if (t === "phone") return "phone call";
  if (t === "voice") return "voice screen";
  return t.replace(/[-_]/g, " ");
}

function readResponse(value: string | null): Response {
  if (value === "confirmed") return "confirmed";
  if (value === "reschedule_requested") return "reschedule_requested";
  if (value === "awaiting_pick") return "awaiting_pick";
  return "pending";
}

function fromRow(row: InterviewWithDetails): Session {
  const profile = row.applications?.profiles;
  const raw = Array.isArray(row.proposed_times)
    ? (row.proposed_times as unknown as Array<{ datetime?: string }>)
    : [];
  const v2 = row as unknown as SchedulingV2Row;
  const windows = Array.isArray(v2.employer_windows) ? v2.employer_windows : [];
  return {
    id: row.id,
    applicationId: row.applications?.id ?? null,
    candidateId: row.applications?.candidate_id ?? null,
    name: profile?.full_name ?? profile?.email ?? "Candidate",
    role: row.applications?.jobs?.title ?? "Role",
    at: new Date(row.scheduled_at),
    timeLabel: "",
    status: row.status,
    response: readResponse(row.candidate_response),
    minutes: row.duration_minutes,
    type: row.interview_type,
    questions: (row.ai_questions ?? []).filter((q) => !!q?.trim()),
    candidateNote: row.candidate_note,
    proposedTimes: raw
      .filter((t) => !!t?.datetime)
      .map((t) => ({ datetime: t.datetime as string })),
    windowsOffered: windows.length,
    meetingProvider: v2.meeting_provider ?? null,
    // The room route resolves the Daily room from the interview id itself; this
    // is only for the legacy path, where the link the wizard saved is the join.
    meetingLink: row.meeting_link ?? null,
  };
}

function Chip({ tone, children }: { tone: "live" | "amber" | "mut"; children: ReactNode }) {
  const skin =
    tone === "live"
      ? { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }
      : tone === "amber"
        ? { background: "var(--amber-bg)", color: "var(--amber-fg)" }
        : { background: "var(--surface-2)", color: "var(--ink-2)" };
  return (
    <span
      className="shrink-0 rounded-[5px] px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
      style={skin}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="font-display mb-2 text-[16px] leading-[1.15]"
      style={{ color: "var(--ink)", fontWeight: 600 }}
    >
      {children}
    </h2>
  );
}

/** One line of Ava's brief: an icon, a bolded label, and the fact itself. */
function Evidence({
  icon: Icon,
  tone,
  label,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
      <Icon className="mt-[2px] h-3.5 w-3.5 shrink-0" style={{ color: tone }} aria-hidden />
      <span>
        <b style={{ color: "var(--ink)", fontWeight: 600 }}>{label}</b> {children}
      </span>
    </li>
  );
}

export default function CockpitInterviews() {
  const navigate = useNavigate();
  const { interviews, isLoading } = useCockpitInterviews();
  const { data: rows = [] } = useInterviews();
  const { candidates } = useCockpitCandidates();
  const [reviewing, setReviewing] = useState<Session | null>(null);
  const [cancelling, setCancelling] = useState<Session | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const updateInterview = useUpdateInterview();

  const today = useMemo(() => startOfDay(new Date()), []);
  /* A 30s clock, just to re-check the 15-minutes-out join window without a
     hard reload — nothing else on the page depends on it. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* Real rows carry dates, notes and Ava's questions. The cockpit hook is the
     fallback for the showcase dataset, which has times but no timestamps. */
  const sessions = useMemo<Session[]>(() => {
    if (rows.length > 0) {
      return rows
        .map(fromRow)
        .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
    }
    const fallback: Session[] = [];
    interviews.upcoming.forEach((it) => {
      fallback.push({
        id: it.id,
        applicationId: it.id,
        candidateId: null,
        name: it.name,
        role: it.role,
        at: null,
        timeLabel: it.time,
        status: it.kind === "voice-completed" ? "completed" : "scheduled",
        response: "pending",
        minutes: null,
        type: it.kind === "in-person-confirmed" ? "in-person" : "voice",
        questions: [],
        candidateNote: null,
        proposedTimes: [],
        windowsOffered: 0,
        meetingProvider: null,
        meetingLink: null,
      });
    });
    return fallback;
  }, [rows, interviews.upcoming]);

  /* News, once: the first time a row renders as confirmed, it reads as "Name
     picked <time>" instead of the usual meta line. Remembered per interview in
     localStorage so a reload or a later visit does not replay it. */
  const [justPicked, setJustPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    let changed = false;
    const next = new Set<string>();
    sessions.forEach((s) => {
      if (s.response !== "confirmed") return;
      const key = `ck-interview-picked:${s.id}`;
      try {
        if (!window.localStorage.getItem(key)) {
          next.add(s.id);
          window.localStorage.setItem(key, "1");
          changed = true;
        }
      } catch {
        // Private mode / storage blocked — the row just never gets the "picked" treatment.
      }
    });
    if (changed) setJustPicked((prev) => new Set([...prev, ...next]));
  }, [sessions]);

  const upcoming = useMemo(
    () => sessions.filter((s) => s.status === "scheduled" && (!s.at || s.at >= today)),
    [sessions, today],
  );

  const completed = useMemo(
    () =>
      sessions
        .filter((s) => s.status === "completed" || s.status === "no_show")
        .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
        .slice(0, 4),
    [sessions],
  );

  /* A 'scheduled' row whose day has already passed — the candidate never
     picked, or nobody marked what happened — falls out of both `upcoming`
     (>= today) and `completed` (needs a completed/no_show status). Without
     this it just vanishes; surface it instead so it gets resolved. */
  const overdue = useMemo(
    () =>
      sessions
        .filter((s) => s.status === "scheduled" && s.at && s.at < today)
        .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)),
    [sessions, today],
  );

  const noShows = useMemo(() => sessions.filter((s) => s.status === "no_show").length, [sessions]);
  const needsCall = useMemo(
    () => upcoming.filter((s) => s.response === "reschedule_requested").length,
    [upcoming],
  );

  /* Outcomes live on the application, not the interview — so the record below
     says what actually happened rather than guessing from the interview alone. */
  const stageByApplication = useMemo(() => {
    const map = new Map<string, CandidateStage>();
    candidates.forEach((c) => map.set(c.id, c.stage));
    return map;
  }, [candidates]);

  /* The strip follows the work: this week, unless everything sits further out. */
  const dated = useMemo(() => sessions.filter((s) => s.at && s.status === "scheduled"), [sessions]);
  const thisWeek = useMemo(() => startOfWeek(today, WEEK_OPTS), [today]);
  const weekStart = useMemo(() => {
    const firstUpcoming = upcoming.find((s) => s.at)?.at;
    if (firstUpcoming && firstUpcoming >= addDays(thisWeek, 7)) return startOfWeek(firstUpcoming, WEEK_OPTS);
    return thisWeek;
  }, [upcoming, thisWeek]);
  const weekDays = useMemo(() => [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i)), [weekStart]);

  const next = upcoming[0] ?? null;

  const openRecord = (s: Session) =>
    navigate(s.applicationId ? `/applicants/${s.applicationId}` : "/applicants");

  const canJoinDaily = (s: Session) =>
    s.response === "confirmed" && s.meetingProvider === "daily" && !!s.at && s.at.getTime() - now <= 15 * 60 * 1000;

  const confirmCancel = async () => {
    if (!cancelling) return;
    const target = cancelling;
    setIsCancelling(true);
    try {
      await updateInterview.mutateAsync({ id: target.id, status: "cancelled" });

      if (target.candidateId) {
        const { error: notifyErr } = await supabase.from("notifications").insert({
          user_id: target.candidateId,
          type: "interview",
          title: "Interview Cancelled",
          message: `Your interview for ${target.role} has been cancelled.`,
          link: `/applications`,
        });
        if (notifyErr) console.error("Could not notify candidate of cancellation:", notifyErr);

        try {
          await notifyInterviewCancelled(
            target.candidateId,
            target.role,
            target.at ? format(target.at, "EEEE, MMMM d, yyyy 'at' h:mm a") : undefined,
          );
        } catch (emailErr) {
          console.error("Failed to send cancellation email:", emailErr);
        }
      }

      toast.success(`Cancelled — ${firstName(target.name)} will be told right away.`);
      setCancelling(null);
    } catch (err) {
      console.error("Error cancelling interview:", err);
      toast.error("Could not cancel that interview");
    } finally {
      setIsCancelling(false);
    }
  };

  /* For an overdue row: the employer says what actually happened rather
     than letting it sit unresolved. */
  const markOutcome = async (target: Session, status: "completed" | "no_show") => {
    setMarkingId(target.id);
    try {
      await updateInterview.mutateAsync({ id: target.id, status });
      toast.success(
        status === "no_show"
          ? `Marked as no-show — ${firstName(target.name)}`
          : `Marked completed — ${firstName(target.name)}`,
      );
    } catch (err) {
      console.error("Error marking interview outcome:", err);
      toast.error("Could not update that interview");
    } finally {
      setMarkingId(null);
    }
  };

  const subtitle =
    needsCall > 0
      ? `${needsCall} ${needsCall === 1 ? "time needs" : "times need"} your call — I have the rest handled.`
      : upcoming.length > 0
        ? `${upcoming.length} coming up. Everyone gets the date and time from me the moment it is booked.`
        : "Nothing on the books yet.";

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="ck-reveal h-[52px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        {/* Below 760px the loaded week is a scrollable strip of 132px cards, so
            the skeleton that stands in for it must be too — otherwise every
            visit opens on five squeezed slivers that then jump into place. */}
        <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="ck-reveal h-[62px] w-[132px] shrink-0 md:w-auto md:shrink"
              style={{ ["--ck-i" as string]: i, background: "var(--hf-surface)", borderRadius: 10, opacity: 0.55 }}
            />
          ))}
        </div>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="ck-card ck-reveal h-[76px]"
            style={{ ["--ck-i" as string]: i, opacity: 0.55 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Interviews"
        subtitle={subtitle}
        actions={
          candidates.length > 0 ? (
            /* Going to the applicant list is navigation, not a decision. Jade is
               spent on the one control that needs the owner — "Review times" on
               a reschedule request — so this stays quiet, and at the one button
               size the rest of the page uses. */
            <button className="ck-btn ck-btn-outline !py-2" onClick={() => navigate("/applicants")}>
              Schedule an interview
            </button>
          ) : undefined
        }
      />

      {upcoming.length === 0 && completed.length === 0 && overdue.length === 0 ? (
        /* ── Nobody is on the calendar. Say so, and point at the one move. ── */
        <section className="ck-card ck-reveal p-6 md:p-8">
          <h2 className="font-display text-[20px]" style={{ color: "var(--ink)", fontWeight: 500 }}>
            {candidates.length === 0 ? "Nobody to meet yet." : "Nothing on the calendar yet."}
          </h2>
          <p className="mt-2 max-w-[52ch] text-[14px]" style={{ color: "var(--ink-2)" }}>
            {candidates.length === 0
              ? "Publish a role and share its link. I read everyone who applies, and the moment you want to meet one of them the time lands here."
              : "Open the record of anyone worth an hour and pick a time. I send them the date and the place, and hold your slot until they answer."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {candidates.length === 0 ? (
              <button className="ck-btn ck-btn-primary" onClick={() => navigate("/jobs")}>
                See your jobs
              </button>
            ) : (
              <button className="ck-btn ck-btn-primary" onClick={() => navigate("/applicants")}>
                See who applied
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* ── The week at a glance ──────────────────────────── */}
          {dated.length > 0 && (
            <section>
              {!isSameDay(weekStart, thisWeek) && (
                <div
                  className="mb-2 text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
                  style={{ color: "var(--ink-3)" }}
                >
                  Week of {format(weekStart, "MMM d")}
                </div>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
                {weekDays.map((day, i) => {
                  const slots = dated.filter((s) => s.at && isSameDay(s.at, day));
                  const held = slots.some((s) => s.response === "reschedule_requested");
                  return (
                    <div
                      key={day.toISOString()}
                      className="ck-reveal w-[132px] shrink-0 md:w-auto md:shrink"
                      style={{
                        ["--ck-i" as string]: i,
                        background: "var(--surface)",
                        border: `1px solid ${held ? "var(--brass-line)" : "var(--line-soft)"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        minHeight: 62,
                        boxShadow: held ? "var(--shadow-md)" : "var(--shadow-sm)",
                      }}
                    >
                      <div
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        {format(day, "EEE d")}
                        {isToday(day) && (
                          <>
                            <span>&middot; today</span>
                            <span
                              className="h-[5px] w-[5px] rounded-full"
                              style={{ background: "var(--jade)" }}
                              aria-hidden
                            />
                          </>
                        )}
                      </div>
                      {slots.length === 0 ? (
                        <div className="mt-[7px] text-[11px]" style={{ color: "var(--ink-3)" }}>
                          Nothing booked
                        </div>
                      ) : (
                        slots.map((s) => {
                          const confirm = s.response === "reschedule_requested";
                          const awaitingPick = s.response === "awaiting_pick";
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => openRecord(s)}
                              className="mt-[7px] block w-full px-2 py-[5px] text-left text-[11px] font-semibold leading-[1.35]"
                              style={{
                                borderRadius: 6,
                                background: confirm ? "var(--amber-bg)" : awaitingPick ? "var(--surface-2)" : "var(--jade-soft)",
                                color: confirm ? "var(--amber-fg)" : awaitingPick ? "var(--ink-2)" : "var(--jade-soft-fg)",
                              }}
                            >
                              {format(s.at as Date, "h:mm aaa")} &middot; {firstName(s.name)}
                              {confirm ? " · confirm" : ""}
                              {/* awaiting_pick shows the earliest offered window as a
                                  placeholder — the candidate has not chosen yet, so say
                                  so quietly rather than let it read as a confirmed time. */}
                              {awaitingPick ? " · picks soon" : ""}
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── The times themselves ──────────────────────────── */}
          {upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.map((s, i) => {
                const confirm = s.response === "reschedule_requested";
                const awaitingPick = s.response === "awaiting_pick";
                const picked = s.response === "confirmed" && justPicked.has(s.id);
                const joinable = canJoinDaily(s);
                /* The chip beside the name already carries the state, so the
                   line under it says what happens next instead of saying the
                   same word twice. A confirmed time needs nothing further from
                   me, and nothing here promises a reminder we do not send — the
                   only mail that goes out is the one at booking. */
                const meta = picked
                  ? `${firstName(s.name)} picked ${s.at ? format(s.at, "EEE h:mm aaa") : ""}`
                  : [
                      s.minutes ? `${s.minutes} min` : null,
                      typeLabel(s.type),
                      confirm
                        ? "they asked for a different time — your slot is still held"
                        : awaitingPick
                          ? `${s.windowsOffered} ${s.windowsOffered === 1 ? "time" : "times"} offered`
                          : s.response === "pending"
                            ? "I sent them the time by email"
                            : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");

                return (
                  <div
                    key={s.id}
                    className="ck-card ck-reveal flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3"
                    style={{ ["--ck-i" as string]: i, borderRadius: 10 }}
                  >
                    <div className="min-w-[104px] shrink-0">
                      <div
                        className="text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
                        style={{ color: "var(--brass)" }}
                      >
                        {s.at ? format(s.at, "EEE d") : "Next"}
                      </div>
                      <div
                        className="font-display tnum mt-[3px] whitespace-nowrap leading-none"
                        style={{ fontSize: 28, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}
                      >
                        {s.at ? format(s.at, "h:mm aaa") : s.timeLabel}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openRecord(s)}
                      className="flex min-w-0 flex-1 basis-full items-center gap-3.5 text-left sm:basis-0"
                    >
                      <span className="relative shrink-0">
                        <CkAvatar who={s.name} size={40} />
                        <span
                          className="ck-seal absolute"
                          style={{ right: -8, bottom: -8, transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}
                        >
                          <AvaSeal size={22} />
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className="truncate text-[14px] font-semibold leading-[1.3]"
                            style={{ color: "var(--ink)" }}
                          >
                            {s.name}
                          </span>
                          {confirm ? (
                            <Chip tone="amber">Needs confirm</Chip>
                          ) : s.response === "confirmed" ? (
                            <Chip tone="live">Confirmed</Chip>
                          ) : awaitingPick ? (
                            <Chip tone="mut">Awaiting pick</Chip>
                          ) : (
                            <Chip tone="mut">Awaiting reply</Chip>
                          )}
                        </span>
                        <span
                          className="mt-0.5 block text-[12px] leading-[1.35]"
                          style={picked ? { color: "var(--jade-soft-fg)", fontWeight: 600 } : { color: "var(--ink-3)" }}
                        >
                          {/* A confirmed row with no duration or type on it
                              leaves meta empty — the role must not trail a
                              separator into nothing. */}
                          {picked ? meta : meta ? `${s.role} · ${meta}` : s.role}
                        </span>
                      </span>
                    </button>

                    <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                      <button className="ck-btn ck-btn-outline !py-2 !text-[12px]" onClick={() => openRecord(s)}>
                        Details
                      </button>
                      {confirm && (
                        <button className="ck-btn ck-btn-primary !py-2 !text-[12px]" onClick={() => setReviewing(s)}>
                          Review times
                        </button>
                      )}
                      {s.response === "confirmed" && s.meetingProvider === "daily" && (
                        <button
                          className="ck-btn ck-btn-primary !py-2 !text-[12px]"
                          disabled={!joinable}
                          title={joinable ? undefined : "Opens 15 minutes before the start time"}
                          onClick={() => navigate(`/interviews/${s.id}/room`)}
                        >
                          <Video className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                          Join interview
                        </button>
                      )}
                      {s.response === "confirmed" && s.meetingProvider !== "daily" && s.meetingLink && (
                        <a
                          className="ck-btn ck-btn-primary !py-2 !text-[12px]"
                          href={s.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Video className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                          Join interview
                        </a>
                      )}
                      {/* Quiet on purpose — this is the one irreversible move on the page. */}
                      <button
                        className="ck-btn ck-btn-ghost !py-2 !text-[12px]"
                        style={{ color: "var(--ink-3)" }}
                        onClick={() => setCancelling(s)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
              Nothing coming up &mdash; everyone you have already met is below.
            </p>
          )}

          {/* ── Needs attention: the day came and went with nobody saying what
                happened — a no-show never marked, or a pick that never came. ── */}
          {overdue.length > 0 && (
            <section className="space-y-2">
              <SectionTitle>Needs attention</SectionTitle>
              {overdue.map((s, i) => (
                <div
                  key={s.id}
                  className="ck-card ck-reveal flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3"
                  style={{ ["--ck-i" as string]: i, borderRadius: 10 }}
                >
                  <div className="min-w-[104px] shrink-0">
                    <div
                      className="text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
                      style={{ color: "var(--amber-fg)" }}
                    >
                      {s.at ? format(s.at, "EEE d") : "Past"}
                    </div>
                    <div
                      className="font-display tnum mt-[3px] whitespace-nowrap leading-none"
                      style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}
                    >
                      {s.at ? format(s.at, "h:mm aaa") : s.timeLabel}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openRecord(s)}
                    className="flex min-w-0 flex-1 basis-full items-center gap-3.5 text-left sm:basis-0"
                  >
                    <CkAvatar who={s.name} size={40} />
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className="truncate text-[14px] font-semibold leading-[1.3]"
                          style={{ color: "var(--ink)" }}
                        >
                          {s.name}
                        </span>
                        <Chip tone="amber">Time passed</Chip>
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-[1.35]" style={{ color: "var(--ink-3)" }}>
                        {s.role} · time passed — mark what happened
                      </span>
                    </span>
                  </button>

                  <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                    <button className="ck-btn ck-btn-outline !py-2 !text-[12px]" onClick={() => openRecord(s)}>
                      Details
                    </button>
                    <button
                      className="ck-btn ck-btn-outline !py-2 !text-[12px]"
                      disabled={markingId === s.id}
                      onClick={() => void markOutcome(s, "completed")}
                    >
                      Mark completed
                    </button>
                    <button
                      className="ck-btn ck-btn-outline !py-2 !text-[12px]"
                      disabled={markingId === s.id}
                      onClick={() => void markOutcome(s, "no_show")}
                    >
                      No-show
                    </button>
                    {/* Quiet on purpose — this is the one irreversible move on the page. */}
                    <button
                      className="ck-btn ck-btn-ghost !py-2 !text-[12px]"
                      style={{ color: "var(--ink-3)" }}
                      onClick={() => setCancelling(s)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ── The brief, and the record ─────────────────────── */}
          <div className={next && completed.length > 0 ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
            {next && (
              <section>
                <SectionTitle>
                  {firstName(next.name)}&rsquo;s brief
                  {next.at ? (isToday(next.at) ? " — ready for today" : ` — ready for ${format(next.at, "EEEE")}`) : ""}
                </SectionTitle>
                <div
                  className="ck-card relative"
                  style={{ padding: "14px 18px" }}
                >
                  {/* the brass hairline the read cards are sealed with */}
                  <span
                    className="pointer-events-none absolute"
                    style={{ top: 9, left: 20, right: 20, height: 2, background: "var(--brass-line)", borderRadius: 1 }}
                    aria-hidden
                  />
                  <ul className="mt-1.5 flex flex-col gap-2">
                    <Evidence icon={ShieldCheck} tone="var(--brass)" label="Set for:">
                      {next.at ? format(next.at, "EEEE d MMM 'at' h:mm aaa") : next.timeLabel}
                      {next.minutes ? ` · ${next.minutes} min` : ""}
                      {typeLabel(next.type) ? ` · ${typeLabel(next.type)}` : ""}
                    </Evidence>
                    {next.questions.slice(0, 3).map((q, qi) => (
                      <Evidence key={qi} icon={HelpCircle} tone="var(--ink-3)" label="Ask:">
                        {q}
                      </Evidence>
                    ))}
                    {next.candidateNote && (
                      <Evidence icon={AlertCircle} tone="var(--amber-fg)" label="Their note:">
                        &ldquo;{next.candidateNote}&rdquo;
                      </Evidence>
                    )}
                    {next.at && next.response === "pending" && (
                      <Evidence icon={AlertCircle} tone="var(--amber-fg)" label="Not confirmed yet:">
                        I am still waiting on them to say yes to this time.
                      </Evidence>
                    )}
                  </ul>
                  <div style={{ height: 1, background: "var(--line-soft)", margin: "13px 0 11px" }} />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                      Everything I have on them sits on their record.
                    </span>
                    <button
                      className="ml-auto text-[12px] font-semibold"
                      style={{ color: "var(--brass)" }}
                      onClick={() => openRecord(next)}
                    >
                      Open their full read &rarr;
                    </button>
                  </div>
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <SectionTitle>Recently completed</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  {completed.map((s) => {
                    const stage = s.applicationId ? stageByApplication.get(s.applicationId) : undefined;
                    const meta = [s.role, typeLabel(s.type), s.status === "no_show" ? "they did not show" : null]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openRecord(s)}
                        className="ck-card flex w-full items-center gap-3.5 px-4 py-3 text-left"
                        style={{ borderRadius: 10 }}
                      >
                        <span
                          className="min-w-[70px] shrink-0 whitespace-nowrap text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
                          style={{ color: "var(--brass)" }}
                        >
                          {s.at ? format(s.at, "MMM d") : "Done"}
                        </span>
                        <CkAvatar who={s.name} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className="truncate text-[14px] font-semibold leading-[1.3]"
                              style={{ color: "var(--ink)" }}
                            >
                              {s.name}
                            </span>
                            {s.status === "no_show" ? (
                              <Chip tone="mut">No-show</Chip>
                            ) : stage === "Hired" ? (
                              <Chip tone="live">Hired</Chip>
                            ) : stage === "Rejected" ? (
                              <Chip tone="mut">Passed</Chip>
                            ) : (
                              <Chip tone="mut">Interviewed</Chip>
                            )}
                          </span>
                          <span
                            className="mt-0.5 block truncate text-[12px] leading-[1.35]"
                            style={{ color: "var(--ink-3)" }}
                          >
                            {meta}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div
                  className="mt-2 flex items-center gap-2.5 px-4 py-3 text-[12px]"
                  style={{ border: "1px dashed var(--line)", borderRadius: 10, color: "var(--ink-3)" }}
                >
                  <span>
                    <b style={{ color: "var(--ink-2)" }}>
                      No-shows so far: {noShows}.
                    </b>{" "}
                    Everyone gets the date and time by email the moment it is booked.
                  </span>
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {/* The candidate proposed other times; this is where you take the call. */}
      {reviewing && (
        <EmployerRescheduleReviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setReviewing(null);
          }}
          interviewId={reviewing.id}
          applicationId={reviewing.applicationId ?? ""}
          currentScheduledAt={reviewing.at ? reviewing.at.toISOString() : ""}
          proposedTimes={reviewing.proposedTimes}
          candidateNote={reviewing.candidateNote}
          onMessageCandidate={() => navigate("/messages")}
        />
      )}

      <ActionDialog
        open={!!cancelling}
        title={cancelling ? `Cancel the interview with ${firstName(cancelling.name)}?` : ""}
        description={
          cancelling
            ? `${firstName(cancelling.name)} will be told politely right away.`
            : ""
        }
        confirmLabel="Cancel interview"
        tone="danger"
        busy={isCancelling}
        onConfirm={() => void confirmCancel()}
        onClose={() => !isCancelling && setCancelling(null)}
      />
    </div>
  );
}
