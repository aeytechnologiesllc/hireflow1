import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentRequests, DocumentRequestWithDetails } from "@/hooks/useDocumentRequests";
import { useDocuments, useDocumentsLive, type DocumentWithApplication } from "@/hooks/useDocuments";
import { DocumentRequestCard } from "@/components/documents/DocumentRequestCard";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { SignedDocumentViewer } from "@/components/documents/SignedDocumentViewer";
import { ApplicantDocumentSheet, isWrittenDocument } from "@/components/documents/ApplicantDocumentSheet";
import { applicantDocumentState, waitingOnApplicant } from "@/lib/applicantDocumentTurn";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Eye, FileSignature } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlyphLetter } from "@/components/candidate/glyphs";
import { businessJobLine, useCompanyNames } from "@/hooks/useCompanyNames";

const LetterIdentityGlyph = GlyphLetter as unknown as LucideIcon;

/** Mirrors the chip vocabulary the employer's own Documents drawer uses
 *  (src/cockpit/pages/Documents.tsx) so "pending" reads the same color on
 *  both sides of the product. */
function signStatusChip(doc: DocumentWithApplication, now: Date): { label: string; bg: string; fg: string } {
  // A withdrawn/voided document is still status='pending' underneath (see
  // document-signing's withdraw/void actions), so whose turn it is comes from
  // applicantDocumentState, never the raw status.
  const state = applicantDocumentState(doc, now);
  if (state === "withdrawn") {
    return doc.candidate_signed_at
      ? { label: "Voided", bg: "var(--crit-bg)", fg: "var(--crit)" }
      : { label: "Withdrawn", bg: "var(--surface-2)", fg: "var(--ink-3)" };
  }
  if (state === "declined") return { label: "Declined", bg: "var(--crit-bg)", fg: "var(--crit)" };
  if (state === "done") return { label: "Signed", bg: "var(--action-soft)", fg: "var(--action-soft-fg)" };
  if (state === "theirs") return { label: "Sent to the employer", bg: "var(--surface-2)", fg: "var(--ink-2)" };
  // The date to sign has passed: no longer theirs to sign (the eighth product review).
  if (state === "expired") return { label: "Expired", bg: "var(--surface-2)", fg: "var(--ink-3)" };
  return { label: "Awaiting your signature", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
}

function SignDocumentRow({ doc, onView, askedBy, now }: { doc: DocumentWithApplication; onView: () => void; askedBy?: string | null; now: Date }) {
  const chip = signStatusChip(doc, now);
  // Waiting on them: the button says what to do.
  const theirTurn = waitingOnApplicant(doc, now);
  return (
    <div className="ck-card flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 py-3.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
      >
        <FileSignature className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[14px] font-semibold leading-[1.3]" style={{ color: "var(--ink)" }}>
          {doc.name}
        </div>
        <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--ink-3)" }} data-sign-asked-by={askedBy ? "" : undefined}>
          {askedBy && <span className="font-medium" style={{ color: "var(--ink-2)" }}>{askedBy} · </span>}
          Sent {format(new Date(doc.created_at), "MMM d, yyyy")}
        </div>
      </div>
      <span
        className="shrink-0 rounded-[5px] px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
        style={{ background: chip.bg, color: chip.fg }}
      >
        {chip.label}
      </span>
      <Button size="sm" variant={theirTurn ? "default" : "outline"} className="h-8 shrink-0 text-xs sm:text-sm" onClick={onView} data-sign-open>
        {theirTurn ? null : <Eye className="mr-1 h-3.5 w-3.5" />}
        {theirTurn ? "Read and sign" : "View"}
      </Button>
    </div>
  );
}

export default function MyDocuments() {
  const { role } = useAuth();
  const isEmployer = role === "employer";

  const {
    data: documentRequests = [],
    isLoading: requestsLoading,
    refetch: refetchRequests,
  } = useDocumentRequests();
  const { data: signDocuments = [], isLoading: signLoading } = useDocuments();
  useDocumentsLive();
  // Which business asks for each paper (someone in two hiring processes).
  const companies = useCompanyNames([
    ...signDocuments.map((d) => d.applications?.jobs?.employer_id),
    ...documentRequests.map((r) => r.applications?.jobs?.employer_id ?? r.employer_id),
  ]);

  const [uploadDialogRequest, setUploadDialogRequest] = useState<DocumentRequestWithDetails | null>(null);
  // A written document (an offer letter) opens the applicant's signing
  // screen; an uploaded PDF, or "Signing record", opens the full viewer.
  const [sheetDocument, setSheetDocument] = useState<DocumentWithApplication | null>(null);
  const [viewerDocument, setViewerDocument] = useState<DocumentWithApplication | null>(null);
  const openDocument = (doc: DocumentWithApplication) => (isWrittenDocument(doc.file_url) ? setSheetDocument(doc) : setViewerDocument(doc));

  if (isEmployer) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="ck-card max-w-md p-8 text-center">
          <GlyphLetter size={40} className="mx-auto mb-4" style={{ color: "var(--ink-3)" }} />
          <h2 className="font-display text-xl font-semibold" style={{ color: "var(--ink)" }}>
            Candidate Access Only
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
            This page is for job seekers. Use the Documents section to send and review requests to your candidates.
          </p>
        </div>
      </div>
    );
  }

  const isLoading = requestsLoading || signLoading;
  const pendingUpload = documentRequests.filter(
    (r) => r.status === "pending" || r.status === "rejected"
  ).length;
  // "To sign" holds only documents waiting on them: theirs to sign, and still
  // in time. Everything else goes under its own heading: signed, declined,
  // voided and withdrawn (the seventh product review: a just-voided letter
  // sat at the top of "To sign"), and, since the eighth, one they signed and
  // the team has not countersigned yet ("Sent to the employer") and one whose
  // date to sign has passed ("Expired"; it read "1 waiting on you" with "Read
  // and sign", though signing it only answers "This document has expired").
  // The sidebar's badge counts by the same rule (usePendingDocumentsCount).
  const now = new Date();
  const toSign = signDocuments.filter((d) => waitingOnApplicant(d, now));
  const closedDocuments = signDocuments.filter((d) => !waitingOnApplicant(d, now));
  const hasAny = documentRequests.length > 0 || signDocuments.length > 0;

  return (
    <div className="ck-page space-y-6">
      <div>
        <h1 className="font-display ck-ink text-[26px] font-semibold leading-tight sm:text-[28px]" style={{ color: "var(--ink)" }}>
          Your documents
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
          Anything an employer has sent you to sign, or asked you to send, lives here.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-[14px]" />
          <Skeleton className="h-20 w-full rounded-[14px]" />
        </div>
      ) : !hasAny ? (
        <EmptyStateCard
          icon={LetterIdentityGlyph}
          title="Nothing here yet"
          description="When an employer sends you a document to sign, or asks you to upload one, it'll show up on this page and we'll let you know."
          tip="Already applied somewhere? Check Your applications for where things stand."
        />
      ) : (
        <>
          {toSign.length > 0 && (
            <section className="space-y-3" data-documents-section="to-sign">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                To sign — {toSign.length} waiting on you
              </h2>
              <div className="space-y-3">
                {toSign.map((doc) => (
                  <SignDocumentRow
                    key={doc.id}
                    doc={doc}
                    now={now}
                    onView={() => openDocument(doc)}
                    askedBy={businessJobLine(companies.get(doc.applications?.jobs?.employer_id ?? ""), doc.applications?.jobs?.title)}
                  />
                ))}
              </div>
            </section>
          )}

          {documentRequests.length > 0 && (
            <section className="space-y-3">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                To send{pendingUpload > 0 ? ` — ${pendingUpload} waiting on you` : ""}
              </h2>
              <div className="space-y-3">
                {documentRequests.map((request) => (
                  <DocumentRequestCard
                    key={request.id}
                    request={request}
                    isEmployer={false}
                    onUpload={() => setUploadDialogRequest(request)}
                    askedBy={businessJobLine(companies.get(request.applications?.jobs?.employer_id ?? request.employer_id), request.applications?.jobs?.title)}
                  />
                ))}
              </div>
            </section>
          )}

          {closedDocuments.length > 0 && (
            <section className="space-y-3" data-documents-section="closed">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                Signed or closed
              </h2>
              <div className="space-y-3">
                {closedDocuments.map((doc) => (
                  <SignDocumentRow
                    key={doc.id}
                    doc={doc}
                    now={now}
                    onView={() => openDocument(doc)}
                    askedBy={businessJobLine(companies.get(doc.applications?.jobs?.employer_id ?? ""), doc.applications?.jobs?.title)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <DocumentUploadDialog
        open={!!uploadDialogRequest}
        onOpenChange={(open) => {
          if (!open) {
            setUploadDialogRequest(null);
            refetchRequests();
          }
        }}
        request={uploadDialogRequest}
      />

      <ApplicantDocumentSheet
        document={sheetDocument ? signDocuments.find((d) => d.id === sheetDocument.id) ?? sheetDocument : null}
        open={!!sheetDocument}
        onOpenChange={(open) => {
          if (!open) setSheetDocument(null);
        }}
        onShowRecord={(doc) => {
          setSheetDocument(null);
          setViewerDocument(doc);
        }}
      />

      <SignedDocumentViewer
        document={viewerDocument}
        open={!!viewerDocument}
        onOpenChange={(open) => {
          if (!open) setViewerDocument(null);
        }}
      />
    </div>
  );
}
