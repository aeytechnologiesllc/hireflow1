import { Suspense, lazy, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useApplicantList } from "../../hooks/useApplicantList";
import type { ApplicantListRow } from "../../lib/applicantList";
import {
  alertsWords,
  firstHireStage,
  guideSteps,
  type FirstHireStage,
  type GuideApplicant,
  type GuideJob,
} from "../../lib/firstHireStage";
import type { Candidate, JobRow } from "../../data";
import { applyLinkFor } from "../ShareJobCard";
import { StepColumn, StepStrip, type StepView } from "./GuideStepper";
import { AlertsRow, ApplyingStage, PostStage, ReadyStage, ShareStage } from "./GuideStages";
import type { GuideNotifications } from "./types";

// The Share Kit (QR code, flyer) is fetched when it is opened, not with the dashboard.
const ShareKitDialog = lazy(() => import("../ShareKitDialog").then((m) => ({ default: m.ShareKitDialog })));

/**
 * "Your first hire" (the owner, 2026-10-21): one card at the top of the
 * dashboard that moves with the business. The stage is worked out from real
 * data by src/cockpit/lib/firstHireStage.ts and never from a click, so every
 * visit shows the next step by itself. The dashboard mounts it for an owner
 * until a decision has been made on someone, and hides everything else that
 * is not yet worth the room.
 *
 * A letterhead card: the surface, a brass rule across the top, the headline
 * in Fraunces. Wide: the steps on one line, the current step's words under
 * it. A phone: the steps stacked, the current one open.
 */

export type ActiveStage = Exclude<FirstHireStage, { stage: "done" }>;

export interface FirstHireGuideProps {
  /** The stage the dashboard read cheaply from the applications it already has. */
  light: ActiveStage;
  jobs: JobRow[];
  candidates: Candidate[];
  onPostJob: () => void;
  /** Phone alerts (useGuideNotifications). Absent or "unsupported": no such step. */
  notifications?: GuideNotifications;
}

const toGuideJob = (j: JobRow): GuideJob => ({ id: j.id, title: j.title, status: j.status });

/** An applicant list row, as the stage rules read one. */
function toGuideApplicant(row: ApplicantListRow): GuideApplicant {
  const steps = row.dots.slice(0, -1);
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    status: row.status,
    onForm: row.onForm,
    finished: row.finished,
    score: row.score,
    stepsDone: steps.filter((d) => d.state === "done" || d.state === "below" || d.state === "skipped").length,
    stepsTotal: Math.max(1, steps.length),
  };
}

/** How much room the card has: a phone (steps stacked), a pane (one line, short words) or the full width. */
type Room = "column" | "compact" | "full";

function useCardRoom(ref: RefObject<HTMLElement>): Room {
  const [room, setRoom] = useState<Room>("full");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      setRoom(width >= 880 ? "full" : width >= 640 ? "compact" : "column");
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return room;
}

const NO_ROWS: ReadonlyMap<string, ApplicantListRow> = new Map();

interface CardProps {
  stage: ActiveStage;
  jobs: JobRow[];
  candidatesById: ReadonlyMap<string, Candidate>;
  rowsById: ReadonlyMap<string, ApplicantListRow>;
  /** The people's dots have not come yet (the words are known). */
  loading: boolean;
  onPostJob: () => void;
  notifications?: GuideNotifications;
}

function GuideCard({ stage, jobs, candidatesById, rowsById, loading, onPostJob, notifications }: CardProps) {
  const navigate = useNavigate();
  const ref = useRef<HTMLElement>(null);
  const room = useCardRoom(ref);
  const wide = room !== "column";
  const [kitOpen, setKitOpen] = useState(false);

  const named = stage.stage === "post" ? stage.draft : stage.job;
  const jobRow = named ? jobs.find((j) => j.id === named.id) ?? null : null;
  const alerts = notifications && notifications.status !== "unsupported" ? notifications : undefined;

  const steps = useMemo<StepView[]>(() => {
    return guideSteps(stage.stage, alerts?.status).map((s): StepView => {
      if (s.key === "post") {
        const done = s.state === "done";
        const title = jobRow?.title || named?.title || "Your job";
        return { ...s, label: done ? title : "Post your first job", short: done ? title : "Post your job", href: done && jobRow ? `/jobs/${jobRow.id}` : undefined };
      }
      if (s.key === "share") return { ...s, label: "Share your job", short: "Share it" };
      if (s.key === "best") return { ...s, label: "Meet your best three", short: "Best three" };
      // The alerts step. On a phone it carries its own button; wide, the slim row under the words does.
      const words = alerts && alerts.status !== "on" ? alertsWords(alerts.status, "apply") : null;
      return {
        ...s,
        label: alerts?.status === "on" ? "Phone alerts are on" : "Know when they apply",
        short: alerts?.status === "on" ? "Alerts on" : "Get alerts",
        aside:
          words?.button && alerts ? (
            <button type="button" className="ck-btn ck-btn-outline shrink-0 !px-3 !py-1.5 !text-[12px]" onClick={alerts.onTurnOn}>
              {words.button}
            </button>
          ) : undefined,
        // "off" needs no explaining; the other two say why the button is not enough.
        note:
          words && alerts?.status !== "off" ? (
            <p className="mt-0.5 text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
              {words.text}
            </p>
          ) : undefined,
      };
    });
  }, [stage.stage, alerts, jobRow, named]);

  const at = steps.findIndex((s) => s.state === "active");

  const content = (() => {
    if (stage.stage === "post") {
      return <PostStage draftTitle={stage.draft ? stage.draft.title.trim() : null} onPostJob={() => (stage.draft ? navigate(`/jobs/edit/${stage.draft.id}`) : onPostJob())} wide={wide} />;
    }
    if (stage.stage === "share") {
      return jobRow ? <ShareStage link={applyLinkFor(jobRow)} onCopyPost={() => setKitOpen(true)} wide={wide} /> : null;
    }
    if (stage.stage === "applying") {
      return (
        <ApplyingStage
          counts={stage.counts}
          people={stage.people}
          rowsById={rowsById}
          candidatesById={candidatesById}
          notifications={alerts}
          wide={wide}
          loading={loading}
          onOpenPerson={(id) => navigate(`/applicants/${id}`)}
          onSeeAll={() => navigate(`/jobs/${stage.job.id}`)}
        />
      );
    }
    const titleOf = new Map(jobs.map((j) => [j.id, j.title]));
    const manyRoles = new Set(stage.top.map((p) => p.jobId)).size > 1;
    return (
      <ReadyStage
        top={stage.top}
        readyCount={stage.readyCount}
        candidatesById={candidatesById}
        roleOf={(p) => (manyRoles && p.jobId ? titleOf.get(p.jobId) ?? null : null)}
        wide={wide}
        onOpenPerson={(id) => navigate(`/applicants/${id}`)}
        onReview={() => navigate(`/jobs/${stage.job.id}`)}
      />
    );
  })();

  // Wide: the alerts offer sits under the words (stage 3 carries its own, in its footer).
  const alertsUnder = wide && alerts && stage.stage !== "applying" && stage.stage !== "ready" ? <AlertsRow notifications={alerts} when="apply" /> : null;

  return (
    <section
      ref={ref}
      className="ck-card ck-reveal px-5 pb-5 pt-4 md:px-6"
      style={{ ["--ck-i" as string]: 1, borderTop: "3px solid var(--hf-gold-border)" }}
      data-first-hire={stage.stage}
      aria-label="Your first hire"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-bold uppercase leading-none tracking-[0.12em]" style={{ color: "var(--brass)" }}>
          Your first hire
        </p>
        <p className="text-[12px] leading-none" style={{ color: "var(--ink-3)" }}>
          Step {at + 1} of {steps.length}
        </p>
      </div>

      {wide ? (
        <>
          <StepStrip steps={steps} compact={room === "compact"} />
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
            {content}
            {alertsUnder && <div className="mt-4">{alertsUnder}</div>}
          </div>
        </>
      ) : (
        <StepColumn steps={steps} active={content} />
      )}

      {kitOpen && jobRow && (
        <Suspense fallback={null}>
          <ShareKitDialog open job={jobRow} applyUrl={applyLinkFor(jobRow)} onClose={() => setKitOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}

/** Stages three and four read the Applicants list (dots, scores): only mounted when somebody has applied. */
function GuideWithApplicants({ light, jobs, candidates, onPostJob, notifications }: FirstHireGuideProps) {
  const list = useApplicantList();
  const guideJobs = useMemo(() => jobs.map(toGuideJob), [jobs]);
  const applicants = useMemo(() => list.rows.map(toGuideApplicant), [list.rows]);
  const rowsById = useMemo(() => new Map(list.rows.map((r) => [r.id, r] as const)), [list.rows]);
  const candidatesById = useMemo(() => new Map(candidates.map((c) => [c.id, c] as const)), [candidates]);

  const waiting = list.isLoading;
  // A list that failed, or came back empty for people the dashboard can see, is not "nobody".
  const usable = !waiting && !list.isError && list.rows.length > 0;
  const stage = useMemo<ActiveStage>(() => {
    if (!usable) return light;
    const read = firstHireStage({ jobs: guideJobs, applicants });
    return read.stage === "done" ? light : read;
  }, [usable, light, guideJobs, applicants]);

  return (
    <GuideCard
      stage={stage}
      jobs={jobs}
      candidatesById={candidatesById}
      rowsById={usable ? rowsById : NO_ROWS}
      loading={waiting}
      onPostJob={onPostJob}
      notifications={notifications}
    />
  );
}

export function FirstHireGuide(props: FirstHireGuideProps) {
  if (props.light.stage === "applying") return <GuideWithApplicants {...props} />;
  return (
    <GuideCard
      stage={props.light}
      jobs={props.jobs}
      candidatesById={NO_CANDIDATES}
      rowsById={NO_ROWS}
      loading={false}
      onPostJob={props.onPostJob}
      notifications={props.notifications}
    />
  );
}

const NO_CANDIDATES: ReadonlyMap<string, Candidate> = new Map();
