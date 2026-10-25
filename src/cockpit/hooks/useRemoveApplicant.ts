import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Delete their information" (docs/LAUNCH-PLAN.md, Phase 5, task 3): the
 * remove-applicant function deletes one application and everything of it
 * (files included) for the job's business, when the owner or a teammate who
 * manages applicants asks. The applicant's own account and their messages
 * stay. Nothing here decides who may: the function and the database do.
 */
export function useRemoveApplicant() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const remove = useCallback(
    async (applicationId: string, reason?: string | null): Promise<boolean> => {
      setBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("remove-applicant", { body: { applicationId, reason: reason?.trim() || null } });
        if (error || !(data as { ok?: boolean } | null)?.ok) {
          // The function's own words when it refused (403, 404), else a plain retry.
          let said: string | null = null;
          try {
            const body = await (error as { context?: { json?: () => Promise<unknown> } } | null)?.context?.json?.();
            said = typeof (body as { error?: unknown } | null)?.error === "string" ? (body as { error: string }).error : null;
          } catch {
            said = null;
          }
          toast.error(said ?? "Their information could not be deleted just now. Try again in a moment.");
          return false;
        }
        toast.success("Their information is deleted.");
        // Every list and count that showed them.
        await queryClient.invalidateQueries();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [queryClient],
  );

  return { remove, busy };
}
