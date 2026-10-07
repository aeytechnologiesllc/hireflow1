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
export function useBulkPass() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const passMany = useCallback(
    async (targets: readonly PassTarget[]): Promise<BulkPassResult> => {
      const result: BulkPassResult = { total: targets.length, passed: 0, emailed: 0, moved: 0, failed: 0, stopped: false };
      let failuresInARow = 0;
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
            if (!Array.isArray(data) || data.length === 0) {
              // Nothing changed: it had moved on since it was picked.
              result.moved += 1;
              failuresInARow = 0;
              continue;
            }
            result.passed += 1;
            failuresInARow = 0;
            if (target.candidateId) {
              const emailed = await notifyStatusRejected(target.candidateId, target.jobTitle || "Position");
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
