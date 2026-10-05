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
 * W3 adds `assessment_sessions`: bind it here, before subscribe(), once that
 * table exists AND is in the supabase_realtime publication. Binding a table
 * that does not exist fails the whole channel.
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

  return () => {
    coalescer.dispose();
    void client.removeChannel(channel);
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
