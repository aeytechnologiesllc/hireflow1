import { useState } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  PenLine,
  FileText,
  FileCheck,
  ChevronRight,
  ChevronLeft,
  X,
  Send,
  Eye,
  CircleDot,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { CandidateMark } from "../components/CandidateMark";
import { useCockpitDocuments } from "../hooks/useCockpitData";
import type { DocRow, DocStatus } from "../data";

const KPI_ICONS = {
  clock: <Clock className="h-[18px] w-[18px]" />,
  check: <CheckCircle2 className="h-[18px] w-[18px]" />,
  x: <XCircle className="h-[18px] w-[18px]" />,
  edit: <PenLine className="h-[18px] w-[18px]" />,
};

function DocStatusPill({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { color: string; bg: string; border: string }> = {
    Pending: { color: "hsl(38 64% 68%)", bg: "hsl(38 58% 50% / 0.13)", border: "hsl(38 58% 50% / 0.25)" },
    Submitted: { color: "hsl(152 50% 62%)", bg: "hsl(152 46% 40% / 0.14)", border: "hsl(152 46% 45% / 0.25)" },
    Signed: { color: "hsl(150 30% 88%)", bg: "hsl(152 46% 32% / 0.3)", border: "hsl(152 46% 45% / 0.4)" },
    Declined: { color: "hsl(8 64% 66%)", bg: "hsl(8 60% 45% / 0.14)", border: "hsl(8 60% 50% / 0.25)" },
  };
  const s = map[status];
  return <span className="ck-pill" style={{ color: s.color, background: s.bg, borderColor: s.border }}>{status}</span>;
}

function docIcon(type: string) {
  if (type === "Offer") return FileText;
  if (type === "Agreement") return FileCheck;
  return FileText;
}

function DetailPanel({ row, onClose }: { row: DocRow; onClose: () => void }) {
  const [tab, setTab] = useState("Details");
  return (
    <div className="ck-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "hsl(152 30% 14%)", color: "hsl(152 46% 60%)" }}>
            <FileText className="h-6 w-6" />
          </span>
          <div>
            <div className="font-display text-[19px]" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>{row.title}</div>
            <div className="text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>{row.type}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ color: "hsl(150 10% 56%)" }}><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-3"><DocStatusPill status={row.status} /></div>
      <p className="mt-2 text-[13px]" style={{ color: "hsl(150 12% 62%)" }}>{row.status === "Pending" ? "Pending candidate signature" : row.statusNote}</p>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11.5px]" style={{ color: "hsl(150 10% 54%)" }}>Candidate</div>
        <div className="text-[11.5px]" style={{ color: "hsl(150 10% 54%)" }}>Applied</div>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CandidateMark who={row.avatar} size={30} variant="calm" />
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>{row.candidate}</div>
            <div className="text-[11.5px]" style={{ color: "hsl(150 10% 54%)" }}>{row.role}</div>
          </div>
        </div>
        <div className="text-[13px]" style={{ color: "hsl(150 22% 80%)" }}>May 18, 2025</div>
      </div>

      <div className="mt-4 flex gap-4 text-[13px]" style={{ borderBottom: "1px solid hsl(150 12% 14%)" }}>
        {["Details", "Document preview"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className="pb-2" style={{ color: tab === t ? "hsl(38 62% 66%)" : "hsl(150 10% 56%)", borderBottom: tab === t ? "2px solid hsl(38 62% 60%)" : "2px solid transparent" }}>{t}</button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-3 text-[12.5px]">
        <div><div style={{ color: "hsl(150 10% 54%)" }}>Created by</div><div style={{ color: "hsl(150 24% 84%)" }}>You</div></div>
        <div><div style={{ color: "hsl(150 10% 54%)" }}>Created</div><div style={{ color: "hsl(150 24% 84%)" }}>May 19, 2025</div></div>
        <div><div style={{ color: "hsl(150 10% 54%)" }}>Expires</div><div style={{ color: "hsl(150 24% 84%)" }}>May 26, 2025</div></div>
      </div>

      <div className="mt-5 text-[14px] font-semibold" style={{ color: "hsl(150 28% 88%)" }}>Timeline</div>
      <div className="mt-2 space-y-3">
        {documents.detailTimeline.map((t) => {
          const Icon = t.icon === "clock" ? Clock : t.icon === "eye" ? Eye : CircleDot;
          return (
            <div key={t.id} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "hsl(150 12% 56%)" }} />
              <div>
                <div className="text-[13px]" style={{ color: "hsl(150 22% 82%)" }}>{t.text}</div>
                <div className="text-[11.5px]" style={{ color: "hsl(150 10% 50%)" }}>{t.time}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex gap-2 pt-5">
        <button className="ck-btn ck-btn-brass flex-1"><Send className="h-4 w-4" />Send reminder</button>
        <button className="ck-btn ck-btn-outline flex-1"><Eye className="h-4 w-4" />Review</button>
      </div>
    </div>
  );
}

export default function CockpitDocuments() {
  const { documents, isLoading } = useCockpitDocuments();
  const [tab, setTab] = useState(documents.tabs[0]);
  const [selectedId, setSelectedId] = useState(documents.rows[0]?.id ?? "");
  const selected = documents.rows.find((r) => r.id === selectedId) ?? documents.rows[0];

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" /></div>;
  }

  if (!selected) {
    return (
      <div className="space-y-5">
        <PageHeader title="Documents" subtitle="Offers, requests, and signed hiring paperwork." />
        <div className="ck-card p-8 text-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>No documents yet.</div>
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
            <button className="ck-btn ck-btn-brass"><FileText className="h-4 w-4" />Request document</button>
            <button className="ck-btn ck-btn-outline"><FileCheck className="h-4 w-4" />Create offer</button>
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
          <div className="flex gap-5 px-5 pt-4 text-[13.5px]" style={{ borderBottom: "1px solid hsl(150 12% 14%)" }}>
            {documents.tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)} className="pb-3" style={{ color: tab === t ? "hsl(38 62% 66%)" : "hsl(150 10% 56%)", borderBottom: tab === t ? "2px solid hsl(38 62% 60%)" : "2px solid transparent" }}>{t}</button>
            ))}
          </div>

          <div className="hidden grid-cols-[2fr_1.5fr_1.5fr_1fr] gap-3 px-5 py-3 text-[12px] md:grid" style={{ color: "hsl(150 10% 54%)", borderBottom: "1px solid hsl(150 12% 13%)" }}>
            <div>Document</div><div>Candidate</div><div>Status</div><div>Updated</div>
          </div>

          {documents.rows.map((row) => {
            const Icon = docIcon(row.type);
            const isSel = row.id === selectedId;
            return (
              <div
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className="grid cursor-pointer grid-cols-[1.4fr_auto] items-center gap-3 px-5 py-3.5 md:grid-cols-[2fr_1.5fr_1.5fr_1fr]"
                style={{ borderBottom: "1px solid hsl(150 12% 13% / 0.6)", background: isSel ? "hsl(156 18% 10%)" : "transparent", boxShadow: isSel ? "inset 2px 0 0 hsl(38 60% 60%)" : "none" }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "hsl(152 28% 13%)", color: "hsl(152 46% 58%)" }}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold" style={{ color: "hsl(150 28% 89%)" }}>{row.title}</div>
                    <div className="text-[11.5px]" style={{ color: "hsl(150 10% 54%)" }}>{row.type}</div>
                  </div>
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <CandidateMark who={row.avatar} size={28} variant="calm" />
                  <div className="min-w-0"><div className="truncate text-[13px]" style={{ color: "hsl(150 22% 82%)" }}>{row.candidate}</div><div className="text-[11px]" style={{ color: "hsl(150 10% 52%)" }}>{row.role}</div></div>
                </div>
                <div className="hidden md:block">
                  <DocStatusPill status={row.status} />
                  <div className="mt-1 text-[11.5px]" style={{ color: "hsl(150 10% 52%)" }}>{row.statusNote}</div>
                </div>
                <div className="flex items-center justify-end gap-2 md:justify-between">
                  <div className="md:hidden"><DocStatusPill status={row.status} /></div>
                  <span className="text-[12px]" style={{ color: "hsl(150 10% 54%)" }}>{row.updated}</span>
                  <ChevronRight className="h-4 w-4" style={{ color: "hsl(150 10% 44%)" }} />
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between px-5 py-3 text-[12.5px]" style={{ color: "hsl(150 10% 54%)" }}>
            <span>Showing 1 to 5 of 17 documents</span>
            <div className="flex items-center gap-1">
              <button className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color: "hsl(150 12% 56%)" }}><ChevronLeft className="h-4 w-4" /></button>
              {["1", "2", "3"].map((p, i) => (
                <button key={p} className="flex h-7 min-w-7 items-center justify-center rounded-md px-2" style={i === 0 ? { background: "hsl(152 30% 16%)", color: "hsl(150 30% 88%)" } : { color: "hsl(150 12% 56%)" }}>{p}</button>
              ))}
              <button className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color: "hsl(150 12% 56%)" }}><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <DetailPanel row={selected} onClose={() => undefined} />
        </div>
      </div>
    </div>
  );
}
