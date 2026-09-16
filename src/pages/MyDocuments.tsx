import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentRequests, DocumentRequestWithDetails } from "@/hooks/useDocumentRequests";
import { useDocuments, type DocumentWithApplication } from "@/hooks/useDocuments";
import { DocumentRequestCard } from "@/components/documents/DocumentRequestCard";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { SignedDocumentViewer } from "@/components/documents/SignedDocumentViewer";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Eye, FileSignature } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlyphLetter } from "@/components/candidate/glyphs";

const LetterIdentityGlyph = GlyphLetter as unknown as LucideIcon;

/** Mirrors the chip vocabulary the employer's own Documents drawer uses
 *  (src/cockpit/pages/Documents.tsx) so "pending" reads the same color on
 *  both sides of the product. */
function signStatusChip(doc: DocumentWithApplication): { label: string; bg: string; fg: string } {
  // A withdrawn/voided document is still status='pending' underneath (see
  // document-signing's withdraw/void actions) — is_voided must be checked
  // first, or it would show as "Awaiting your signature"/"Sent to the
  // employer" instead of the honest terminal state.
  if (doc.is_voided) {
    return doc.candidate_signed_at
      ? { label: "Voided", bg: "var(--crit-bg)", fg: "var(--crit)" }
      : { label: "Withdrawn", bg: "var(--surface-2)", fg: "var(--ink-3)" };
  }
  if (doc.status === "declined") return { label: "Declined", bg: "var(--crit-bg)", fg: "var(--crit)" };
  if (doc.status === "signed") return { label: "Signed", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" };
  if (doc.candidate_signed_at) {
    return { label: "Sent to the employer", bg: "var(--surface-2)", fg: "var(--ink-2)" };
  }
  return { label: "Awaiting your signature", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
}

function SignDocumentRow({ doc, onView }: { doc: DocumentWithApplication; onView: () => void }) {
  const chip = signStatusChip(doc);
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
        <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
          Sent {format(new Date(doc.created_at), "MMM d, yyyy")}
        </div>
      </div>
      <span
        className="shrink-0 rounded-[5px] px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
        style={{ background: chip.bg, color: chip.fg }}
      >
        {chip.label}
      </span>
      <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs sm:text-sm" onClick={onView}>
        <Eye className="mr-1 h-3.5 w-3.5" />
        View
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

  const [uploadDialogRequest, setUploadDialogRequest] = useState<DocumentRequestWithDetails | null>(null);
  const [viewerDocument, setViewerDocument] = useState<DocumentWithApplication | null>(null);

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
  const pendingSignature = signDocuments.filter(
    (d) => d.status === "pending" && !d.candidate_signed_at && !d.is_voided
  ).length;
  const hasAny = documentRequests.length > 0 || signDocuments.length > 0;

  return (
    <div className="ck-page space-y-6">
      <div>
        <h1 className="font-display ck-ink text-[26px] font-semibold leading-tight sm:text-[28px]" style={{ color: "var(--ink)" }}>
          Your documents
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
          Anything an employer has sent you to sign, or asked you to upload, lives here.
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
          {signDocuments.length > 0 && (
            <section className="space-y-3">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                To sign{pendingSignature > 0 ? ` — ${pendingSignature} waiting on you` : ""}
              </h2>
              <div className="space-y-3">
                {signDocuments.map((doc) => (
                  <SignDocumentRow key={doc.id} doc={doc} onView={() => setViewerDocument(doc)} />
                ))}
              </div>
            </section>
          )}

          {documentRequests.length > 0 && (
            <section className="space-y-3">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                To upload{pendingUpload > 0 ? ` — ${pendingUpload} waiting on you` : ""}
              </h2>
              <div className="space-y-3">
                {documentRequests.map((request) => (
                  <DocumentRequestCard
                    key={request.id}
                    request={request}
                    isEmployer={false}
                    onUpload={() => setUploadDialogRequest(request)}
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
