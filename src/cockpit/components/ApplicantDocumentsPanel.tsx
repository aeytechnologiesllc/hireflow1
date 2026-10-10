import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PanelLabel } from "./ProfileSection";
import { isTypedAnswer, openRequestFile, useApplicantRequests, useCancelRequest, useReviewRequest, type ApplicantRequest } from "../hooks/useApplicantRequests";
import { useAuth } from "@/hooks/useAuth";
import { idDeletion, requestKind, requestTitle, shownAnswer, statusWords, timeLeft } from "@/lib/documentRequests";

/**
 * The documents asked of one applicant, on their page
 * (docs/DOCUMENT-REQUESTS.md). Each line says what was asked and where it
 * stands; what they sent opens through the requested-document-url function
 * (a five-minute link, the opening recorded), and is approved or asked for
 * again here. An ID says when it goes: 24 hours after the team first opens
 * it, or 7 days after it was sent (the owner, 2026-10-10), with "Download a
 * copy" for a team that needs to keep one.
 */

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TIME_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
/** "Oct 10"; "today" while a row just sent has no date back yet. */
const DAY = {
  format(value: Date): string {
    return Number.isNaN(value.getTime()) ? "today" : DAY_FORMAT.format(value);
  },
};

function tone(status: string): { background: string; color: string } {
  if (status === "approved") return { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" };
  if (status === "submitted" || status === "reviewed") return { background: "var(--hf-gold-soft, var(--surface-2))", color: "var(--hf-text)" };
  if (status === "rejected") return { background: "var(--surface-2)", color: "var(--amber-fg)" };
  return { background: "var(--surface-2)", color: "var(--ink-2)" };
}

/** One request: what was asked, where it stands, what came back. `person` names the applicant (the Documents page's list). */
export function RequestRow({ request, person }: { request: ApplicantRequest; person?: string }) {
  const review = useReviewRequest();
  const cancel = useCancelRequest();
  const { role } = useAuth();
  const [cancelArmed, setCancelArmed] = useState(false);
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [opening, setOpening] = useState<"open" | "download" | null>(null);
  const typed = isTypedAnswer(request);
  const received = request.status === "submitted" || request.status === "reviewed";
  const deletion = idDeletion(request);

  const open = async (download: boolean) => {
    setOpening(download ? "download" : "open");
    // Opened before the request finishes, so a phone's pop-up rule does not stop it.
    const tab = download ? null : window.open("", "_blank");
    try {
      const url = await openRequestFile(request.id, download);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      // The first opening starts an ID's 24 hours: show it.
      if (!request.team_opened_at) {
        void queryClient.invalidateQueries({ queryKey: ["applicant-requests", request.application_id] });
        void queryClient.invalidateQueries({ queryKey: ["all-requests"] });
      }
    } catch (error) {
      tab?.close();
      toast.error((error as Error).message);
    } finally {
      setOpening(null);
    }
  };

  const decide = async (approve: boolean) => {
    try {
      await review.mutateAsync({ request, approve, reason });
      setAsking(false);
      setReason("");
      toast.success(approve ? `${requestTitle(request)} approved` : "Asked to send it again");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <li className="border-t py-2.5 first:border-t-0" style={{ borderColor: "var(--line)" }} data-request-row={request.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium" style={{ color: "var(--hf-text)" }}>
            {person ? `${person} · ${requestTitle(request)}` : requestTitle(request)}
          </div>
          <div className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
            {request.status === "pending" && `Asked ${DAY.format(new Date(request.created_at))}${request.due_date ? `, due ${DAY.format(new Date(request.due_date))}` : ""}`}
            {received && request.submitted_at && `Sent ${DAY.format(new Date(request.submitted_at))}`}
            {request.status === "rejected" && (request.rejection_reason ? `Asked again: ${request.rejection_reason}` : "Asked again")}
            {request.status === "approved" && "Approved"}
            {deletion && !deletion.deleted && deletion.opened && request.team_opened_at && ` · opened ${DAY.format(new Date(request.team_opened_at))}, ${TIME_FORMAT.format(new Date(request.team_opened_at))}`}
            {deletion && !deletion.deleted && !deletion.opened && " · deleted 24 hours after you first open it"}
            {deletion?.deleted && ` · file deleted ${DAY.format(deletion.at)}`}
          </div>
          {typed && request.answer_text && (
            <div className="mt-1 text-[13px] font-medium" style={{ color: "var(--hf-text)" }} data-request-answer>
              {shownAnswer(request.document_type, request.answer_text)}
            </div>
          )}
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-[6px] px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={tone(request.status)}>
            {statusWords(request.status, "team")}
          </span>
          {deletion && !deletion.deleted && deletion.opened && (
            <span className="rounded-[6px] px-2 py-[3px] text-[10.5px] font-semibold" style={{ background: "var(--crit-bg)", color: "var(--crit)" }} data-request-deletes>
              Deleted in {timeLeft(deletion.at)}
            </span>
          )}
        </span>
      </div>

      {(received || (request.status === "approved" && !typed && !!request.file_url)) && !asking && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!typed && request.file_url && (
            <>
              <button type="button" className="ck-btn ck-btn-outline !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => void open(false)} disabled={!!opening} data-request-open>
                {opening === "open" ? "Opening..." : "Open"}
              </button>
              <button type="button" className="ck-btn ck-btn-ghost !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => void open(true)} disabled={!!opening} data-request-download>
                {opening === "download" ? "Getting it..." : "Download a copy"}
              </button>
            </>
          )}
          {received && (
            <>
              <button type="button" className="ck-btn ck-btn-primary !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => void decide(true)} disabled={review.isPending} data-request-approve>
                Approve
              </button>
              <button type="button" className="ck-btn ck-btn-ghost !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => setAsking(true)} disabled={review.isPending}>
                Ask again
              </button>
            </>
          )}
        </div>
      )}
      {/* Nothing sent yet: the owner can take it back (the database refuses once something is in). */}
      {request.status === "pending" && !request.file_url && !request.answer_text && role === "employer" && (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            className="text-[12px] underline underline-offset-2"
            style={{ color: cancelArmed ? "var(--crit)" : "var(--ink-3)" }}
            disabled={cancel.isPending}
            onClick={async () => {
              if (!cancelArmed) {
                setCancelArmed(true);
                return;
              }
              try {
                await cancel.mutateAsync(request);
                toast.success(`${requestTitle(request)} request cancelled`);
              } catch (error) {
                toast.error((error as Error).message);
                setCancelArmed(false);
              }
            }}
            data-request-cancel
          >
            {cancel.isPending ? "Cancelling..." : cancelArmed ? "Press again to cancel this request" : "Cancel request"}
          </button>
          {cancelArmed && !cancel.isPending && (
            <button type="button" className="text-[12px]" style={{ color: "var(--ink-3)" }} onClick={() => setCancelArmed(false)}>
              Keep it
            </button>
          )}
        </div>
      )}
      {asking && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            className="ck-input w-full px-3 py-2 !text-[16px] md:!text-[13.5px]"
            value={reason}
            maxLength={300}
            placeholder={requestKind(request.document_type).answer === "file" ? "The photo is blurry. Please take it again in good light." : "That email is not on Wise. Please check it."}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Why it needs sending again"
          />
          <div className="flex gap-2">
            <button type="button" className="ck-btn ck-btn-primary !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => void decide(false)} disabled={review.isPending}>
              Send it back
            </button>
            <button type="button" className="ck-btn ck-btn-ghost !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ApplicantDocumentsPanel({ applicationId, firstName, show, onRequest }: { applicationId: string; firstName: string; show: boolean; onRequest?: () => void }) {
  const { data: requests = [], isLoading } = useApplicantRequests(applicationId);
  if (!show && requests.length === 0) return null;
  const waiting = requests.filter((r) => r.status === "submitted" || r.status === "reviewed").length;
  return (
    <section aria-label="Documents" data-applicant-documents>
      <PanelLabel>Documents{waiting > 0 ? ` · ${waiting} to review` : ""}</PanelLabel>
      <div className="ck-card px-4 py-1.5">
        {isLoading ? (
          <p className="py-2.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>Loading...</p>
        ) : requests.length === 0 ? (
          <p className="py-2.5 text-[12.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
            Nothing asked of {firstName} yet.{onRequest ? " Ask for an ID, an NBI clearance or the email they use on Wise or PayPal." : ""}
          </p>
        ) : (
          <ul>
            {requests.map((request) => (
              <RequestRow key={request.id} request={request} />
            ))}
          </ul>
        )}
        {onRequest && (
          <div className="border-t py-2.5" style={{ borderColor: "var(--line)" }}>
            <button type="button" className="text-[12.5px] font-medium underline underline-offset-2" style={{ color: "var(--jade)" }} onClick={onRequest} data-request-documents-open>
              Request documents
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
