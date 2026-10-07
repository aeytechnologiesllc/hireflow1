import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { isRecordNotDeployed } from "./useAssessmentSessions";
import { LIVE_SYNC_LIST_KEYS } from "./useEmployerLiveSync";
import { BLOCKED_COLUMNS, blockedIndex, type BlockedApplicant } from "../lib/blockedApplicants";
import type { ApplicantListApp } from "../lib/applicantList";

/**
 * Remove and block, the staff side (lib/blockedApplicants.ts;
 * supabase/migrations/20261007022249_block_applicants.sql).
 *
 * The block list is read under RLS: the employer and its active team members
 * see their own employer's blocks, nobody else sees any. Its key sits under
 * ["applications"] on purpose: a block is a write to the application (it is
 * rejected and stamped), and the shell's live sync refetches every
 * ["applications"] query on such a write, so a teammate's block reaches every
 * open list without a channel of its own.
 *
 * Blocking goes through the block_applicants RPC and nothing else. It never
 * goes near useUpdateApplication: that hook's status write is what sends the
 * candidate the rejection email (notifyStatusRejected), and a block tells the
 * candidate nothing (the database's own bell and push are skipped too).
 *
 * Until the migration is applied the table and the functions do not exist:
 * the list reads that as "nobody blocked", and the action says it is not
 * switched on yet, never an error card on a page that worked yesterday.
 */

export const blockedKeys = {
  list: (uid: string | null | undefined) => ["applications", "blocked", uid ?? null] as const,
};

interface BlockedList {
  rows: BlockedApplicant[];
  /** False when the table is not there yet (the migration is not applied). */
  deployed: boolean;
}

const NONE: BlockedList = { rows: [], deployed: true };

export function useBlockedApplicants() {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();
  const query = useQuery({
    queryKey: blockedKeys.list(user?.id),
    queryFn: async (): Promise<BlockedList> => {
      const { data, error } = await supabase
        .from("blocked_applicants")
        .select(BLOCKED_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(10_000);
      if (error) {
        if (isRecordNotDeployed(error)) return { rows: [], deployed: false };
        throw error;
      }
      return { rows: (data ?? []) as BlockedApplicant[], deployed: true };
    },
    enabled: !!user && mode === "hireflow1",
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const data = query.data ?? NONE;
  const blocked = useMemo(() => blockedIndex(data.rows), [data.rows]);
  return {
    /** Who is blocked, by candidate id. */
    blocked,
    rows: data.rows,
    deployed: data.deployed,
    /** Only the first load: a failed one leaves nobody hidden, never the list. */
    isLoading: query.isLoading && !query.isError,
    isError: query.isError,
  };
}

/** One applicant to act on: the application, and the person behind it. */
export interface BlockTarget {
  applicationId: string;
  candidateId: string | null;
  name: string;
}

type RpcError = { code?: string | null; message?: string | null } | null | undefined;

/** The applications a block closes besides the one clicked (block_applicant). */
const OPEN_STATUSES: ReadonlySet<string> = new Set(["in_progress", "pending", "reviewing"]);

function blockFailureWords(error: RpcError, many: boolean): string {
  if (isRecordNotDeployed(error)) return "Remove and block isn't switched on yet.";
  if (error?.code === "42501") return many ? "You can't decide on these applicants." : "You can't decide on this applicant.";
  return "Couldn't remove and block them. Try again.";
}

export function useApplicantBlockActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = blockedKeys.list(user?.id);

  // Just the block list: the applications themselves change through the live
  // sync's in-place merge. Invalidating every ["applications"] query here
  // would re-download the whole list for one click.
  const refreshBlocked = useCallback(() => queryClient.invalidateQueries({ queryKey: key, exact: true }), [queryClient, key]);

  /**
   * The list's applications as the block leaves them, on the click: each one
   * clicked is rejected, and so is every other OPEN application (in_progress,
   * pending, reviewing) of the same person on the list, exactly as
   * block_applicant closes them. Only a closed application of a blocked
   * person sits on the Blocked tab (markBlocked), so without this the rows
   * would wait for their realtime UPDATEs before leaving. The live sync then
   * merges the server's own rows over these. Returns, per clicked
   * application, the statuses it replaced, to put back.
   */
  const markRejected = useCallback(
    (targets: readonly BlockTarget[]): Map<string, Map<string, string | null | undefined>> => {
      const byTarget = new Map<string, Map<string, string | null | undefined>>();
      const clicked = new Map(targets.map((t) => [t.applicationId, t] as const));
      const people = new Map(targets.filter((t) => t.candidateId).map((t) => [t.candidateId!, t.applicationId] as const));
      queryClient.setQueriesData<ApplicantListApp[]>({ queryKey: LIVE_SYNC_LIST_KEYS.applications }, (rows) => {
        if (!Array.isArray(rows)) return rows;
        let changed = false;
        const next = rows.map((r) => {
          if (r.status === "rejected") return r;
          const owner = clicked.has(r.id)
            ? r.id
            : r.candidate_id && OPEN_STATUSES.has(r.status ?? "")
              ? people.get(r.candidate_id)
              : undefined;
          if (!owner) return r;
          const was = byTarget.get(owner) ?? new Map<string, string | null | undefined>();
          was.set(r.id, r.status);
          byTarget.set(owner, was);
          changed = true;
          return { ...r, status: "rejected" };
        });
        return changed ? next : rows;
      });
      return byTarget;
    },
    [queryClient],
  );
  /** Puts back what markRejected replaced (for the clicked applications in
   *  `only`, or all of it), where nothing has changed it since. */
  const unmarkRejected = useCallback(
    (byTarget: ReadonlyMap<string, ReadonlyMap<string, string | null | undefined>>, only?: ReadonlySet<string>) => {
      const was = new Map<string, string | null | undefined>();
      for (const [target, statuses] of byTarget) if (!only || only.has(target)) for (const [id, status] of statuses) was.set(id, status);
      if (was.size === 0) return;
      queryClient.setQueriesData<ApplicantListApp[]>({ queryKey: LIVE_SYNC_LIST_KEYS.applications }, (rows) => {
        if (!Array.isArray(rows)) return rows;
        let changed = false;
        const next = rows.map((r) => {
          if (!was.has(r.id) || r.status !== "rejected") return r;
          changed = true;
          return { ...r, status: was.get(r.id) ?? null };
        });
        return changed ? next : rows;
      });
    },
    [queryClient],
  );

  const blockMutation = useMutation({
    mutationFn: async ({ targets, reason }: { targets: readonly BlockTarget[]; reason?: string }) => {
      const ids = [...new Set(targets.map((t) => t.applicationId))];
      const { data, error } = await supabase.rpc("block_applicants", {
        p_application_ids: ids,
        p_reason: reason?.trim() ? reason.trim() : null,
      });
      if (error) throw error;
      const result = (data ?? {}) as { blocked?: string[]; skipped?: string[] };
      return { blocked: result.blocked ?? [], skipped: result.skipped ?? [] };
    },
    // Off the list at once: the row leaves on the click, not on the round trip.
    onMutate: async ({ targets }) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const rejected = markRejected(targets);
      const before = queryClient.getQueryData<BlockedList>(key);
      const have = new Set((before?.rows ?? []).map((r) => r.candidate_id));
      const now = new Date().toISOString();
      const added: BlockedApplicant[] = [];
      for (const t of targets) {
        if (t.candidateId && !have.has(t.candidateId)) {
          have.add(t.candidateId);
          added.push({ candidate_id: t.candidateId, blocked_by: user?.id ?? null, created_at: now });
        }
      }
      if (added.length > 0) {
        queryClient.setQueryData<BlockedList>(key, { rows: [...added, ...(before?.rows ?? [])], deployed: before?.deployed ?? true });
      }
      return { before, rejected };
    },
    onSuccess: ({ skipped }, _vars, context) => {
      // One the caller may not decide on was left as it was: so is its row.
      if (context && skipped.length > 0) unmarkRejected(context.rejected, new Set(skipped));
    },
    onError: (_error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
      if (context) unmarkRejected(context.rejected);
    },
    onSettled: () => {
      void refreshBlocked();
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async ({ target }: { target: BlockTarget }) => {
      if (!target.candidateId) throw new Error("No applicant to unblock");
      const { data, error } = await supabase.rpc("unblock_applicant", { p_candidate_id: target.candidateId });
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },
    onMutate: async ({ target }) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const before = queryClient.getQueryData<BlockedList>(key);
      if (before) {
        queryClient.setQueryData<BlockedList>(key, { ...before, rows: before.rows.filter((r) => r.candidate_id !== target.candidateId) });
      }
      return { before };
    },
    onError: (_error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
    },
    onSettled: () => {
      void refreshBlocked();
    },
  });

  /** Remove and block one or many. Resolves true when every one was blocked. */
  const block = useCallback(
    async (targets: readonly BlockTarget[], reason?: string): Promise<boolean> => {
      if (targets.length === 0) return true;
      const many = targets.length > 1;
      try {
        const { blocked, skipped } = await blockMutation.mutateAsync({ targets, reason });
        if (blocked.length === 0) {
          toast.error(blockFailureWords({ code: "42501" }, many));
          return false;
        }
        const one = targets.find((t) => t.applicationId === blocked[0]);
        toast.success(blocked.length === 1 && one ? `${one.name} removed and blocked` : `${blocked.length} applicants removed and blocked`, {
          description:
            skipped.length > 0
              ? `${skipped.length} you can't decide on ${skipped.length === 1 ? "was" : "were"} left as ${skipped.length === 1 ? "it was" : "they were"}.`
              : "They're under Blocked if you change your mind.",
        });
        return skipped.length === 0;
      } catch (error) {
        console.error("[block_applicants]", error);
        toast.error(blockFailureWords(error as RpcError, many));
        return false;
      }
    },
    [blockMutation],
  );

  /** Unblock one person. Their application stays declined. */
  const unblock = useCallback(
    async (target: BlockTarget): Promise<boolean> => {
      try {
        const removed = await unblockMutation.mutateAsync({ target });
        if (removed === 0) {
          toast.error("Couldn't unblock them: you may not have permission to.");
          return false;
        }
        toast.success(`${target.name} unblocked`, { description: "They can apply again. Their application stays declined." });
        return true;
      } catch (error) {
        console.error("[unblock_applicant]", error);
        toast.error(isRecordNotDeployed(error as RpcError) ? "Remove and block isn't switched on yet." : "Couldn't unblock them. Try again.");
        return false;
      }
    },
    [unblockMutation],
  );

  return {
    block,
    unblock,
    busy: blockMutation.isPending || unblockMutation.isPending,
  };
}
