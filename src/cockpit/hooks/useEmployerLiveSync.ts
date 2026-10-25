import { useEffect, useId } from "react";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";
import { EVALUATION_FIELDS, withoutEvaluationFields } from "@/lib/applicationEvaluation";

/**
 * Staff live sync: one realtime subscription, mounted once by the staff
 * layout, that keeps every applicant screen current without a refresh.
 *
 * Why it exists (2026-10-05): the owner watched his own test applicant from
 * the staff tab and saw "Nobody has applied yet." for the whole run. The row
 * was inserted at Apply Now, but the cockpit's only applicants query had no
 * subscription and sat on the app-wide 5-minute staleTime, and a candidate's
 * own cache invalidation runs on hireflownow.com, a different tab and origin.
 * The cockpit rewrite (e1a92ef, 2026-06-25) had dropped the old page-level
 * `applications-list` / `dashboard-applications` channels and nothing
 * replaced them. The list, the selected panel, the dashboard and the full
 * profile all read the same ["applications", "employer", uid] cache, so one
 * listener at the shell refreshes all of them.
 *
 * How it behaves:
 *  - One channel per mounted instance: the topic carries useId(). realtime-js
 *    returns the SAME channel object for a repeated topic, and a second
 *    `.on()` on a channel that already joined makes the server reply
 *    "mismatch between server and client bindings", which kills both callers.
 *  - Every binding is added before `.subscribe()`.
 *  - No row filter: RLS (is_job_owner / is_active_team_member_for_job) already
 *    limits delivery to this employer's own jobs.
 *  - Bursts are coalesced (~250 ms): an autopilot run writes the row several
 *    times in a second, and one refetch round is enough. At most one round is
 *    in flight; anything that lands during it gets one more round after.
 *  - An UPDATE is merged into the cached row at once, so a landed test score
 *    shows before the refetch returns; the refetch then brings the joined
 *    job and profile data and anything the payload could not carry.
 *  - Every SUBSCRIBED (the first join and every rejoin after a dropped socket,
 *    a sleeping laptop, a phone in the background) runs one catch-up round,
 *    because events sent while the socket was down are never replayed.
 *
 * Wave 2 (2026-10-06) adds `assessment_sessions` — one row per test attempt,
 * updated on every answer, chat turn, typing snapshot, heartbeat and switch
 * away (docs/ASSESSMENT-RECORD.md). It gets its OWN channel, beside the
 * applications one and with the same per-instance topic rule: binding a table
 * that does not exist (yet) fails the channel it is on, and the applicant list
 * must never go stale because the newer record is missing or misbehaving.
 *  - An UPDATE is merged into every cached session list at once (the live
 *    line moves before the refetch lands).
 *  - The changed attempt's events are refetched, so an open record sheet
 *    follows a chat or a quiz as it happens (events are not in the realtime
 *    publication; every event insert also updates its session row).
 *  - Same coalescing and SUBSCRIBED catch-up as the applications channel.
 *
 * Wave 3 (2026-10-06, docs/APPLICANTS-LIST.md §3): the Applicants list holds
 * EVERY applicant and EVERY attempt of the employer's jobs (the keys in
 * LIVE_SYNC_LIST_KEYS, src/cockpit/hooks/useApplicantList.ts). A live
 * applicant's attempt row changes every 5–30 s; refetching those lists on
 * each change would download them almost continuously. So:
 *  - An UPDATE is merged into them in place, column by column (only the
 *    columns the list selected: an applications payload is the whole row,
 *    and the list must not grow its heavy text columns).
 *  - They are refetched only for an INSERT, a DELETE, an UPDATE for a row
 *    they do not hold (on one of their jobs), a payload the server cut short,
 *    and the SUBSCRIBED catch-up. Every other key refetches exactly as before.
 *  - One person's attempts (["assessment-sessions", "application", id], the
 *    full profile's, with context, grading and draft) refetch only when an
 *    attempt of THAT application changed, or on the catch-up: with a profile
 *    open, someone else's heartbeat must not re-download it every second.
 *
 * Wave 4 (2026-10-06): `interviews` on a third channel of its own (same
 * per-instance rule, same reason as the test record's: a failing binding must
 * not stall the applicant list). A time booked, moved or cancelled by the
 * candidate, a teammate or the server reaches every open screen: the list's
 * "Interview Thu 3 PM", the Interviews page and the profile all read keys
 * under ["interviews"].
 *
 * Wave 5 (2026-10-10): the paperwork, on two more channels of their own.
 * The owner: "the employer tab never refreshes in real time ... I sent the
 * ID, it didn't refresh here." `document_requests` (an ID sent, a payment
 * email typed, a request answered on another tab) refreshes the applicant
 * page's Documents section and the Documents page's "ID & papers" list;
 * `documents` (an offer letter signed by the applicant, declined, completed)
 * refreshes the Documents page, the open letter and the Hire box.
 *
 * Wave 6 (2026-10-25): Ava's score, report, scorecard and summary and the
 * team's notes moved out of the applicant's row into
 * `application_evaluations` (supabase/migrations/20261025235000). The
 * applications row now always carries NULL for those five, so they are taken
 * out of every applications event before it is merged (merging them would
 * wipe the score on screen), and a sixth channel of its own merges each
 * evaluation change into the cached rows in place, by application id, so a
 * new score still shows the moment it lands. No refetch for it: the same
 * write also updates the application, whose event refreshes everything else.
 * A rejoin of that channel (not its first join) runs a full round, lists
 * included, for any score missed while it was down.
 */

/** Coalescing window for a burst of row changes. */
export const LIVE_SYNC_COALESCE_MS = 250;

/**
 * Every cached staff query a change to public.applications can make stale,
 * as prefix keys. invalidateQueries refetches only the ones on screen; the
 * rest are marked stale and refetch when next shown.
 */
export const LIVE_SYNC_QUERY_KEYS: readonly QueryKey[] = [
  // Employer list + stats: Applicants, the selected panel, Dashboard, the full
  // profile (CandidateDetail), and the per-job counts on Jobs all read these.
  ["applications"],
  ["activity-feed"],
  // useEmployerJobs carries an application_count per job.
  ["jobs", "employer"],
  ["advanced-analytics"],
  // The "is anyone looking?" card counts applications beside the visits.
  ["careers-traffic"],
  ["new-applicants-count"],
  ["applications-for-documents"],
  ["messageable-candidates"],
  ["pipeline-health"],
];

/**
 * The cached staff queries a change to public.assessment_sessions can make
 * stale (see src/cockpit/hooks/useAssessmentSessions.ts for the keys).
 */
export const LIVE_SYNC_SESSION_KEYS: readonly QueryKey[] = [["assessment-sessions"]];
/** Prefix of every events query; refetched per changed attempt. */
export const LIVE_SYNC_EVENTS_KEY: QueryKey = ["assessment-events"];
/** One applicant's attempts (useApplicationSessions): ["assessment-sessions",
 *  "application", <application id>]. Refetched per changed application. */
export const LIVE_SYNC_APPLICATION_SESSIONS_KEY = ["assessment-sessions", "application"] as const;
/** Every cached query a change to public.interviews can make stale. */
export const LIVE_SYNC_INTERVIEW_KEYS: readonly QueryKey[] = [["interviews"]];
/** Every cached query a change to public.document_requests can make stale. */
export const LIVE_SYNC_REQUEST_KEYS: readonly QueryKey[] = [["applicant-requests"], ["all-requests"], ["document-requests"], ["employer-pending-documents-count"]];
/** Every cached query a change to public.documents can make stale. */
export const LIVE_SYNC_DOCUMENT_KEYS: readonly QueryKey[] = [["documents"], ["document-audit-log"], ["offer-letter-state"], ["employer-pending-documents-count"]];

/**
 * The lists that are merged in place and refetched only on a structural
 * change (wave 3 above). Their full keys are `[...prefix, "<job ids>"]`: the
 * sorted job ids they cover, comma-joined, so an event on another job can be
 * told apart from a row the list is missing.
 */
export const LIVE_SYNC_LIST_KEYS = {
  applications: ["applications", "list"] as const,
  sessions: ["assessment-sessions", "list"] as const,
};

function hasPrefix(key: QueryKey, prefix: readonly unknown[]): boolean {
  return prefix.every((part, i) => key[i] === part);
}

/** True for a key under one of LIVE_SYNC_LIST_KEYS. */
export function isMergedListKey(key: QueryKey): boolean {
  return hasPrefix(key, LIVE_SYNC_LIST_KEYS.applications) || hasPrefix(key, LIVE_SYNC_LIST_KEYS.sessions);
}

/** True for one applicant's attempts (the full profile's). */
function isApplicationSessionsKey(key: QueryKey): boolean {
  return hasPrefix(key, LIVE_SYNC_APPLICATION_SESSIONS_KEY);
}

/** Whether a merged list covers a job; unknown either way counts as yes. */
function listCoversJob(key: QueryKey, jobId: unknown): boolean {
  const jobs = key[2];
  if (typeof jobId !== "string" || typeof jobs !== "string") return true;
  return jobs.split(",").includes(jobId);
}

/**
 * Applies one realtime change to a merged list (LIVE_SYNC_LIST_KEYS) and says
 * whether the list must be refetched. An UPDATE to a row it holds is merged
 * (only the columns it selected; never rolled back by an older event) and
 * needs nothing more; an INSERT, a DELETE, a row it lacks or a payload the
 * server cut short does.
 */
export function mergeIntoList<T extends SessionRowLike>(
  rows: T[] | undefined,
  payload: ApplicationChange,
  queryKey: QueryKey,
): { rows: T[] | undefined; refetch: boolean } {
  const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: unknown; job_id?: unknown } | null;
  const covered = listCoversJob(queryKey, row?.job_id);
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return { rows, refetch: covered };
  if (payload.eventType === "DELETE") {
    const next = applySessionChange(rows, payload);
    return { rows: next, refetch: next !== rows };
  }
  if (payload.eventType !== "UPDATE") return { rows, refetch: covered };
  const held = Array.isArray(rows) && typeof row?.id === "string" && rows.some((r) => r.id === row.id);
  if (!held) return { rows, refetch: covered };
  return { rows: applySessionChange(rows, payload), refetch: false };
}

type LiveSyncClient = Pick<typeof supabase, "channel" | "removeChannel">;
type ApplicationChange = RealtimePostgresChangesPayload<Record<string, unknown>>;
type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Collapses many `schedule()` calls into one `run()` per window, with never
 * more than one run in flight. `run(force)` gets force=true when at least one
 * caller in the window was a real row change, false when every caller was a
 * reconnect catch-up (which must not cancel a fetch already under way).
 */
export function createLiveSyncCoalescer(
  run: (force: boolean) => unknown,
  delayMs: number = LIVE_SYNC_COALESCE_MS,
  timers: Timers = defaultTimers,
) {
  let timer: unknown = null;
  let running = false;
  let pending = false;
  let force = false;
  let disposed = false;

  const arm = () => {
    if (timer === null) timer = timers.setTimeout(flush, delayMs);
  };

  function flush() {
    timer = null;
    if (disposed) return;
    const forceThisRound = force;
    force = false;
    pending = false;
    running = true;
    Promise.resolve()
      .then(() => run(forceThisRound))
      .catch(() => undefined)
      .finally(() => {
        running = false;
        if (pending && !disposed) arm();
      });
  }

  return {
    schedule(isChange: boolean = true) {
      if (disposed) return;
      if (isChange) force = true;
      pending = true;
      if (!running) arm();
    },
    dispose() {
      disposed = true;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Applies one realtime change to the cached employer list, returning the same
 * array when there is nothing to apply. UPDATE merges the new column values
 * over the cached row and keeps its joined `jobs` / `profiles`; DELETE drops
 * the row; INSERT is left to the refetch, which brings the job and profile
 * the new row needs. A payload the server truncated (`errors`) is skipped, and
 * so is one older than the row already cached, so a late event can never roll
 * a fresher refetch back.
 */
export function applyApplicationChange(
  rows: ApplicationWithCandidate[] | undefined,
  payload: ApplicationChange,
): ApplicationWithCandidate[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return rows;

  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id?: unknown })?.id;
    if (typeof id !== "string") return rows;
    const kept = rows.filter((row) => row.id !== id);
    return kept.length === rows.length ? rows : kept;
  }

  if (payload.eventType !== "UPDATE") return rows;

  const next = payload.new as Partial<ApplicationWithCandidate> & { id?: unknown };
  if (!next || typeof next.id !== "string") return rows;
  const index = rows.findIndex((row) => row.id === next.id);
  if (index === -1) return rows;

  const cached = rows[index];
  const cachedAt = cached.updated_at ? Date.parse(cached.updated_at) : NaN;
  const nextAt = typeof next.updated_at === "string" ? Date.parse(next.updated_at) : NaN;
  if (!Number.isNaN(cachedAt) && !Number.isNaN(nextAt) && nextAt < cachedAt) return rows;

  // Only columns the payload actually carries; `jobs` and `profiles` are not
  // columns, so the spread keeps the cached joins.
  const merged = { ...cached } as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) merged[key] = value;
  }
  const out = rows.slice();
  out[index] = merged as unknown as ApplicationWithCandidate;
  return out;
}

/** The slice of an assessment_sessions row the merge reads. */
type SessionRowLike = { id: string; updated_at?: string | null } & Record<string, unknown>;

/**
 * Applies one realtime change to a cached list of attempts, returning the
 * same array when there is nothing to apply (same rules as
 * applyApplicationChange: UPDATE merges over the cached row unless it is
 * older; DELETE drops it; INSERT waits for the refetch, which knows whether
 * the new attempt belongs in this list).
 */
export function applySessionChange<T extends SessionRowLike>(rows: T[] | undefined, payload: ApplicationChange): T[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return rows;
  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id?: unknown })?.id;
    if (typeof id !== "string") return rows;
    const kept = rows.filter((row) => row.id !== id);
    return kept.length === rows.length ? rows : kept;
  }
  if (payload.eventType !== "UPDATE") return rows;
  const next = payload.new as Partial<T> & { id?: unknown };
  if (!next || typeof next.id !== "string") return rows;
  const index = rows.findIndex((row) => row.id === next.id);
  if (index === -1) return rows;
  const cached = rows[index];
  const cachedAt = cached.updated_at ? Date.parse(cached.updated_at) : NaN;
  const nextAt = typeof next.updated_at === "string" ? Date.parse(next.updated_at) : NaN;
  if (!Number.isNaN(cachedAt) && !Number.isNaN(nextAt) && nextAt < cachedAt) return rows;
  const merged = { ...cached } as Record<string, unknown>;
  // Only the columns this list selected: a full payload must not widen a
  // narrow list with grading or a draft it never asked for.
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined && key in cached) merged[key] = value;
  }
  const out = rows.slice();
  out[index] = merged as T;
  return out;
}

/**
 * An applications event without the hiring team's five evaluation columns
 * (wave 6): the row holds NULL for them now, and merging that NULL would
 * wipe what the evaluation's own event brought.
 */
export function withoutEvaluationColumns(payload: ApplicationChange): ApplicationChange {
  const next = payload.new as Record<string, unknown> | null | undefined;
  const old = payload.old as Record<string, unknown> | null | undefined;
  const strippedNew = next && typeof next === "object" ? withoutEvaluationFields(next) : next;
  const strippedOld = old && typeof old === "object" ? withoutEvaluationFields(old) : old;
  if (strippedNew === next && strippedOld === old) return payload;
  return { ...payload, new: strippedNew, old: strippedOld } as ApplicationChange;
}

/**
 * Applies one change to public.application_evaluations (one row per
 * application, keyed by application_id) to a cached list of applications,
 * returning the same array when there is nothing to apply. Only the five
 * evaluation fields are written; `onlySelected` keeps a narrow list narrow
 * (the merged Applicants lists select ai_score and ai_scorecard only). A
 * DELETE goes with its application (that row's own DELETE drops it); a row
 * the list does not hold is left to the applications channel.
 */
export function applyEvaluationChange<T extends { id: string }>(
  rows: T[] | undefined,
  payload: ApplicationChange,
  onlySelected = false,
): T[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return rows;
  if (payload.eventType === "DELETE") return rows;
  const next = payload.new as Record<string, unknown> | null;
  const applicationId = next?.application_id;
  if (!next || typeof applicationId !== "string") return rows;
  const index = rows.findIndex((row) => row.id === applicationId);
  if (index === -1) return rows;
  const cached = rows[index] as unknown as Record<string, unknown>;
  let merged: Record<string, unknown> | null = null;
  for (const field of EVALUATION_FIELDS) {
    if (!(field in next) || next[field] === undefined) continue;
    if (onlySelected && !(field in cached)) continue;
    if (cached[field] === next[field]) continue;
    merged ??= { ...cached };
    merged[field] = next[field];
  }
  if (!merged) return rows;
  const out = rows.slice();
  out[index] = merged as unknown as T;
  return out;
}

/**
 * Opens the live-sync channel for one staff user and returns its cleanup.
 * Plain function (no React) so scripts/employer_live_sync.test.mjs can drive
 * it with a fake client and a real QueryClient.
 */
/**
 * A channel's catch-up when it connects. The FIRST time, only what was loaded
 * before this live sync began is refreshed (an earlier visit's cache, which
 * may have missed changes): what loaded since is already as new as the
 * connection. Refreshing it too downloaded the whole dashboard a second time
 * about a second after it first loaded, on every open (the performance
 * check, 2026-10-11). Every later reconnect, and every real change, still
 * refreshes in full.
 */
export function createCatchUpGate(openedAt: number) {
  let first = true;
  let since: number | null = null;
  return {
    /** The channel says SUBSCRIBED. */
    connected() {
      since = first ? openedAt : null;
      first = false;
    },
    /** A row changed: the next round refreshes in full. */
    changed() {
      since = null;
    },
    /** For the round about to run: which queries it may refresh. */
    take(): (query: { state: { dataUpdatedAt: number } }) => boolean {
      const limit = since;
      since = null;
      return (query) => limit == null || query.state.dataUpdatedAt < limit;
    },
  };
}

export function startEmployerLiveSync({
  client,
  queryClient,
  userId,
  instanceId,
  delayMs = LIVE_SYNC_COALESCE_MS,
  timers = defaultTimers,
}: {
  client: LiveSyncClient;
  queryClient: QueryClient;
  userId: string;
  instanceId: string;
  delayMs?: number;
  timers?: Timers;
}) {
  // Each channel's first catch-up spares what loaded after this point.
  const openedAt = Date.now();
  // Set by a change the merged lists cannot take in place, or a catch-up;
  // read and cleared by the round that refetches them.
  let applicationListsStale = false;
  const applicationsGate = createCatchUpGate(openedAt);
  const coalescer = createLiveSyncCoalescer(
    (force) => {
      const lists = applicationListsStale;
      applicationListsStale = false;
      const fresh = applicationsGate.take();
      return Promise.all(
        LIVE_SYNC_QUERY_KEYS.map((queryKey) =>
          queryClient.invalidateQueries(
            { queryKey, predicate: (query) => fresh(query) && (lists || !isMergedListKey(query.queryKey)) },
            { cancelRefetch: force },
          ),
        ),
      );
    },
    delayMs,
    timers,
  );

  const listKey: QueryKey = ["applications", "employer", userId];

  const channel = client
    .channel(`employer-live-${userId}-${instanceId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "applications" },
      (event: ApplicationChange) => {
        // Never the five evaluation columns: NULL on this row since wave 6.
        const payload = withoutEvaluationColumns(event);
        // Only write when something changed: setQueryData bumps the row
        // set's timestamp and re-renders every reader even for a no-op.
        const rows = queryClient.getQueryData<ApplicationWithCandidate[]>(listKey);
        const next = applyApplicationChange(rows, payload);
        if (next !== rows) queryClient.setQueryData(listKey, next);
        // The Applicants list: merged in place, refetched only when it must be.
        for (const [queryKey, held] of queryClient.getQueriesData<SessionRowLike[]>({ queryKey: LIVE_SYNC_LIST_KEYS.applications })) {
          const merged = mergeIntoList(held, payload, queryKey);
          if (merged.rows !== held) queryClient.setQueryData(queryKey, merged.rows);
          if (merged.refetch) applicationListsStale = true;
        }
        applicationsGate.changed();
        coalescer.schedule(true);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        applicationListsStale = true;
        applicationsGate.connected();
        coalescer.schedule(false);
      }
    });

  // ── The test record (assessment_sessions), on a channel of its own. ──
  // Attempts and applications touched since the last round, so only their
  // events refetch; a catch-up round refetches every events query on screen.
  const touchedSessions = new Set<string>();
  const touchedApplications = new Set<string>();
  let catchUp = false;
  let sessionListsStale = false;
  const sessionsGate = createCatchUpGate(openedAt);
  const sessionCoalescer = createLiveSyncCoalescer(
    (force) => {
      const fresh = sessionsGate.take();
      const sessionIds = [...touchedSessions];
      const applicationIds = [...touchedApplications];
      const everything = catchUp;
      const lists = everything || sessionListsStale;
      touchedSessions.clear();
      touchedApplications.clear();
      catchUp = false;
      sessionListsStale = false;
      return Promise.all([
        ...LIVE_SYNC_SESSION_KEYS.map((queryKey) =>
          queryClient.invalidateQueries(
            {
              queryKey,
              // A profile's own attempts only when one of THEIR attempts changed.
              predicate: (query) =>
                fresh(query) &&
                (isApplicationSessionsKey(query.queryKey)
                  ? everything || applicationIds.includes(query.queryKey[2] as string)
                  : lists || !isMergedListKey(query.queryKey)),
            },
            { cancelRefetch: force },
          ),
        ),
        ...(everything
          ? [queryClient.invalidateQueries({ queryKey: LIVE_SYNC_EVENTS_KEY, predicate: fresh }, { cancelRefetch: false })]
          : [
              ...sessionIds.map((id) =>
                queryClient.invalidateQueries({ queryKey: [...LIVE_SYNC_EVENTS_KEY, id] }, { cancelRefetch: force }),
              ),
              ...applicationIds.map((id) =>
                queryClient.invalidateQueries({ queryKey: [...LIVE_SYNC_EVENTS_KEY, "integrity", id] }, { cancelRefetch: force }),
              ),
            ]),
      ]);
    },
    delayMs,
    timers,
  );

  const sessionChannel = client
    .channel(`employer-sessions-${userId}-${instanceId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "assessment_sessions" },
      (payload: ApplicationChange) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: unknown; application_id?: unknown };
        if (typeof row?.id === "string") touchedSessions.add(row.id);
        if (typeof row?.application_id === "string") touchedApplications.add(row.application_id);
        // Merge into every cached list now; write only the ones that changed.
        // The Applicants list's attempts are refetched only when the merge
        // cannot take the change in place (wave 3).
        for (const [queryKey, rows] of queryClient.getQueriesData<SessionRowLike[]>({ queryKey: LIVE_SYNC_SESSION_KEYS[0] })) {
          if (isMergedListKey(queryKey)) {
            const merged = mergeIntoList(rows, payload, queryKey);
            if (merged.rows !== rows) queryClient.setQueryData(queryKey, merged.rows);
            if (merged.refetch) sessionListsStale = true;
            continue;
          }
          const next = applySessionChange(rows, payload);
          if (next !== rows) {
            queryClient.setQueryData(queryKey, next);
            // A DELETE names only the attempt's id: the profile that held it
            // is the one to refresh.
            if (isApplicationSessionsKey(queryKey) && typeof queryKey[2] === "string") touchedApplications.add(queryKey[2]);
          }
        }
        sessionsGate.changed();
        sessionCoalescer.schedule(true);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        catchUp = true;
        sessionsGate.connected();
        sessionCoalescer.schedule(false);
      }
    });

  // ── Booked interviews (public.interviews), on a channel of their own. ──
  // Small queries, keyed under ["interviews"]: refetch the ones on screen.
  const interviewsGate = createCatchUpGate(openedAt);
  const interviewCoalescer = createLiveSyncCoalescer(
    (force) => {
      const fresh = interviewsGate.take();
      return Promise.all(LIVE_SYNC_INTERVIEW_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey, predicate: fresh }, { cancelRefetch: force })));
    },
    delayMs,
    timers,
  );
  const interviewChannel = client
    .channel(`employer-interviews-${userId}-${instanceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "interviews" }, () => {
      interviewsGate.changed();
      interviewCoalescer.schedule(true);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        interviewsGate.connected();
        interviewCoalescer.schedule(false);
      }
    });

  // ── The paperwork (wave 5): requests and documents, a channel each. ──
  const requestsGate = createCatchUpGate(openedAt);
  const requestCoalescer = createLiveSyncCoalescer(
    (force) => {
      const fresh = requestsGate.take();
      return Promise.all(LIVE_SYNC_REQUEST_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey, predicate: fresh }, { cancelRefetch: force })));
    },
    delayMs,
    timers,
  );
  const requestChannel = client
    .channel(`employer-requests-${userId}-${instanceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "document_requests" }, () => {
      requestsGate.changed();
      requestCoalescer.schedule(true);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        requestsGate.connected();
        requestCoalescer.schedule(false);
      }
    });
  const documentsGate = createCatchUpGate(openedAt);
  const documentCoalescer = createLiveSyncCoalescer(
    (force) => {
      const fresh = documentsGate.take();
      return Promise.all(LIVE_SYNC_DOCUMENT_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey, predicate: fresh }, { cancelRefetch: force })));
    },
    delayMs,
    timers,
  );
  const documentChannel = client
    .channel(`employer-documents-${userId}-${instanceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () => {
      documentsGate.changed();
      documentCoalescer.schedule(true);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        documentsGate.connected();
        documentCoalescer.schedule(false);
      }
    });

  // ── Ava's score and the team's notes (wave 6), on a channel of their own. ──
  // Merged in place, by application id, into the employer list and the
  // Applicants lists (their own columns only). No round of its own for a
  // change: the write that made it also updated the application, and that
  // event refreshes the rest. A rejoin (not the first join) refetches in
  // full, lists included, for anything missed while it was down.
  let evaluationsJoined = false;
  const evaluationChannel = client
    .channel(`employer-evaluations-${userId}-${instanceId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "application_evaluations" },
      (payload: ApplicationChange) => {
        const rows = queryClient.getQueryData<ApplicationWithCandidate[]>(listKey);
        const next = applyEvaluationChange(rows, payload);
        if (next !== rows) queryClient.setQueryData(listKey, next);
        for (const [queryKey, held] of queryClient.getQueriesData<SessionRowLike[]>({ queryKey: LIVE_SYNC_LIST_KEYS.applications })) {
          const merged = applyEvaluationChange(held, payload, true);
          if (merged !== held) queryClient.setQueryData(queryKey, merged);
        }
      },
    )
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (!evaluationsJoined) {
        evaluationsJoined = true;
        return;
      }
      // A catch-up round on the applications coalescer, lists included. It
      // uses that channel's gate as it stands (by now its first round has
      // run, so nothing is spared).
      applicationListsStale = true;
      coalescer.schedule(false);
    });

  return () => {
    coalescer.dispose();
    sessionCoalescer.dispose();
    interviewCoalescer.dispose();
    requestCoalescer.dispose();
    documentCoalescer.dispose();
    void client.removeChannel(channel);
    void client.removeChannel(sessionChannel);
    void client.removeChannel(interviewChannel);
    void client.removeChannel(requestChannel);
    void client.removeChannel(documentChannel);
    void client.removeChannel(evaluationChannel);
  };
}

/**
 * Call once per staff shell (see EmployerLiveSync below). Never call it from
 * Sidebar, MobileTabBar, MobileTopBar or a page: those mount more than once.
 */
export function useEmployerLiveSync() {
  const { user, role } = useAuth();
  const { data: mode } = useSchemaMode();
  const queryClient = useQueryClient();
  const instanceId = useId();
  const userId = user?.id;
  // Mounted only by the employer and team-member shells; the role check keeps
  // a candidate session that lands there for a frame from opening a channel.
  // The showcase schema has no live applications table to watch.
  const enabled = !!userId && mode === "hireflow1" && role !== "candidate";

  // Deps are strings and stable objects only. An hourly token refresh hands
  // out a new `user` object; re-running on that would close the channel and
  // reopen the same topic while the old one is still leaving, and realtime-js
  // would hand back the dying channel.
  useEffect(() => {
    if (!enabled || !userId) return;
    return startEmployerLiveSync({ client: supabase, queryClient, userId, instanceId });
  }, [enabled, userId, instanceId, queryClient]);
}

/** Renders nothing; mount it once in each staff layout, beside GlobalNotificationToasts. */
export function EmployerLiveSync(): null {
  useEmployerLiveSync();
  return null;
}
