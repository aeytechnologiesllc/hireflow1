import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateApplication } from "@/hooks/useApplications";
import { resolveEmployerIdForJobAccess } from "@/hooks/useJobs";
import { isNoRowChanged, isRefused, teamRoleCant } from "@/lib/teamPermissions";
import { generateV1Hash } from "@/lib/documentHash";
import { notifyDocumentSent } from "@/utils/emailNotifications";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  cleanFields,
  encodeDocumentBody,
  offerDocumentBody,
  offerExpiry,
  offerLetterName,
  offerLetterText,
  offerProblems,
  payPartsFromJob,
  type OfferLetterFields,
  type PayPer,
} from "../lib/offerLetter";

/**
 * The plain offer letter's two server halves (lib/offerLetter.ts;
 * docs/OFFER-LETTER.md): who an offer can go to, and sending one.
 *
 * Sending is the signing engine's own way in, the one the old document
 * screens used: a `documents` row waiting on the applicant, its first audit
 * line, a note in their bell, and the "document to sign" email. Nothing about
 * signing, countersigning or the locked copy is done here. The one thing
 * added: the applicant moves to Offer, so the letter and the pipeline never
 * disagree about whether an offer is out.
 */

export interface OfferPerson {
  applicationId: string;
  candidateId: string;
  name: string;
  email: string;
  /** "interview", "reviewing" or "offered". */
  status: string;
  jobId: string;
  jobTitle: string;
  /** The job's pay as the screen's boxes, when the job states one figure a month, a week or an hour. */
  jobPay: { payAmount: string; payCurrency: string; payPer: PayPer } | null;
  /** The job is done from home. */
  jobRemote: boolean;
  /** The job's own type ("full-time", "part-time", "contract"…), when it has one. */
  jobType: string | null;
}

/** The stages an offer can go out from, the likeliest first. */
const OFFER_STAGES = ["interview", "offered", "reviewing"];

/**
 * Everyone an offer could go to: interviewed first, then people still in
 * review. Document requests also reach people already hired.
 *
 * The business's jobs, not the signed-in person's: a team member's own id
 * owns no job, so the list was always empty for them and no offer, file to
 * sign or request for papers could ever be sent. Row-level security keeps a
 * team member to the jobs they are assigned.
 */
export function useOfferPeople(enabled: boolean, stages: readonly string[] = OFFER_STAGES) {
  const { user, role, isTeamMember } = useAuth();
  return useQuery({
    queryKey: ["offer-people", user?.id, !!isTeamMember, stages.join(",")],
    enabled: enabled && !!user && (role === "employer" || !!isTeamMember),
    staleTime: 30_000,
    queryFn: async (): Promise<OfferPerson[]> => {
      const employerId = await resolveEmployerIdForJobAccess(user!.id, !!isTeamMember);
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id, title, salary_min, salary_max, salary_currency, salary_period, is_remote, job_type")
        .eq("employer_id", employerId);
      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return [];
      const jobById = new Map(jobs.map((job) => [job.id, job]));

      const { data: applications, error: appsError } = await supabase
        .from("applications")
        .select("id, candidate_id, job_id, status, updated_at")
        .in("job_id", [...jobById.keys()])
        .in("status", stages as never[]);
      if (appsError) throw appsError;
      if (!applications || applications.length === 0) return [];

      const candidateIds = [...new Set(applications.map((a) => a.candidate_id))];
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", candidateIds);
      if (profilesError) throw profilesError;
      const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      return applications
        .map((application) => {
          const job = jobById.get(application.job_id);
          const profile = profileById.get(application.candidate_id);
          return {
            applicationId: application.id,
            candidateId: application.candidate_id,
            name: (profile?.full_name ?? "").trim() || "Applicant",
            email: profile?.email ?? "",
            status: String(application.status),
            jobId: application.job_id,
            jobTitle: job?.title ?? "",
            jobPay: payPartsFromJob(job),
            jobRemote: job?.is_remote !== false,
            jobType: job?.job_type ?? null,
          };
        })
        .sort((a, b) => stages.indexOf(a.status) - stages.indexOf(b.status) || a.name.localeCompare(b.name));
    },
  });
}

export interface SentOffer {
  documentId: string;
  /** False when the letter went but the applicant could not be moved to Offer. */
  moved: boolean;
  /** Not moved because the sender's team role may not move applicants (Manage pipeline is off). */
  moveRefused?: boolean;
}

/** Sends the letter for signing. Throws with words he can read when it cannot. */
export function useSendOfferLetter() {
  const { user, isTeamMember } = useAuth();
  const queryClient = useQueryClient();
  const updateApplication = useUpdateApplication();

  return useMutation({
    // A second automatic try could send the letter twice.
    retry: false,
    mutationFn: async ({ person, fields }: { person: OfferPerson; fields: OfferLetterFields }): Promise<SentOffer> => {
      if (!user) throw new Error("Sign in again to send this.");
      const problems = offerProblems(fields);
      if (problems.length > 0) throw new Error(problems[0].text);

      const content = offerLetterText(fields);
      const name = offerLetterName(fields);
      const expires = offerExpiry(cleanFields(fields).replyBy);
      const hash = await generateV1Hash(content);

      const { data: document, error } = await supabase
        .from("documents")
        .insert({
          application_id: person.applicationId,
          name,
          document_type: "offer_letter",
          file_url: encodeDocumentBody(offerDocumentBody(fields, person.email)),
          status: "pending" as const,
          sender_id: user.id,
          recipient_id: person.candidateId,
          expires_at: (expires ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)).toISOString(),
          v1_hash: hash,
          version_number: 1,
          // document_code is the database's own (the set_document_code trigger).
        } as unknown as TablesInsert<"documents">)
        .select()
        .single();
      if (error || !document) {
        // A team member without "Send documents" is refused by the database;
        // "try again" would never work for them.
        if (isTeamMember && isRefused(error)) throw new Error(`${teamRoleCant("send documents", "canSendDocuments")} Nothing went out.`);
        throw new Error("The letter could not be sent. Nothing went out; try again.");
      }

      // From here the letter exists and is waiting on them. What follows tells
      // them so; none of it can undo the send, so none of it may fail it.
      try {
        await supabase.from("document_audit_logs").insert({
          document_id: document.id,
          user_id: user.id,
          action: "created",
          details: { documentType: "offer_letter", generatedWithAI: false, writtenBy: "offer-letter-1", recipient: person.email, v1_hash: hash },
          user_agent: navigator.userAgent,
          document_hash: hash,
          document_version: 1,
        });
      } catch {
        // The engine writes its own audit lines for every signature.
      }
      try {
        await supabase.from("notifications").insert([
          // Names the business and the job: an applicant can be in two hiring processes.
          (() => {
            const from = cleanFields(fields).companyName?.trim();
            return {
              user_id: person.candidateId,
              title: from ? `Your offer letter from ${from}` : "Your offer letter",
              message: `${from || "The hiring team"} sent you an offer letter${person.jobTitle ? ` for ${person.jobTitle}` : ""}. Read and sign it in My documents.`,
              type: "system" as const,
              link: "/my-documents",
            };
          })(),
        ]);
      } catch {
        // The email below says the same.
      }
      void notifyDocumentSent(person.candidateId, name, cleanFields(fields).companyName, person.applicationId);

      let moved = true;
      let moveRefused = false;
      if (person.status === "interview" || person.status === "reviewing") {
        try {
          await updateApplication.mutateAsync({ id: person.applicationId, status: "offered" as never });
        } catch (moveError) {
          moved = false;
          // "Send documents" without "Manage pipeline": the letter goes, the
          // stage change is refused (nothing changes, no error of its own).
          moveRefused = !!isTeamMember && isNoRowChanged(moveError);
        }
      }
      return { documentId: document.id, moved, moveRefused };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["offer-people"] });
    },
  });
}
