import { useEffect, useId } from "react";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";

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
 * Opens the live-sync channel for one staff user and returns its cleanup.
 * Plain function (no React) so scripts/employer_live_sync.test.mjs can drive
 * it with a fake client and a real QueryClient.
 */
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
  const coalescer = createLiveSyncCoalescer(
    (force) =>
      Promise.all(
        LIVE_SYNC_QUERY_KEYS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }, { cancelRefetch: force }),
        ),
      ),
    delayMs,
    timers,
  );

  const listKey: QueryKey = ["applications", "employer", userId];

  const channel = client
    .channel(`employer-live-${userId}-${instanceId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "applications" },
      (payload: ApplicationChange) => {
        // Only write when something changed: setQueryData bumps the row
        // set's timestamp and re-renders every reader even for a no-op.
        const rows = queryClient.getQueryData<ApplicationWithCandidate[]>(listKey);
        const next = applyApplicationChange(rows, payload);
        if (next !== rows) queryClient.setQueryData(listKey, next);
        coalescer.schedule(true);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") coalescer.schedule(false);
    });

  // ── The test record (assessment_sessions), on a channel of its own. ──
  // Attempts and applications touched since the last round, so only their
  // events refetch; a catch-up round refetches every events query on screen.
  const touchedSessions = new Set<string>();
  const touchedApplications = new Set<string>();
  let catchUp = false;
  const sessionCoalescer = createLiveSyncCoalescer(
    (force) => {
      const sessionIds = [...touchedSessions];
      const applicationIds = [...touchedApplications];
      const everything = catchUp;
      touchedSessions.clear();
      touchedApplications.clear();
      catchUp = false;
      return Promise.all([
        ...LIVE_SYNC_SESSION_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }, { cancelRefetch: force })),
        ...(everything
          ? [queryClient.invalidateQueries({ queryKey: LIVE_SYNC_EVENTS_KEY }, { cancelRefetch: false })]
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
        for (const [queryKey, rows] of queryClient.getQueriesData<SessionRowLike[]>({ queryKey: LIVE_SYNC_SESSION_KEYS[0] })) {
          const next = applySessionChange(rows, payload);
          if (next !== rows) queryClient.setQueryData(queryKey, next);
        }
        sessionCoalescer.schedule(true);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        catchUp = true;
        sessionCoalescer.schedule(false);
      }
    });

  return () => {
    coalescer.dispose();
    sessionCoalescer.dispose();
    void client.removeChannel(channel);
    void client.removeChannel(sessionChannel);
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
