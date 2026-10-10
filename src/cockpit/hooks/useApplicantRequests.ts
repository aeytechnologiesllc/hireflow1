import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifyDocumentRequested } from "@/utils/emailNotifications";
import { requestKind, requestTitle } from "@/lib/documentRequests";

/**
 * Asking an applicant for documents, and reading what came back
 * (src/lib/documentRequests.ts; docs/DOCUMENT-REQUESTS.md).
 *
 * The rows are document_requests; the database's guards decide what each side
 * may change (supabase/migrations/*_document_requests_safe.sql). A file is
 * opened only through the requested-document-url function, which checks the
 * caller and records the opening.
 */

export interface ApplicantRequest {
  id: string;
  application_id: string;
  candidate_id: string;
  document_type: string;
  custom_document_name: string | null;
  description: string | null;
  due_date: string | null;
  status: string;
  file_url: string | null;
  file_name: string | null;
  answer_text: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  file_deleted_at: string | null;
  created_at: string;
}

const COLUMNS =
  "id, application_id, candidate_id, document_type, custom_document_name, description, due_date, status, file_url, file_name, answer_text, submitted_at, reviewed_at, rejection_reason, file_deleted_at, created_at";

/** Everything asked of one applicant, oldest first. */
export function useApplicantRequests(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: ["applicant-requests", applicationId],
    enabled: !!applicationId,
    staleTime: 15_000,
    queryFn: async (): Promise<ApplicantRequest[]> => {
      const { data, error } = await supabase.from("document_requests").select(COLUMNS).eq("application_id", applicationId!).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ApplicantRequest[];
    },
  });
}

export interface NewRequest {
  documentType: string;
  /** The team's own name for "Something else". */
  customName?: string;
  /** What to send, shown to the applicant (the kind's line, or what the team typed). */
  ask: string;
}

/** The request rows alone: no bell, no email. The database's guard files them under the job's owner. */
export async function insertRequestRows({
  userId,
  applicationId,
  candidateId,
  items,
  note,
  dueDate,
}: {
  userId: string;
  applicationId: string;
  candidateId: string;
  items: NewRequest[];
  note: string;
  dueDate: string | null;
}) {
  const extra = note.trim();
  const rows = items.map((item) => ({
    application_id: applicationId,
    employer_id: userId,
    candidate_id: candidateId,
    document_type: item.documentType,
    custom_document_name: item.customName?.trim() || null,
    description: [item.ask.trim(), extra].filter(Boolean).join("\n\n") || null,
    is_required: true,
    due_date: dueDate,
  }));
  const { error } = await supabase.from("document_requests").insert(rows as never);
  if (error) throw new Error("The request could not be sent. Nothing went out; try again.");
}

/** Sends one or more requests to one applicant: the rows, a note in their bell, one email. */
export function useSendRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ applicationId, candidateId, items, note, dueDate }: { applicationId: string; candidateId: string; items: NewRequest[]; note: string; dueDate: string | null }) => {
      if (!user) throw new Error("Sign in again to send this.");
      if (items.length === 0) throw new Error("Choose at least one thing to ask for.");
      await insertRequestRows({ userId: user.id, applicationId, candidateId, items, note, dueDate });

      // From here the requests exist; telling them must not fail the send.
      const what = items.length === 1 ? requestTitle({ document_type: items[0].documentType, custom_document_name: items[0].customName }) : `${items.length} documents`;
      try {
        await supabase.from("notifications").insert({
          user_id: candidateId,
          type: "system",
          title: "Documents requested",
          message: items.length === 1 ? `Please send your ${what.toLowerCase()}.` : `Please send ${what}.`,
          link: "/my-documents",
          is_read: false,
        } as never);
      } catch {
        // The email says the same.
      }
      let companyName: string | undefined;
      try {
        const { data: me } = await supabase.from("profiles").select("company_name").eq("user_id", user.id).maybeSingle();
        companyName = (me?.company_name ?? "").trim() || undefined;
      } catch {
        companyName = undefined;
      }
      void notifyDocumentRequested(candidateId, what, companyName, applicationId);
      return { count: items.length };
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["applicant-requests", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
    },
  });
}

/** Approve what they sent, or ask for it again with a reason. */
export function useReviewRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ request, approve, reason }: { request: ApplicantRequest; approve: boolean; reason?: string }) => {
      const { error } = await supabase
        .from("document_requests")
        // reviewed_at is set by the database's guard either way; sent too so
        // the page reads the same before the row comes back.
        .update((approve ? { status: "approved", reviewed_at: new Date().toISOString() } : { status: "rejected", reviewed_at: new Date().toISOString(), rejection_reason: (reason ?? "").trim().slice(0, 300) || null }) as never)
        .eq("id", request.id);
      if (error) throw new Error(approve ? "It could not be approved. Try again." : "It could not be sent back. Try again.");
      if (!approve) {
        try {
          await supabase.from("notifications").insert({
            user_id: request.candidate_id,
            type: "system",
            title: "Please send it again",
            message: `Your ${requestTitle(request).toLowerCase()} needs to be sent again.${reason?.trim() ? ` ${reason.trim()}` : ""}`,
            link: "/my-documents",
            is_read: false,
          } as never);
        } catch {
          // Their documents page shows it either way.
        }
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["applicant-requests", variables.request.application_id] });
    },
  });
}

/** A five-minute link to the file they sent, through the function that checks and records it. */
export async function openRequestFile(requestId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("requested-document-url", { body: { requestId } });
  const url = (data as { signedUrl?: string } | null)?.signedUrl;
  if (error || !url) throw new Error("That file could not be opened. Try again.");
  return url;
}

/** Whether a request is answered by typing (a TIN, a payment email) rather than a file. */
export const isTypedAnswer = (request: { document_type: string }) => requestKind(request.document_type).answer === "text";
