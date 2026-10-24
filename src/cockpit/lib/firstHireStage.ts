/**
 * "Your first hire" (the owner, 2026-10-21): "The first time somebody logs in,
 * it has to kind of like guide them through the process, right? So the
 * dashboard will say, add your first job or something. ... The second time
 * basically kind of like help them for the flow."
 *
 * This file is the rules and nothing else: given a business's jobs and the
 * people who applied, which step of its first hire is it on, and what does
 * that step have to say? It reads real data only, never a click, so every
 * return visit shows the next step by itself.
 *
 *   post      no live job yet (nothing, or only a draft)
 *   share     a live job and nobody has applied
 *   applying  people applied, nobody has finished the tests (or the one who
 *             has is still being read)
 *   ready     at least one finished and scored, no decision made on anyone
 *   done      any decision exists (an interview, an offer, a hire or a pass),
 *             or the business has closed a job: the normal dashboard
 *
 * No imports: scripts/first_hire_guide.test.mjs loads this file as it stands.
 * Drawn by src/cockpit/components/journey/.
 */

export type GuideJobStatus = "live" | "draft" | "closed";

/** The part of a job the rules read (a JobRow has all of it). */
export interface GuideJob {
  id: string;
  title: string;
  status: GuideJobStatus;
}

/** The part of one applicant the rules read. */
export interface GuideApplicant {
  id: string;
  jobId: string | null;
  name: string;
  /** The application's own status, as stored ("in_progress", "pending", "interview"...). */
  status: string;
  /** Pressed Apply and is on the application form right now. */
  onForm: boolean;
  /** Every step of the job's journey done or skipped. */
  finished: boolean;
  /** ai_score, rounded; null until the person has been scored. */
  score: number | null;
  /** Steps done, and how many there are (for ordering a short list). */
  stepsDone?: number;
  stepsTotal?: number;
}

/** A decision: the owner has done something about a person. */
export const DECISION_STATUSES = ["interview", "offered", "hired", "rejected"] as const;

export function isDecisionStatus(status: string | null | undefined): boolean {
  return !!status && (DECISION_STATUSES as readonly string[]).includes(status);
}

/** Who has applied, in words. */
export interface ApplicantCounts {
  /** Everyone, the ones still on the form included. */
  applied: number;
  /** Still on the application form. */
  onForm: number;
  /** Past the form, not finished: working through the tests. */
  testing: number;
  /** Finished, and not scored yet: being read. */
  reading: number;
}

export type FirstHireStage =
  | { stage: "post"; draft: GuideJob | null }
  | { stage: "share"; job: GuideJob }
  | { stage: "applying"; job: GuideJob; counts: ApplicantCounts; people: GuideApplicant[] }
  | { stage: "ready"; job: GuideJob; top: GuideApplicant[]; readyCount: number }
  | { stage: "done" };

export type FirstHireStageKey = FirstHireStage["stage"];

/** How many people the guide ever lists. */
export const GUIDE_LIST_MAX = 3;

function countsOf(people: readonly GuideApplicant[]): ApplicantCounts {
  return {
    applied: people.length,
    onForm: people.filter((p) => p.onForm).length,
    testing: people.filter((p) => !p.onForm && !p.finished).length,
    reading: people.filter((p) => !p.onForm && p.finished && p.score == null).length,
  };
}

/** Whoever is furthest along first, the ones still on the form last; newest first among equals. */
function furthestAlong(people: readonly GuideApplicant[]): GuideApplicant[] {
  const progress = (p: GuideApplicant) => (p.onForm ? -1 : p.finished ? 2 : (p.stepsDone ?? 0) / Math.max(1, p.stepsTotal ?? 1));
  return people
    .map((p, i) => ({ p, i }))
    .sort((a, b) => progress(b.p) - progress(a.p) || a.i - b.i)
    .map(({ p }) => p);
}

/**
 * The step this business is on. `applicants` come newest first (as the
 * Applicants list has them). The job a stage names is the live one with the
 * most people in it; the first live one in the list wins a tie.
 */
export function firstHireStage(input: { jobs: readonly GuideJob[]; applicants: readonly GuideApplicant[] }): FirstHireStage {
  const { jobs, applicants } = input;

  // Any decision at all, and the guide has done its work.
  if (applicants.some((a) => isDecisionStatus(a.status))) return { stage: "done" };

  const live = jobs.filter((j) => j.status === "live");
  if (live.length === 0) {
    // A job that came and went with no decision on anyone: this person knows
    // the way round, and the normal page is the right one.
    if (jobs.some((j) => j.status === "closed")) return { stage: "done" };
    return { stage: "post", draft: jobs.find((j) => j.status === "draft") ?? null };
  }

  const inJob = (job: GuideJob) => applicants.filter((a) => a.jobId === job.id);
  const busiest = (list: readonly GuideJob[], size: (job: GuideJob) => number): GuideJob =>
    list.reduce((best, job) => (size(job) > size(best) ? job : best), list[0]);

  if (applicants.length === 0) return { stage: "share", job: live[0] };

  const isReady = (a: GuideApplicant) => !a.onForm && a.finished && a.score != null;
  const readyJobs = jobs.filter((j) => inJob(j).some(isReady));
  if (readyJobs.length > 0) {
    const job = busiest(readyJobs, (j) => inJob(j).filter(isReady).length);
    const ready = inJob(job).filter(isReady);
    const top = [...ready].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, GUIDE_LIST_MAX);
    return { stage: "ready", job, top, readyCount: ready.length };
  }

  // Nobody scored yet. The job to name is the one with the most people; a
  // live one when there is a tie.
  const withPeople = jobs.filter((j) => inJob(j).length > 0);
  const job = busiest(withPeople.length > 0 ? withPeople : live, (j) => inJob(j).length * 2 + (j.status === "live" ? 1 : 0));
  return { stage: "applying", job, counts: countsOf(applicants), people: furthestAlong(applicants).slice(0, GUIDE_LIST_MAX) };
}

/* ── The words ─────────────────────────────────────────────────────────── */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The headline of the "people applied" step. */
export function appliedHeadline(c: ApplicantCounts): string {
  if (c.applied > 0 && c.onForm === c.applied) {
    return c.applied === 1 ? "Someone is applying right now." : `${c.applied} people are applying right now.`;
  }
  return `${plural(c.applied, "person", "people")} applied.`;
}

/** The line under it: who is where. Empty when there is nothing to add. */
export function appliedDetail(c: ApplicantCounts): string {
  const parts: string[] = [];
  if (c.testing > 0) parts.push(`${c.testing} ${c.testing === 1 ? "is" : "are"} taking the tests now.`);
  if (c.reading > 0) parts.push(`${c.reading} ${c.reading === 1 ? "has" : "have"} finished and ${c.reading === 1 ? "is" : "are"} being read.`);
  if (c.onForm > 0 && c.onForm < c.applied) parts.push(`${c.onForm} ${c.onForm === 1 ? "is" : "are"} still on the form.`);
  return parts.join(" ");
}

/** The headline of the "ready" step, by how many there are. */
export function readyHeadline(readyCount: number): string {
  if (readyCount <= 1) return "Your first applicant is ready.";
  if (readyCount === 2) return "Your best two are ready.";
  return "Your best three are ready.";
}

/* ── The steps across the top ──────────────────────────────────────────── */

export type GuideStepKey = "post" | "share" | "alerts" | "best";
export type GuideStepState = "done" | "active" | "todo" | "open";

export interface GuideStep {
  key: GuideStepKey;
  state: GuideStepState;
}

/** What the phone-alert step can be told (the notifications hook, wired later). */
export type GuideNotificationStatus = "on" | "off" | "needs-home-screen" | "blocked" | "unsupported";

/**
 * The steps, in order, each ticked, current, to come, or (the alerts step,
 * which takes no order) open. With no notifications on this device, or none
 * the browser can do, the alerts step is not there at all.
 */
export function guideSteps(stage: Exclude<FirstHireStageKey, "done">, notifications: GuideNotificationStatus | null | undefined): GuideStep[] {
  const withAlerts = !!notifications && notifications !== "unsupported";
  const keys: GuideStepKey[] = withAlerts ? ["post", "share", "alerts", "best"] : ["post", "share", "best"];
  // Posting, then sharing, then (once people are in) meeting the best of them.
  const active: GuideStepKey = stage === "post" ? "post" : stage === "share" ? "share" : "best";
  const activeAt = keys.indexOf(active);
  return keys.map((key, i): GuideStep => {
    if (key === "alerts") return { key, state: notifications === "on" ? "done" : "open" };
    return { key, state: i < activeAt ? "done" : i === activeAt ? "active" : "todo" };
  });
}

/** What to say about alerts for a status, and the one button, if there is one. */
export function alertsWords(status: GuideNotificationStatus, when: "apply" | "finish"): { text: string; button: string | null } | null {
  if (status === "off") {
    return {
      text: when === "apply" ? "Want a phone alert the moment someone applies?" : "Want a phone alert the moment the first one finishes?",
      button: "Turn on",
    };
  }
  if (status === "needs-home-screen") {
    return { text: "To get alerts on your phone, add HireFlow to your Home Screen first.", button: "Show me how" };
  }
  if (status === "blocked") {
    return { text: "Alerts are blocked in this browser. Allow notifications for HireFlow in its settings and they will start.", button: null };
  }
  return null;
}
