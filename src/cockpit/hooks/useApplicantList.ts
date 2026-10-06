import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { useEmployerJobs } from "@/hooks/useJobs";
import { isRecordNotDeployed, REOPEN_COLUMNS, useNow } from "./useAssessmentSessions";
import { LIVE_SYNC_LIST_KEYS } from "./useEmployerLiveSync";
import type { AssessmentSessionRow, StepReopenRow } from "../lib/assessmentRecord";
import type { CandidateJourneyStep } from "@/lib/candidateJourney";
import {
  APPLICANT_LIST_COLUMNS,
  createApplicantRowBuilder,
  journeyForJob,
  type ApplicantListApp,
  type ApplicantListInterview,
  type ApplicantListJob,
  type ApplicantListRow,
} from "../lib/applicantList";

/**
 * The Applicants list's data (docs/APPLICANTS-LIST.md §3): every applicant of
 * the employer's jobs as a slim row, every attempt they made, and the staff
 * hand-backs, so each row is built by the same `buildAssessmentRecord` call
 * the full profile makes. Filtered, sorted and drawn 25 at a time in the
 * browser (src/cockpit/lib/applicantList.ts); the queries never page by what
 * is on screen.
 *
 * Cheap enough for hundreds:
 *  - Jobs come from useEmployerJobs (already loaded) and are attached on the
 *    client. No `jobs!inner(*)` embed: it repeats a 17 KB job on every row.
 *  - `applications` by job, only the columns the record reads; `profiles` in
 *    chunks of 150 ids with four columns.
 *  - EVERY attempt (not only open ones: open-only makes the flag count and
 *    the last move wrong), without grading, context or draft; the draft only
 *    for form attempts, where the country of someone still on the form is.
 *  - Every select pages past PostgREST's 1,000-row cap (it truncates
 *    silently on this project).
 *
 * The existing ["applications", "employer", uid] query is NOT this one and is
 * not changed: the profile, Dashboard, Jobs counts, Messages and Analytics
 * read it.
 *
 * Live: the keys sit under ["applications", "list"] and ["assessment-
 * sessions", "list"], which the shell's one live sync (useEmployerLiveSync)
 * merges in place and refetches only on a new row, a deleted one, one it
 * lacks, or its reconnect catch-up: a live applicant's heartbeat never
 * re-downloads the list. Nothing here opens a channel. The 30-second clock
 * (useNow) ages "Active now" and "Left" with no event at all.
 *
 * Because the sync keeps the two big lists current, they are not refetched
 * for a remount or a window focus either: Back from a profile, or a phone
 * coming back from the background, must not re-download every applicant and
 * every attempt (about 18 KB of notes and scorecard per applicant). They heal
 * on a reconnect, the sync's catch-up, and a remount after five minutes.
 *
 * A failed attempts or hand-backs load costs the live details, never the
 * list: the rows are built from the applications alone and say so
 * (`partial`), the way the page worked before it had the record.
 */

/** Shared empty inputs, so a failed load does not rebuild every row each render. */
const NO_SESSIONS: AssessmentSessionRow[] = [];
const NO_REOPENS: StepReopenRow[] = [];

/** PostgREST's max_rows on this project: a select returns at most this many, with no error. */
const PAGE_ROWS = 1000;
/** A runaway guard: 200 pages is 200,000 rows. */
const MAX_PAGES = 200;
/** Job ids per `.in()`: a GET URL has a length limit. */
const JOB_CHUNK = 100;
/** Candidate ids per profiles request (contract §3). */
const PROFILE_CHUNK = 150;

const PROFILE_COLUMNS = "user_id, full_name, email, avatar_url";
/** What the record reads from an attempt; no grading, context or draft. */
export const LIST_SESSION_COLUMNS =
  "id, application_id, job_id, step_id, step_type, attempt, status, end_reason, started_at, last_activity_at, hidden_at, ended_at, progress, integrity_summary, updated_at";
const INTERVIEW_COLUMNS = "application_id, scheduled_at, status";

/** Every key this hook uses. The first two are the live sync's merged lists:
 *  their last part is the sorted job ids, comma-joined (LIVE_SYNC_LIST_KEYS). */
export const applicantListKeys = {
  applications: (jobsKey: string) => [...LIVE_SYNC_LIST_KEYS.applications, jobsKey] as const,
  sessions: (jobsKey: string) => [...LIVE_SYNC_LIST_KEYS.sessions, jobsKey] as const,
  // Under ["applications"] on purpose: a hand-back is a write to the
  // application, and its marker arrives with the refetch that write causes.
  reopens: (jobsKey: string) => ["applications", "step-reopens", "list", jobsKey] as const,
  // Under ["interviews"]: the shell's live sync refreshes that prefix on any
  // change to public.interviews (a slot the candidate picked, a teammate's
  // cancellation), and every place that books one invalidates it.
  interviews: (idsKey: string) => ["interviews", "applicant-list", idsKey] as const,
};

const retry = (count: number, error: unknown) => count < 2 && !isRecordNotDeployed(error as { code?: string; message?: string });

/** The two merged lists (applications, attempts): kept current in place by
 *  the live sync, so no refetch on focus or a quick remount (contract §3).
 *  A reconnect, the sync's catch-up, or a remount after five minutes heals a
 *  missed event. */
const MERGED_FRESHNESS = {
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  retry,
} as const;

/** The small hand-backs list: refetched by the live sync on every
 *  applications change anyway, and fresh enough to heal on its own. */
const LIST_FRESHNESS = {
  staleTime: 15_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry,
} as const;

type PageResult = { data: unknown; error: { code?: string | null; message?: string | null } | null };

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Every row of a select, a page at a time, until a page comes back short. */
async function allPages<T>(page: (from: number, to: number) => PromiseLike<PageResult>, keyOf: (row: T) => string): Promise<T[]> {
  const out = new Map<string, T>();
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const from = i * PAGE_ROWS;
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as T[];
    // A row that moved between two pages arrives twice: keep one.
    for (const row of rows) out.set(keyOf(row), row);
    if (rows.length < PAGE_ROWS) break;
  }
  return [...out.values()];
}

/** Every application of these jobs (slim columns), with each applicant's profile. */
export async function fetchListApplications(jobIds: readonly string[]): Promise<ApplicantListApp[]> {
  const apps: ApplicantListApp[] = [];
  for (const ids of chunks(jobIds, JOB_CHUNK)) {
    apps.push(
      ...(await allPages<ApplicantListApp>(
        (from, to) =>
          supabase
            .from("applications")
            .select(APPLICANT_LIST_COLUMNS)
            .in("job_id", ids)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to) as unknown as PromiseLike<PageResult>,
        (row) => row.id,
      )),
    );
  }
  // No FK from applications to profiles, so PostgREST cannot embed them.
  const candidateIds = [...new Set(apps.map((a) => a.candidate_id).filter((id): id is string => !!id))];
  const profiles = new Map<string, ApplicantListApp["profiles"]>();
  for (const ids of chunks(candidateIds, PROFILE_CHUNK)) {
    const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("user_id", ids);
    if (error) throw error;
    for (const p of (data ?? []) as Array<NonNullable<ApplicantListApp["profiles"]>>) {
      if (p?.user_id) profiles.set(p.user_id, p);
    }
  }
  return apps.map((a) => ({ ...a, profiles: (a.candidate_id && profiles.get(a.candidate_id)) || null }));
}

/** Every attempt of these jobs (slim columns), drafts on form attempts only. */
export async function fetchListSessions(jobIds: readonly string[]): Promise<AssessmentSessionRow[]> {
  try {
    const rows: AssessmentSessionRow[] = [];
    const drafts = new Map<string, unknown>();
    for (const ids of chunks(jobIds, JOB_CHUNK)) {
      rows.push(
        ...(await allPages<AssessmentSessionRow>(
          (from, to) =>
            supabase
              .from("assessment_sessions")
              .select(LIST_SESSION_COLUMNS)
              .in("job_id", ids)
              .order("started_at")
              .order("id")
              .range(from, to) as unknown as PromiseLike<PageResult>,
          (row) => row.id,
        )),
      );
      // The form's saved answers: the only place the country of someone
      // still on the form is. About 0.5 KB each, form attempts only.
      const withDraft = await allPages<{ id: string; draft: unknown }>(
        (from, to) =>
          supabase
            .from("assessment_sessions")
            .select("id, draft")
            .in("job_id", ids)
            .eq("step_type", "application")
            .order("started_at")
            .order("id")
            .range(from, to) as unknown as PromiseLike<PageResult>,
        (row) => row.id,
      );
      for (const d of withDraft) drafts.set(d.id, d.draft ?? null);
    }
    // Only form attempts carry the `draft` key, so the live merge (which
    // copies only the columns a cached row has) keeps it current on those
    // and never adds it to the others.
    return rows.map((row) => (row.step_type === "application" ? { ...row, draft: drafts.get(row.id) ?? null } : row));
  } catch (error) {
    if (isRecordNotDeployed(error as { code?: string; message?: string })) return [];
    throw error;
  }
}

/** Every staff hand-back on these jobs. */
export async function fetchListReopens(jobIds: readonly string[]): Promise<StepReopenRow[]> {
  try {
    const rows: StepReopenRow[] = [];
    for (const ids of chunks(jobIds, JOB_CHUNK)) {
      rows.push(
        ...(await allPages<StepReopenRow>(
          (from, to) =>
            supabase
              .from("assessment_step_reopens")
              .select(REOPEN_COLUMNS)
              .in("job_id", ids)
              .order("reopened_at", { ascending: false })
              .order("application_id")
              .order("step_id")
              .range(from, to) as unknown as PromiseLike<PageResult>,
          (row) => `${row.application_id ?? ""}:${row.step_id}`,
        )),
      );
    }
    return rows;
  } catch (error) {
    if (isRecordNotDeployed(error as { code?: string; message?: string })) return [];
    throw error;
  }
}

/** The booked interviews of these applications. */
export async function fetchListInterviews(applicationIds: readonly string[]): Promise<ApplicantListInterview[]> {
  const out: ApplicantListInterview[] = [];
  for (const ids of chunks(applicationIds, PROFILE_CHUNK)) {
    const { data, error } = await supabase.from("interviews").select(INTERVIEW_COLUMNS).in("application_id", ids).eq("status", "scheduled");
    if (error) throw error;
    out.push(...((data ?? []) as ApplicantListInterview[]));
  }
  return out;
}

export interface ApplicantListData {
  /** Every applicant of the employer's jobs, newest first, worked out once per change. */
  rows: ApplicantListRow[];
  jobs: ApplicantListJob[];
  /** Each job's journey, for "Where they are" (whereOptions) and step titles. */
  journeys: Map<string, CandidateJourneyStep[]>;
  /** The clock the rows were worded against (ticks every 30 s). */
  now: number;
  isLoading: boolean;
  isFetching: boolean;
  /** The jobs or the applications did not load: there is no list to show. */
  isError: boolean;
  /** The attempts or the hand-backs did not load: the rows are there, but
   *  their live lines, flags and last move are not (shown, not hidden). */
  partial: boolean;
  /** The older demo schema (no applications of this shape): there is no list
   *  to build, which is not the same as nobody having applied. */
  showcase: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

/** The Applicants list. Mount it on the list page only; the profile keeps
 *  reading its own queries. */
export function useApplicantList(): ApplicantListData {
  const { data: mode } = useSchemaMode();
  const jobsQuery = useEmployerJobs();
  const jobs = useMemo(() => (jobsQuery.data ?? []) as ApplicantListJob[], [jobsQuery.data]);
  const jobIds = useMemo(() => [...new Set(jobs.map((j) => j.id).filter(Boolean))].sort(), [jobs]);
  const jobsKey = jobIds.join(",");
  // The showcase schema has no applications table of this shape.
  const enabled = mode === "hireflow1" && jobIds.length > 0;

  const apps = useQuery({
    queryKey: applicantListKeys.applications(jobsKey),
    queryFn: () => fetchListApplications(jobIds),
    enabled,
    ...MERGED_FRESHNESS,
  });
  const sessions = useQuery({
    queryKey: applicantListKeys.sessions(jobsKey),
    queryFn: () => fetchListSessions(jobIds),
    enabled,
    ...MERGED_FRESHNESS,
  });
  const reopens = useQuery({
    queryKey: applicantListKeys.reopens(jobsKey),
    queryFn: () => fetchListReopens(jobIds),
    enabled,
    ...LIST_FRESHNESS,
  });

  // Only the people moved to interview can show "Interview Thu 3 PM".
  const interviewIds = useMemo(
    () => (apps.data ?? []).filter((a) => a.status === "interview").map((a) => a.id).sort(),
    [apps.data],
  );
  const interviews = useQuery({
    queryKey: applicantListKeys.interviews(interviewIds.join(",")),
    queryFn: () => fetchListInterviews(interviewIds),
    enabled: enabled && interviewIds.length > 0,
    staleTime: 60_000,
  });

  const now = useNow(30_000);
  const builder = useRef<ReturnType<typeof createApplicantRowBuilder> | null>(null);
  if (!builder.current) builder.current = createApplicantRowBuilder();

  // Rows wait for the attempts while they load (without them every flag
  // count and last move would be wrong for a moment), but not for one that
  // failed: then the rows are built without it and say so.
  const sessionsFailed = sessions.isError && !sessions.data;
  const reopensFailed = reopens.isError && !reopens.data;
  const ready = !!apps.data && (!!sessions.data || sessionsFailed) && (!!reopens.data || reopensFailed);
  const rows = useMemo(
    () =>
      ready
        ? builder.current!({
            apps: apps.data!,
            sessions: sessions.data ?? NO_SESSIONS,
            reopens: reopens.data ?? NO_REOPENS,
            jobs,
            interviews: interviews.data ?? [],
            now,
          })
        : [],
    [ready, apps.data, sessions.data, reopens.data, jobs, interviews.data, now],
  );

  const journeys = useMemo(() => new Map(jobs.map((j) => [j.id, journeyForJob(j)] as const)), [jobs]);

  const isError = jobsQuery.isError || apps.isError;
  return {
    rows,
    jobs,
    journeys,
    now,
    isLoading: mode == null || jobsQuery.isLoading || (enabled && !ready && !isError),
    isFetching: jobsQuery.isFetching || apps.isFetching || sessions.isFetching || reopens.isFetching,
    isError,
    partial: sessionsFailed || reopensFailed,
    showcase: mode === "showcase",
    error: jobsQuery.error ?? apps.error ?? sessions.error ?? reopens.error ?? null,
    refetch: () => Promise.all([jobsQuery.refetch(), apps.refetch(), sessions.refetch(), reopens.refetch(), interviews.refetch()]),
  };
}
