import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifyStatusRejected } from "@/utils/emailNotifications";
import { BULK_PASS_STOP_AFTER, PASSABLE_STATUSES, passUpdate, type BulkPassResult, type PassTarget } from "../lib/bulkPass";

/**
 * Passing on several applicants at once (lib/bulkPass.ts).
 *
 * One person at a time, in the order they were picked: the application is
 * declined, then the polite note is emailed and waited for, then the next.
 * So at any moment everyone handled so far is fully handled (declined AND
 * told), the notes leave at a pace the mail service accepts, and the outcome
 * can say truthfully how many were emailed.
 *
 * It deliberately does not go through useUpdateApplication: that hook sends
 * its email without waiting, so two dozen would leave in one burst with no
 * way to know which arrived. What is written is the single Pass's own fields
 * (passUpdate), and only on an application still being decided on: one that
 * moved to an offer, a hire or a decline since it was picked is left alone.
 * The in-app bell is the database's own trigger, as on a single Pass.
 */

/** After a Pass that changed nothing: is this application still one a Pass may change? */
async function stillUndecided(applicationId: string): Promise<boolean> {
  const { data } = await supabase.from("applications").select("status").eq("id", applicationId).maybeSingle();
  const status = (data as { status?: string } | null)?.status;
  return !!status && (PASSABLE_STATUSES as readonly string[]).includes(status);
}

export function useBulkPass() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const passMany = useCallback(
    async (targets: readonly PassTarget[]): Promise<BulkPassResult> => {
      const result: BulkPassResult = { total: targets.length, passed: 0, emailed: 0, moved: 0, refused: 0, failed: 0, stopped: false };
      let failuresInARow = 0;
      let refusedAt = -1;
      try {
        for (let i = 0; i < targets.length; i += 1) {
          const target = targets[i];
          setProgress({ done: i, total: targets.length });
          try {
            const { data, error } = await supabase
              .from("applications")
              .update(passUpdate(user?.id ?? null) as never)
              .eq("id", target.applicationId)
              .in("status", [...PASSABLE_STATUSES] as never)
              .select("id");
            if (error) throw error;
            // Nothing changed: it had moved on since it was picked, or the
            // database refused (a team role without Manage pipeline changes
            // nothing and says nothing). Still undecided means refused, and
            // then so is everyone after it: the rest are left as they are.
            if (!Array.isArray(data) || data.length === 0) {
              if (await stillUndecided(target.applicationId)) { refusedAt = i; break; }
              result.moved += 1;
              failuresInARow = 0;
              continue;
            }
            result.passed += 1;
            failuresInARow = 0;
            if (target.candidateId) {
              const emailed = await notifyStatusRejected(target.candidateId, target.jobTitle || "Position", undefined, target.applicationId);
              if (emailed === "sent") result.emailed += 1;
            }
          } catch (error) {
            console.error("[bulk pass] could not pass on", target.applicationId, error);
            result.failed += 1;
            failuresInARow += 1;
            if (failuresInARow >= BULK_PASS_STOP_AFTER) {
              result.stopped = true;
              break;
            }
          }
        }
        if (refusedAt >= 0) result.refused = targets.length - refusedAt;
      } finally {
        setProgress(null);
        queryClient.invalidateQueries({ queryKey: ["applications"] });
        queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      }
      return result;
    },
    [user?.id, queryClient],
  );

  return { passMany, progress, busy: progress != null };
}
