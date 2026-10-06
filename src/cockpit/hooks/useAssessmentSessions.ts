import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { withReopens, type AssessmentEventRow, type AssessmentSessionRow, type SessionList, type StepReopenRow } from "../lib/assessmentRecord";

/**
 * The server's record of each test attempt, for the staff screens
 * (docs/ASSESSMENT-RECORD.md §5.3). Read under RLS: the job's owner and its
 * active team members see their jobs' rows, nobody else sees any. There is
 * no read RPC.
 *
 * Live: the shell's one live sync (useEmployerLiveSync, mounted once per
 * staff layout) listens to `assessment_sessions` and invalidates the keys
 * below, so nothing here opens
 * a channel of its own. Events are not in the realtime publication; every
 * event insert also updates its session row, and that update is what
 * refreshes an open sheet's events.
 *
 * Rollout: until the migration is applied the two tables do not exist.
 * PostgREST then answers PGRST205 ("Could not find the table"), and these
 * hooks read that as "nothing recorded yet" — never as an error card on a
 * screen that worked yesterday.
 */

/** Every key the live sync invalidates is one of these (prefix match). */
export const assessmentKeys = {
  sessions: ["assessment-sessions"] as const,
  application: (applicationId: string | null | undefined) => ["assessment-sessions", "application", applicationId ?? null] as const,
  events: ["assessment-events"] as const,
  sessionEvents: (sessionId: string | null | undefined) => ["assessment-events", sessionId ?? null] as const,
  integrity: (applicationId: string | null | undefined) => ["assessment-events", "integrity", applicationId ?? null] as const,
  // Staff hand-backs (assessment_step_reopens). Under "applications" on
  // purpose: a hand-back is a write to the application (phase, status) and
  // its marker is written by that same write's trigger, so the live sync's
  // refetch of every ["applications"] query is what brings it in.
  reopens: (applicationId: string | null | undefined) => ["applications", "step-reopens", applicationId ?? null] as const,
};

/** The documented selects (contract §5.3). */
export const SESSION_COLUMNS =
  "id, application_id, job_id, step_id, step_type, attempt, status, end_reason, started_at, last_activity_at, last_heartbeat_at, hidden_at, ended_at, progress, context, grading, draft, integrity_summary, updated_at";
export const EVENT_COLUMNS = "session_id, seq, kind, content, detail, duration_ms, client_at, created_at";
export const REOPEN_COLUMNS = "application_id, step_id, job_id, reopened_at, reopened_by, reopen_count";
// The Applicants list loads every attempt of the employer's jobs itself
// (useApplicantList.ts, LIST_SESSION_COLUMNS); there is no open-only list.

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/** True when the tables (or the edge function) are simply not deployed yet. */
export function isRecordNotDeployed(error: PostgrestLikeError): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "PGRST205" || code === "42P01" || code === "PGRST202") return true;
  return /could not find the table|relation .* does not exist/i.test(error.message ?? "");
}

/** Shared query behaviour: fresh enough to follow a live test, quiet when
 *  the tables are not there yet. */
const FRESHNESS = {
  staleTime: 10_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: (count: number, error: unknown) => count < 2 && !isRecordNotDeployed(error as PostgrestLikeError),
} as const;

function useRecordEnabled(): boolean {
  const { data: mode } = useSchemaMode();
  // The showcase schema has no assessment tables.
  return mode === "hireflow1";
}

/** Every attempt for one applicant, oldest first (the record sheet and the
 *  full profile), with the steps staff handed back for a retake riding along
 *  (`data.reopens`): the builder says "Reopened for a retake" only on a
 *  marker, never on status and phase alone (the applicant can set those). */
export function useApplicationSessions(applicationId: string | null | undefined) {
  const enabled = useRecordEnabled() && !!applicationId;
  const query = useQuery({
    queryKey: assessmentKeys.application(applicationId),
    queryFn: async (): Promise<AssessmentSessionRow[]> => {
      const { data, error } = await supabase
        .from("assessment_sessions")
        .select(SESSION_COLUMNS)
        .eq("application_id", applicationId!)
        .order("started_at");
      if (error) {
        if (isRecordNotDeployed(error)) return [];
        throw error;
      }
      return (data ?? []) as unknown as AssessmentSessionRow[];
    },
    enabled,
    ...FRESHNESS,
  });
  const reopens = useQuery({
    queryKey: assessmentKeys.reopens(applicationId),
    queryFn: async (): Promise<StepReopenRow[]> => {
      const { data, error } = await supabase
        .from("assessment_step_reopens")
        .select(REOPEN_COLUMNS)
        .eq("application_id", applicationId!);
      if (error) {
        if (isRecordNotDeployed(error)) return [];
        throw error;
      }
      return (data ?? []) as unknown as StepReopenRow[];
    },
    enabled,
    ...FRESHNESS,
  });
  // A fresh list per change, never stored in the cache: the live sync merges
  // session rows into the cached list by copying it, which would drop them.
  const data = useMemo<SessionList | undefined>(
    () => (query.data ? withReopens(query.data, reopens.data) : undefined),
    [query.data, reopens.data],
  );
  return { ...query, data };
}

/** One attempt's whole timeline, in order — fetched only while its sheet is open. */
export function useSessionEvents(sessionId: string | null | undefined, open: boolean) {
  const enabled = useRecordEnabled() && !!sessionId && open;
  return useQuery({
    queryKey: assessmentKeys.sessionEvents(sessionId),
    queryFn: async (): Promise<AssessmentEventRow[]> => {
      const { data, error } = await supabase
        .from("assessment_events")
        .select(EVENT_COLUMNS)
        .eq("session_id", sessionId!)
        .order("seq");
      if (error) {
        if (isRecordNotDeployed(error)) return [];
        throw error;
      }
      return (data ?? []) as unknown as AssessmentEventRow[];
    },
    enabled,
    ...FRESHNESS,
  });
}

/** The applicant's integrity events across every test — the "Integrity
 *  checks" sheet. Fetched only while it is open. */
export function useApplicationIntegrityEvents(applicationId: string | null | undefined, open: boolean) {
  const enabled = useRecordEnabled() && !!applicationId && open;
  return useQuery({
    queryKey: assessmentKeys.integrity(applicationId),
    queryFn: async (): Promise<AssessmentEventRow[]> => {
      const { data, error } = await supabase
        .from("assessment_events")
        .select("session_id, seq, kind, detail, duration_ms, client_at, created_at")
        .eq("application_id", applicationId!)
        .eq("kind", "integrity")
        .order("created_at");
      if (error) {
        if (isRecordNotDeployed(error)) return [];
        throw error;
      }
      return (data ?? []) as unknown as AssessmentEventRow[];
    },
    enabled,
    ...FRESHNESS,
  });
}

/**
 * "Now", ticking: the live lines say "active 1 min ago" and turn into "Left
 * … · last active 10 min ago" with no event to prompt it (the lazy rule), so
 * the screen re-reads the clock on its own.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = window.setInterval(tick, intervalMs);
    // Coming back to a sleeping tab: catch up at once rather than on the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
  return now;
}

/* ── Files the applicant attached (applicant-file-url) ───────────────────── */

export interface ApplicantFileLink {
  url: string;
  contentType: string | null;
}

/**
 * A short-lived link to a file this application references (a question
 * upload, a resume page image). The `resumes` bucket only lets staff sign the
 * application's own resume_url, so everything else goes through the
 * applicant-file-url edge function: POST {applicationId, path} with the
 * signed-in staff member's session. It checks the path against the
 * application's notes and the caller against the job (owner or team).
 */
export async function fetchApplicantFileUrl(applicationId: string, path: string): Promise<ApplicantFileLink> {
  const { data, error } = await supabase.functions.invoke("applicant-file-url", { body: { applicationId, path } });
  if (error) throw error;
  const body = (data ?? {}) as Record<string, unknown>;
  const url = [body.url, body.signedUrl, body.signed_url].find((v): v is string => typeof v === "string" && v.length > 0);
  if (!url) throw new Error("applicant-file-url returned no link");
  const type = [body.contentType, body.content_type].find((v): v is string => typeof v === "string");
  return { url, contentType: type ?? null };
}

/** applicant-file-url signs for five minutes (its LINK_SECONDS); a link is
 *  replaced a minute before that. */
export const FILE_LINK_REFRESH_MS = 4 * 60 * 1000;

/** The link for one file, minted when asked for and re-minted before it
 *  expires: every four minutes while it is on screen, and at once when the
 *  tab comes back after longer (a sleeping tab runs no timers). */
export function useApplicantFileUrl(applicationId: string | null | undefined, path: string | null | undefined, enabled = true) {
  const recordOn = useRecordEnabled();
  return useQuery({
    queryKey: ["applicant-file-url", applicationId ?? null, path ?? null],
    queryFn: () => fetchApplicantFileUrl(applicationId!, path!),
    enabled: recordOn && enabled && !!applicationId && !!path,
    // Signed links are short-lived: never serve one older than four minutes.
    staleTime: FILE_LINK_REFRESH_MS,
    gcTime: FILE_LINK_REFRESH_MS,
    refetchInterval: FILE_LINK_REFRESH_MS,
    // The app turns focus refetches off by default; a link is the exception
    // (it only refetches once it is older than staleTime).
    refetchOnWindowFocus: true,
    retry: false,
  });
}
