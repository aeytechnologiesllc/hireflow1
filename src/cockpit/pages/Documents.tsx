import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Clock,
  CheckCircle2,
  XCircle,
  PenLine,
  FileText,
  FileCheck,
  ChevronRight,
  X,
  Eye,
  CircleDot,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { CandidateMark } from "../components/CandidateMark";
import { useCockpitDocuments } from "../hooks/useCockpitData";
import { useApplicationsForDocuments } from "@/hooks/useApplicationsForDocuments";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import type { DocRow, DocStatus } from "../data";

const KPI_ICONS = {
  clock: <Clock className="h-[18px] w-[18px]" />,
  check: <CheckCircle2 className="h-[18px] w-[18px]" />,
  x: <XCircle className="h-[18px] w-[18px]" />,
  edit: <PenLine className="h-[18px] w-[18px]" />,
};

function DocStatusPill({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { color: string; bg: string; border: string }> = {
    Pending: { color: "var(--hf-gold)", bg: "color-mix(in srgb, var(--hf-gold-hover) 13%, transparent)", border: "color-mix(in srgb, var(--hf-gold-hover) 25%, transparent)" },
    Submitted: { color: "var(--hf-text-soft)", bg: "color-mix(in srgb, var(--hf-green) 14%, transparent)", border: "color-mix(in srgb, var(--hf-green) 25%, transparent)" },
    Signed: { color: "var(--hf-text)", bg: "color-mix(in srgb, var(--hf-green-border) 30%, transparent)", border: "color-mix(in srgb, var(--hf-green) 40%, transparent)" },
    Declined: { color: "var(--hf-danger)", bg: "color-mix(in srgb, var(--hf-danger) 14%, transparent)", border: "color-mix(in srgb, var(--hf-danger) 25%, transparent)" },
  };
  const s = map[status];
  return <span className="ck-pill" style={{ color: s.color, background: s.bg, borderColor: s.border }}>{status}</span>;
}

function docIcon(type: string) {
  if (type === "Offer") return FileText;
  if (type === "Agreement") return FileCheck;
  return FileText;
}

function DetailPanel({
  row,
  onClose,
  detailTimeline,
}: {
  row: DocRow;
  onClose: () => void;
  detailTimeline: Array<{ id: string; icon: string; text: string; time: string }>;
}) {
  const [tab, setTab] = useState("Details");
  return (
    <div className="ck-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--hf-green-soft)", color: "var(--hf-green)" }}>
            <FileText className="h-6 w-6" />
          </span>
          <div>
            <div className="font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>{row.title}</div>
            <div className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>{row.type}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ color: "var(--hf-text-muted)" }}><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-3"><DocStatusPill status={row.status} /></div>
      <p className="mt-2 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>{row.status === "Pending" ? "Pending candidate signature" : row.statusNote}</p>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>Candidate</div>
        <div className="text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>Updated</div>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CandidateMark who={row.avatar} size={30} variant="calm" />
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "var(--hf-text)" }}>{row.candidate}</div>
            <div className="text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>{row.role}</div>
          </div>
        </div>
        <div className="text-[13px]" style={{ color: "var(--hf-text)" }}>{row.updated}</div>
      </div>

      <div className="mt-4 flex gap-4 text-[13px]" style={{ borderBottom: "1px solid var(--hf-border-strong)" }}>
        {["Details", "Document preview"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className="pb-2" style={{ color: tab === t ? "var(--hf-gold)" : "var(--hf-text-muted)", borderBottom: tab === t ? "2px solid var(--hf-gold)" : "2px solid transparent" }}>{t}</button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-3 text-[12.5px]">
        <div><div style={{ color: "var(--hf-text-muted)" }}>Created by</div><div style={{ color: "var(--hf-text)" }}>You</div></div>
        <div><div style={{ color: "var(--hf-text-muted)" }}>Created</div><div style={{ color: "var(--hf-text)" }}>{row.created ?? "—"}</div></div>
        <div><div style={{ color: "var(--hf-text-muted)" }}>Expires</div><div style={{ color: "var(--hf-text)" }}>{row.expires ?? "—"}</div></div>
      </div>

      <div className="mt-5 text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>Timeline</div>
      <div className="mt-2 space-y-3">
        {detailTimeline.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>No activity recorded yet.</p>
        ) : (
          detailTimeline.map((t) => {
          const Icon = t.icon === "clock" ? Clock : t.icon === "eye" ? Eye : CircleDot;
          return (
            <div key={t.id} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--hf-text-muted)" }} />
              <div>
                <div className="text-[13px]" style={{ color: "var(--hf-text)" }}>{t.text}</div>
                <div className="text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>{t.time}</div>
              </div>
            </div>
          );
        })
        )}
      </div>

      <div className="mt-auto flex gap-2 pt-5">
        <button
          className="ck-btn ck-btn-primary flex-1"
          disabled={!row.fileUrl}
          style={!row.fileUrl ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={() => row.fileUrl && window.open(row.fileUrl, "_blank", "noopener")}
        >
          <Eye className="h-4 w-4" />{row.fileUrl ? "Open document" : "Not uploaded yet"}
        </button>
      </div>
    </div>
  );
}

export default function CockpitDocuments() {
  const { documents, isLoading } = useCockpitDocuments();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: appsForDocs = [] } = useApplicationsForDocuments();
  const [tab, setTab] = useState(documents.tabs[0]);
  const [selectedId, setSelectedId] = useState(documents.rows[0]?.id ?? "");
  const [wizard, setWizard] = useState<{ type?: string; appId?: string } | null>(null);
  const selected = documents.rows.find((r) => r.id === selectedId) ?? documents.rows[0];

  // Tab filtering (was previously decorative — the list ignored the active tab).
  const filteredRows = documents.rows.filter((r) => {
    if (tab === "Pending") return r.status === "Pending";
    if (tab === "Signed") return r.status === "Signed";
    if (tab === "Requests") return r.status === "Submitted" || (r.type ?? "").toLowerCase().includes("request");
    return true;
  });

  // Opened from the hire prompt → /documents?applicant_id=…&action=create.
  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setWizard({ type: "offer_letter", appId: searchParams.get("applicant_id") ?? undefined });
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      next.delete("applicant_id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const wizardEl = wizard ? (
    <DocumentWizard
      open
      onOpenChange={(o) => { if (!o) setWizard(null); }}
      applications={appsForDocs}
      preSelectedApplicationId={wizard.appId}
      initialMode="generate"
      preSelectedDocumentType={wizard.type}
    />
  ) : null;

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--hf-green)] border-t-transparent" /></div>;
  }

  if (!selected) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Documents"
          subtitle="Offers, requests, and signed hiring paperwork."
          actions={
            <button className="ck-btn ck-btn-primary" onClick={() => setWizard({ type: "offer_letter" })}>
              <FileCheck className="h-4 w-4" />Create offer
            </button>
          }
        />
        <div className="ck-card p-10 text-center" style={{ color: "var(--hf-text-muted)" }}>
          <FileText className="mx-auto h-8 w-8" style={{ color: "var(--hf-text-muted)" }} />
          <p className="mt-3 text-[14px]">No documents yet.</p>
          <p className="mt-1 text-[12.5px]">Create an offer letter or hiring document and send it for signature.</p>
        </div>
        {wizardEl}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        subtitle="Offers, requests, and signed hiring paperwork."
        actions={
          <>
            <button className="ck-btn ck-btn-outline" onClick={() => setWizard({})}><FileText className="h-4 w-4" />New document</button>
            <button className="ck-btn ck-btn-primary" onClick={() => setWizard({ type: "offer_letter" })}><FileCheck className="h-4 w-4" />Create offer</button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {documents.kpis.map((k, i) => (
          <StatCard key={k.label} label={k.label} value={k.value} icon={KPI_ICONS[k.icon]} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="ck-card overflow-hidden">
          <div className="flex gap-5 px-5 pt-4 text-[13.5px]" style={{ borderBottom: "1px solid var(--hf-border-strong)" }}>
            {documents.tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)} className="pb-3" style={{ color: tab === t ? "var(--hf-gold)" : "var(--hf-text-muted)", borderBottom: tab === t ? "2px solid var(--hf-gold)" : "2px solid transparent" }}>{t}</button>
            ))}
          </div>

          <div className="hidden grid-cols-[2fr_1.5fr_1.5fr_1fr] gap-3 px-5 py-3 text-[12px] md:grid" style={{ color: "var(--hf-text-muted)", borderBottom: "1px solid var(--hf-surface-raised)" }}>
            <div>Document</div><div>Candidate</div><div>Status</div><div>Updated</div>
          </div>

          {filteredRows.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
              No {tab === "All documents" ? "" : tab.toLowerCase() + " "}documents.
            </div>
          )}

          {filteredRows.map((row) => {
            const Icon = docIcon(row.type);
            const isSel = row.id === selectedId;
            return (
              <div
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className="grid cursor-pointer grid-cols-[1.4fr_auto] items-center gap-3 px-5 py-3.5 md:grid-cols-[2fr_1.5fr_1.5fr_1fr]"
                style={{ borderBottom: "1px solid color-mix(in srgb, var(--hf-surface-raised) 60%, transparent)", background: isSel ? "var(--hf-surface-raised)" : "transparent", boxShadow: isSel ? "inset 2px 0 0 var(--hf-gold)" : "none" }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--hf-surface-raised)", color: "var(--hf-green)" }}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--hf-text)" }}>{row.title}</div>
                    <div className="text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>{row.type}</div>
                  </div>
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <CandidateMark who={row.avatar} size={28} variant="calm" />
                  <div className="min-w-0"><div className="truncate text-[13px]" style={{ color: "var(--hf-text)" }}>{row.candidate}</div><div className="text-[11px]" style={{ color: "var(--hf-text-muted)" }}>{row.role}</div></div>
                </div>
                <div className="hidden md:block">
                  <DocStatusPill status={row.status} />
                  <div className="mt-1 text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>{row.statusNote}</div>
                </div>
                <div className="flex items-center justify-end gap-2 md:justify-between">
                  <div className="md:hidden"><DocStatusPill status={row.status} /></div>
                  <span className="text-[12px]" style={{ color: "var(--hf-text-muted)" }}>{row.updated}</span>
                  <ChevronRight className="h-4 w-4" style={{ color: "var(--hf-text-muted)" }} />
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between px-5 py-3 text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>
            <span>Showing {filteredRows.length} document{filteredRows.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div className="hidden lg:block">
          <DetailPanel row={selected} onClose={() => undefined} detailTimeline={documents.detailTimeline} />
        </div>
      </div>
      {wizardEl}
    </div>
  );
}
