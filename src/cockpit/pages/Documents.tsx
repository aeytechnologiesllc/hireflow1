import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSignature, FileText, Paperclip, ShieldCheck, UserCheck } from "lucide-react";
import { useCockpitDocuments } from "../hooks/useCockpitData";
import { useApplicationsForDocuments } from "@/hooks/useApplicationsForDocuments";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import type { DocRow, DocStatus } from "../data";

/**
 * The drawer.
 *
 * Two questions only: what is still waiting on a signature, and what has each
 * person already given you. So the paperwork that makes the hire sits together
 * as one packet under a readiness meter, and everything else is filed under the
 * person it belongs to. No folder tree — a short list you can finish.
 */

/** The document type reads off the title and the icon, so it needs no words. */
function typeIcon(type: string) {
  const t = (type ?? "").toLowerCase();
  if (t.includes("offer")) return FileText;
  if (t.includes("contract") || t.includes("agreement") || t.includes("nda") || t.includes("compete")) return FileSignature;
  if (t.includes("background")) return UserCheck;
  if (t.includes("ip_") || t.includes("assignment")) return ShieldCheck;
  return Paperclip;
}

/**
 * The hiring packet is the paperwork you send out to make the hire; everything
 * else in the drawer came from, or is about, one person. Matched on the type
 * string so it holds for both the wizard's values and the showcase sections.
 */
function isPacket(row: DocRow) {
  const t = (row.type ?? "").toLowerCase();
  return (
    t.includes("offer") ||
    t.includes("contract") ||
    t.includes("agreement") ||
    t.includes("nda") ||
    t.includes("compete") ||
    t.includes("assignment") ||
    t.includes("packet")
  );
}

const CHIPS: Record<DocStatus, { label: string; bg: string; fg: string }> = {
  Pending: { label: "Waiting", bg: "var(--amber-bg)", fg: "var(--amber-fg)" },
  Submitted: { label: "On file", bg: "var(--surface-2)", fg: "var(--ink-2)" },
  Signed: { label: "Signed", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" },
  Declined: { label: "Declined", bg: "var(--crit-bg)", fg: "var(--crit)" },
};

/** Ready means nobody is waiting on it — it is signed, or it is on file. */
function isReady(row: DocRow) {
  return row.status === "Signed" || row.status === "Submitted";
}

/** Things that need a person rise to the top of their section. */
const ATTENTION: Record<DocStatus, number> = { Pending: 0, Declined: 1, Submitted: 2, Signed: 3 };

/** The mapper falls back to "Candidate"/"Role" when a document has no application. */
function named(value: string | undefined, placeholder: string) {
  return value && value !== placeholder ? value : null;
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || full;
}

/** Meta values stay short: this year's date needs no year on it. */
function shortDate(value: string) {
  return value.replace(new RegExp(`,\\s*${new Date().getFullYear()}$`), "");
}

/**
 * The second line carries only what the row does not already say. The chip owns
 * the state and the title already names the document and its recipient, so all
 * that is left is who it sits with and how long it has sat there.
 */
function statusLine(row: DocRow) {
  const person = named(row.candidate, "Candidate");
  const who = person ? firstName(person) : null;
  return [who, row.updated].filter(Boolean).join(", ");
}

/**
 * Browsers refuse top-level navigation to a `data:` URL, so a document stored
 * inline never opened at all. Hand the bytes over as a blob instead; remote
 * URLs still open the way they always did.
 */
function openDocument(fileUrl: string) {
  if (!fileUrl.startsWith("data:")) {
    window.open(fileUrl, "_blank", "noopener");
    return;
  }
  const comma = fileUrl.indexOf(",");
  if (comma === -1) return;
  const meta = fileUrl.slice(5, comma);
  const payload = fileUrl.slice(comma + 1);
  const base64 = /;base64$/i.test(meta);
  const mime = meta.replace(/;base64$/i, "") || "application/octet-stream";

  let blob: Blob;
  try {
    if (base64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: mime });
    } else {
      blob = new Blob([decodeURIComponent(payload)], { type: mime });
    }
  } catch {
    return;
  }

  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  // The new tab needs the URL alive long enough to fetch it; a blocked popup
  // never will, so let that one go straight away.
  if (opened) window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  else URL.revokeObjectURL(url);
}

function DocRowItem({ row, index, primary }: { row: DocRow; index: number; primary?: boolean }) {
  const Icon = typeIcon(row.type);
  const chip = CHIPS[row.status];
  const person = named(row.candidate, "Candidate");
  const line = statusLine(row);
  // Created said the same thing as the "2 days ago" on the line below the
  // title, so only the date you could still miss earns a tile.
  const meta: Array<{ v: string; l: string }> = [];
  if (row.expires) meta.push({ v: shortDate(row.expires), l: "Expires" });

  return (
    <div
      className="ck-card ck-reveal flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 py-3"
      style={{ ["--ck-i" as string]: index }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        {/* The name wraps rather than truncates — on a phone a clipped document
            name is useless, and two lines is the worst case. */}
        <div className="line-clamp-2 text-[14px] font-semibold leading-[1.3]" style={{ color: "var(--ink)" }} title={row.title}>
          {row.title}
        </div>
        {line && (
          <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
            {line}
          </div>
        )}
      </div>

      {meta.length > 0 && (
        <div className="ml-auto hidden shrink-0 gap-4 text-right min-[861px]:flex">
          {meta.map((m) => (
            <div key={m.l}>
              <div className="font-display tnum text-[16px] font-semibold leading-[1.15]" style={{ color: "var(--ink)" }}>
                {m.v}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
                style={{ color: "var(--ink-3)" }}
              >
                {m.l}
              </div>
            </div>
          ))}
        </div>
      )}

      <span
        className="shrink-0 rounded-[5px] px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
        style={{ background: chip.bg, color: chip.fg }}
      >
        {chip.label}
      </span>

      <div className="flex shrink-0 gap-[7px] max-[620px]:w-full max-[620px]:justify-end">
        {row.fileUrl ? (
          <button
            type="button"
            className={`ck-btn !py-2 !text-[12.5px] ${primary ? "ck-btn-primary" : "ck-btn-outline"}`}
            onClick={() => openDocument(row.fileUrl!)}
            aria-label={`Open ${row.title}${person ? ` for ${person}` : ""}`}
          >
            Open
          </button>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            No file yet
          </span>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return (
    <h2
      className={`font-display mb-2 text-[16px] font-semibold leading-[1.15] ${flush ? "" : "mt-4"}`}
      style={{ color: "var(--ink)" }}
    >
      {children}
    </h2>
  );
}

export default function CockpitDocuments() {
  const { documents, isLoading } = useCockpitDocuments();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: appsForDocs = [] } = useApplicationsForDocuments();
  const [wizard, setWizard] = useState<{ type?: string; appId?: string; mode?: "generate" | "upload" } | null>(null);

  // One shape for both schema modes — the showcase rows carry the same fields.
  const rows: DocRow[] = documents.rows;

  const { packet, people, ready, pending, declined, urgentId } = useMemo(() => {
    const byAttention = (a: DocRow, b: DocRow) => ATTENTION[a.status] - ATTENTION[b.status];
    const packetRows = rows.filter(isPacket).sort(byAttention);

    // Everything that is not packet paperwork belongs to whoever it came from.
    const groups = new Map<string, { key: string; title: string; rows: DocRow[] }>();
    for (const row of rows) {
      if (isPacket(row)) continue;
      const person = named(row.candidate, "Candidate");
      const key = person ? row.avatar || person : "__unassigned";
      if (!groups.has(key)) {
        const role = named(row.role, "Role");
        groups.set(key, {
          key,
          title: person ? (role ? `${person} · ${role}` : person) : "Not attached to anyone yet",
          rows: [],
        });
      }
      groups.get(key)!.rows.push(row);
    }
    for (const group of groups.values()) group.rows.sort(byAttention);

    const people = [...groups.values()];

    // One heavy button on the page, on the first thing still waiting on
    // someone — reading order, so packet first. Four outstanding signatures
    // should look like one thing to start, not four identical demands.
    const inPageOrder = [...packetRows, ...people.flatMap((g) => g.rows)];
    const urgent = inPageOrder.find((r) => r.status === "Pending" && r.fileUrl);

    return {
      packet: packetRows,
      people,
      ready: rows.filter(isReady).length,
      pending: rows.filter((r) => r.status === "Pending").length,
      declined: rows.filter((r) => r.status === "Declined").length,
      urgentId: urgent?.id ?? null,
    };
  }, [rows]);

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
      onOpenChange={(o) => {
        if (!o) setWizard(null);
      }}
      applications={appsForDocs}
      preSelectedApplicationId={wizard.appId}
      initialMode={wizard.mode ?? "generate"}
      preSelectedDocumentType={wizard.type}
    />
  ) : null;

  const head = (
    <header className="ck-rise flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <h1
        className="font-display hidden md:block"
        style={{ fontSize: "clamp(26px, 3.2vw, 30px)", fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15, color: "var(--ink)" }}
      >
        Documents
      </h1>
      <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        Every offer, form and file you send &mdash; one drawer
      </span>
      <div className="ml-auto flex gap-2 max-md:w-full max-md:[&>button]:flex-1">
        <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => setWizard({})}>
          + New document
        </button>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="ck-rise mb-4 h-[44px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="ck-card ck-reveal h-[66px]" style={{ ["--ck-i" as string]: i, opacity: 0.55 }} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {head}
        <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
          <h2 className="font-display text-[20px]" style={{ color: "var(--ink)", fontWeight: 500 }}>
            The drawer is empty.
          </h2>
          <p className="mt-2 max-w-[54ch] text-[14px]" style={{ color: "var(--ink-2)" }}>
            Offers, contracts and anything you ask a candidate to sign land here. Make the first one and
            I&rsquo;ll keep track of who has signed what.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="ck-btn ck-btn-primary" onClick={() => setWizard({ type: "offer_letter" })}>
              Write an offer letter
            </button>
            <button className="ck-btn ck-btn-outline" onClick={() => setWizard({ mode: "upload" })}>
              Upload a document
            </button>
          </div>
        </section>
        {wizardEl}
      </div>
    );
  }

  const total = rows.length;
  const caption =
    pending > 0
      ? `I\u2019m still waiting on ${pending} signature${pending === 1 ? "" : "s"}.`
      : declined > 0
        ? `${declined} came back declined — worth another look.`
        : "Everything in here is done.";

  return (
    <div>
      {head}

      {/* The meter: how much of the drawer is finished, and what is holding it up. */}
      <div className="ck-rise mb-3 mt-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-2">
        <span className="font-display tnum" style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, color: "var(--ink)" }}>
          {ready}
        </span>
        <span className="font-display text-[16px]" style={{ color: "var(--ink-3)" }}>
          of {total} ready
        </span>
        {total <= 12 && (
          <span className="ml-1.5 flex flex-wrap gap-[5px]" aria-hidden="true">
            {rows.map((_, i) => {
              const tone = i < ready ? "on" : i < ready + pending ? "mid" : "off";
              return (
                <span
                  key={i}
                  className="h-[10px] w-[10px] rounded-[3px] border"
                  style={
                    tone === "on"
                      ? { background: "var(--jade)", borderColor: "var(--jade)" }
                      : tone === "mid"
                        ? { background: "var(--amber-bg)", borderColor: "var(--amber-fg)" }
                        : { borderColor: "var(--hair)" }
                  }
                />
              );
            })}
          </span>
        )}
        <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {caption}
        </span>
      </div>

      {packet.length > 0 && (
        <>
          <SectionTitle flush>Hiring packet</SectionTitle>
          <div className="flex flex-col gap-2">
            {packet.map((row, i) => (
              <DocRowItem key={row.id} row={row} index={i} primary={row.id === urgentId} />
            ))}
          </div>
        </>
      )}

      {people.map((group, g) => (
        <div key={group.key}>
          <SectionTitle flush={g === 0 && packet.length === 0}>{group.title}</SectionTitle>
          <div className="flex flex-col gap-2">
            {group.rows.map((row, i) => (
              <DocRowItem key={row.id} row={row} index={i} primary={row.id === urgentId} />
            ))}
          </div>
        </div>
      ))}

      {wizardEl}
    </div>
  );
}
