import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifyStatusHired } from "@/utils/emailNotifications";
import { insertRequestRows, type NewRequest } from "./useApplicantRequests";

/**
 * Hire, and ask for documents in the same email (docs/DOCUMENT-REQUESTS.md,
 * "Hiring").
 *
 * The owner, 2026-10-10: "We also need to make sure we're not dual click on
 * hiring her. When I say hire, she will actually get a nice congratulations
 * email and it will say things like documents requested, please log in to
 * your HireFlow to submit those documentation and sign stuff."
 *
 * One press: the application becomes hired ONLY if it is not hired already
 * (a conditional update, so a second press, a second tab or a retry changes
 * nothing and sends nothing), then the documents ticked are asked for, then
 * ONE welcome email goes. The email function lists what is really waiting on
 * the application (an unsigned offer letter, the documents just asked for),
 * so it is the same list the dialog showed. The applicant's bell
 * ("Congratulations! You're hired") is the database's own trigger.
 */

export type OfferLetterState =
  | { kind: "none" }
  | { kind: "unsigned"; sentAt: string }
  | { kind: "signed"; signedAt: string }
  | { kind: "withdrawn" };

/** Where this applicant's newest offer letter stands. */
export function useOfferLetterState(applicationId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["offer-letter-state", applicationId],
    enabled: enabled && !!applicationId,
    staleTime: 15_000,
    queryFn: async (): Promise<OfferLetterState> => {
      const { data, error } = await supabase
        .from("documents")
        .select("status, candidate_signed_at, is_voided, created_at")
        .eq("application_id", applicationId!)
        .eq("document_type", "offer_letter")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const letter = (data ?? [])[0] as { status?: string | null; candidate_signed_at?: string | null; is_voided?: boolean | null; created_at: string } | undefined;
      if (!letter) return { kind: "none" };
      if (letter.is_voided) return { kind: "withdrawn" };
      if (letter.candidate_signed_at) return { kind: "signed", signedAt: letter.candidate_signed_at };
      if (letter.status === "pending") return { kind: "unsigned", sentAt: letter.created_at };
      return { kind: "withdrawn" };
    },
  });
}

export interface HireResult {
  /** They were hired already (a second press): nothing changed, nothing was sent. */
  already: boolean;
  /** How many documents were asked for. */
  asked: number;
  /** The hire went through but the documents could not be asked for. */
  askFailed: boolean;
}

export function useHireWithDocuments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // A second automatic try is exactly the double send this exists to stop.
    retry: false,
    mutationFn: async ({
      applicationId,
      candidateId,
      jobTitle,
      items,
      dueDate,
    }: {
      applicationId: string;
      candidateId: string;
      jobTitle: string;
      items: NewRequest[];
      dueDate: string | null;
    }): Promise<HireResult> => {
      if (!user) throw new Error("Sign in again to do this.");

      // Hired once. Someone already hired (or declined) is not touched.
      const { data: moved, error } = await supabase
        .from("applications")
        .update({ status: "hired" } as never)
        .eq("id", applicationId)
        .not("status", "in", "(hired,rejected)")
        .select("id");
      if (error) throw new Error("Hiring did not go through. Nothing was sent; try again.");
      if (!moved || moved.length === 0) return { already: true, asked: 0, askFailed: false };

      // From here they are hired; what follows must not undo that.
      let asked = 0;
      let askFailed = false;
      if (items.length > 0) {
        try {
          await insertRequestRows({ userId: user.id, applicationId, candidateId, items, note: "", dueDate });
          asked = items.length;
        } catch {
          askFailed = true;
        }
      }
      // After the requests, so the welcome email lists them.
      void notifyStatusHired(candidateId, jobTitle, undefined, applicationId);
      return { already: false, asked, askFailed };
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      queryClient.invalidateQueries({ queryKey: ["applicant-requests", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["offer-people"] });
    },
  });
}

/** When this applicant's interview with the team was held, or null if none is done yet. */
export function useInterviewDone(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: ["interview-done", applicationId],
    enabled: !!applicationId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ at: string | null } | null> => {
      const { data, error } = await supabase
        .from("interviews")
        .select("scheduled_at, updated_at")
        .eq("application_id", applicationId!)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false })
        .limit(1);
      if (error) return null;
      const row = (data ?? [])[0] as { scheduled_at?: string | null; updated_at?: string | null } | undefined;
      return row ? { at: row.scheduled_at ?? row.updated_at ?? null } : null;
    },
  });
}
