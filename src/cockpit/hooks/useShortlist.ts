import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { isRecordNotDeployed } from "./useAssessmentSessions";
import { SHORTLIST_COLUMNS, SHORTLIST_PRIVATE_LINE, shortlistDoneWords, shortlistIndex, type ShortlistEntry } from "../lib/shortlist";

/**
 * The hiring team's shortlist, the staff side (lib/shortlist.ts;
 * supabase/migrations/*_shortlisted_applications.sql).
 *
 * The list is read under RLS: the job's owner and its active team members see
 * their jobs' entries, nobody else sees any (the applicant least of all). It
 * is small (one id per marked application) and is not part of the shell's
 * live sync: a mark writes nothing to the application, so no realtime event
 * comes for it. A teammate's change reaches an open page within a minute
 * (the query refetches on that clock while the window is in view), on
 * refocus, and whenever the page is opened.
 *
 * A change goes through the set_applications_shortlisted function and nothing
 * else. It is deliberately nowhere near useUpdateApplication: that hook's
 * status write is what emails the candidate, and a shortlist tells the
 * candidate nothing.
 *
 * Until the migration is applied the table and the function do not exist:
 * the list reads that as "nobody shortlisted", and the action says it is not
 * switched on yet, never an error card on a page that worked yesterday.
 */

export const shortlistKeys = {
  list: (uid: string | null | undefined) => ["shortlist", uid ?? null] as const,
};

interface ShortlistList {
  rows: ShortlistEntry[];
  /** False when the table is not there yet (the migration is not applied). */
  deployed: boolean;
}

const NONE: ShortlistList = { rows: [], deployed: true };

export function useShortlist() {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();
  const query = useQuery({
    queryKey: shortlistKeys.list(user?.id),
    queryFn: async (): Promise<ShortlistList> => {
      const { data, error } = await supabase
        .from("shortlisted_applications")
        .select(SHORTLIST_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(10_000);
      if (error) {
        if (isRecordNotDeployed(error)) return { rows: [], deployed: false };
        throw error;
      }
      return { rows: (data ?? []) as ShortlistEntry[], deployed: true };
    },
    enabled: !!user && mode === "hireflow1",
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const data = query.data ?? NONE;
  const ids = useMemo(() => shortlistIndex(data.rows), [data.rows]);
  return {
    /** Which applications are marked, by application id. */
    ids,
    deployed: data.deployed,
    /** Only the first load: a failed one leaves nobody marked, never the list. */
    isLoading: query.isLoading && !query.isError,
    isError: query.isError,
  };
}

/** One applicant to mark: the application, and a name for the toast. */
export interface ShortlistTarget {
  applicationId: string;
  name: string;
}

type RpcError = { code?: string | null; message?: string | null } | null | undefined;

/** Put these applicants on the shortlist (`on`), or take them off. `quiet`
 *  says nothing when it works (the Undo of a toast that already said it). */
type SetShortlisted = (targets: readonly ShortlistTarget[], on: boolean, options?: { quiet?: boolean }) => Promise<boolean>;

function failureWords(error: RpcError, many: boolean): string {
  if (isRecordNotDeployed(error)) return "The shortlist isn't switched on yet.";
  if (error?.code === "42501") return many ? "You can't change the shortlist for these applicants." : "You can't change the shortlist for this applicant.";
  return "Couldn't update your shortlist. Try again.";
}

export function useShortlistActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // The same array from one render to the next (see useApplicantViews: a key built
  // afresh each render once made a page write to the server ten times a second).
  const uid = user?.id;
  const key = useMemo(() => shortlistKeys.list(uid), [uid]);

  /** The cached list with these applications on it, or off it. */
  const apply = useCallback(
    (ids: readonly string[], on: boolean) => {
      queryClient.setQueryData<ShortlistList>(key, (was) => {
        const before = was ?? NONE;
        const have = new Set(before.rows.map((r) => r.application_id));
        if (on) {
          const now = new Date().toISOString();
          const added = ids.filter((id) => !have.has(id)).map((id): ShortlistEntry => ({ application_id: id, added_by: user?.id ?? null, created_at: now }));
          return added.length > 0 ? { ...before, rows: [...added, ...before.rows] } : before;
        }
        const gone = new Set(ids);
        const rows = before.rows.filter((r) => !gone.has(r.application_id));
        return rows.length === before.rows.length ? before : { ...before, rows };
      });
    },
    [queryClient, key, user?.id],
  );

  const mutation = useMutation({
    mutationFn: async ({ ids, on }: { ids: readonly string[]; on: boolean }) => {
      const { data, error } = await supabase.rpc("set_applications_shortlisted", { p_application_ids: [...ids], p_shortlisted: on });
      if (error) throw error;
      const result = (data ?? {}) as { done?: string[]; skipped?: string[] };
      return { done: result.done ?? [], skipped: result.skipped ?? [] };
    },
    // On the click, not on the round trip.
    onMutate: async ({ ids, on }) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      apply(ids, on);
    },
    // One the caller may not decide on was left as it was: so is its mark.
    onSuccess: ({ skipped }, { on }) => {
      if (skipped.length > 0) apply(skipped, !on);
    },
    onError: (_error, { ids, on }) => {
      apply(ids, !on);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
    },
  });
  const { mutateAsync } = mutation;

  /**
   * Put these applicants on the shortlist (`on`), or take them off. Resolves
   * true when every one was changed. Nothing is sent to the applicant.
   */
  const setShortlisted: SetShortlisted = useCallback(
    async (targets, on, options) => {
      const unique = [...new Map(targets.map((t) => [t.applicationId, t] as const)).values()];
      if (unique.length === 0) return true;
      const many = unique.length > 1;
      try {
        const { done, skipped } = await mutateAsync({ ids: unique.map((t) => t.applicationId), on });
        if (done.length === 0) {
          toast.error(failureWords({ code: "42501" }, many));
          return false;
        }
        if (!options?.quiet) {
          const changed = unique.filter((t) => done.includes(t.applicationId));
          const left = skipped.length > 0 ? `${skipped.length} you can't decide on ${skipped.length === 1 ? "was" : "were"} left as ${skipped.length === 1 ? "it was" : "they were"}.` : null;
          toast.success(shortlistDoneWords(changed.map((t) => t.name), on), {
            description: left ?? (on ? SHORTLIST_PRIVATE_LINE : undefined),
            // Taking someone off is one click, so putting them back is too.
            action: on ? undefined : { label: "Undo", onClick: () => void setShortlisted(changed, true, { quiet: true }) },
          });
        }
        return skipped.length === 0;
      } catch (error) {
        console.error("[set_applications_shortlisted]", error);
        toast.error(failureWords(error as RpcError, many));
        return false;
      }
    },
    [mutateAsync],
  );

  return { setShortlisted, busy: mutation.isPending };
}
