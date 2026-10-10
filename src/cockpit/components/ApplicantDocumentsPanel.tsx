import { useState } from "react";
import { toast } from "sonner";
import { PanelLabel } from "./ProfileSection";
import { isTypedAnswer, openRequestFile, useApplicantRequests, useReviewRequest, type ApplicantRequest } from "../hooks/useApplicantRequests";
import { deletesOn, requestKind, requestTitle, shownAnswer, statusWords } from "@/lib/documentRequests";

/**
 * The documents asked of one applicant, on their page
 * (docs/DOCUMENT-REQUESTS.md). Each line says what was asked and where it
 * stands; what they sent opens through the requested-document-url function
 * (a five-minute link, the opening recorded), and is approved or asked for
 * again here. An approved ID says the day it will be deleted.
 */

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
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

function RequestRow({ request }: { request: ApplicantRequest }) {
  const review = useReviewRequest();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [opening, setOpening] = useState(false);
  const typed = isTypedAnswer(request);
  const received = request.status === "submitted" || request.status === "reviewed";
  const deleteDay = request.status === "approved" ? deletesOn(request.document_type, request.reviewed_at) : null;

  const open = async () => {
    setOpening(true);
    // Opened before the request finishes, so a phone's pop-up rule does not stop it.
    const tab = window.open("", "_blank");
    try {
      const url = await openRequestFile(request.id);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      toast.error((error as Error).message);
    } finally {
      setOpening(false);
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
            {requestTitle(request)}
          </div>
          <div className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
            {request.status === "pending" && `Asked ${DAY.format(new Date(request.created_at))}${request.due_date ? `, due ${DAY.format(new Date(request.due_date))}` : ""}`}
            {received && request.submitted_at && `Sent ${DAY.format(new Date(request.submitted_at))}`}
            {request.status === "rejected" && (request.rejection_reason ? `Asked again: ${request.rejection_reason}` : "Asked again")}
            {request.status === "approved" &&
              (request.file_deleted_at
                ? `Deleted ${DAY.format(new Date(request.file_deleted_at))}, after approval`
                : deleteDay
                  ? `Approved. Deleted on ${DAY.format(deleteDay)}`
                  : "Approved")}
          </div>
          {typed && request.answer_text && (
            <div className="mt-1 text-[13px] font-medium" style={{ color: "var(--hf-text)" }} data-request-answer>
              {shownAnswer(request.document_type, request.answer_text)}
            </div>
          )}
        </div>
        <span className="shrink-0 rounded-[6px] px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={tone(request.status)}>
          {statusWords(request.status, "team")}
        </span>
      </div>

      {(received || (request.status === "approved" && !typed && !request.file_deleted_at)) && !asking && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!typed && request.file_url && (
            <button type="button" className="ck-btn ck-btn-outline !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => void open()} disabled={opening} data-request-open>
              {opening ? "Opening..." : "Open"}
            </button>
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
