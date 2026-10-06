import { useEffect, useId, useState, type ReactNode } from "react";
import { SHORT_LABEL_MAX, type GlanceRow } from "../lib/applicantProfile";
import { PanelLabel } from "./ProfileSection";

/**
 * "At a glance" on the desktop profile (docs/APPLICANT-PROFILE.md): the
 * job's quick-pick answers as label → value rows, a flagged pick in amber
 * (the question's own flag_options, read the way the server reads them),
 * then their phone and email, each with Copy. Never a tel: link: the team
 * reaches applicants through Messages, and a phone number tapped by accident
 * on a laptop opens a calling app.
 */

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the old way (an unfocused page, an insecure origin)
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      className="ml-1.5 shrink-0 text-[12px] font-medium hover:underline"
      style={{ color: state === "failed" ? "var(--amber-fg)" : "var(--jade-soft-fg)" }}
      aria-label={`Copy ${what}`}
      onClick={async () => setState((await copyText(value)) ? "copied" : "failed")}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy"}</span>
    </button>
  );
}

/** Label → value. The value keeps its own width up to a share of the row
 *  (wrapping only past it), the label takes the rest: a short answer is
 *  never broken ("40 or / more") to make room for a long question. */
function Row({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3.5 py-[3px] text-[13px] leading-[1.45]">
      <dt className="min-w-0 flex-1" style={{ color: "var(--ink-3)" }}>
        {label}
      </dt>
      <dd className={`flex flex-none flex-col items-end text-right ${wide ? "max-w-[80%]" : "max-w-[60%]"}`} style={{ color: "var(--ink)" }}>
        {children}
      </dd>
    </div>
  );
}

/* A label longer than SHORT_LABEL_MAX (a question's own words, until the job
   editor gives it a short label) goes on its own line with its answers under
   it, full width: side by side, both broke mid-phrase. So does any answer
   with more than one pick. */

function StackedRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col py-[5px] text-[13px] leading-[1.45]">
      <dt style={{ color: "var(--ink-3)" }}>{label}</dt>
      <dd className="flex flex-col" style={{ color: "var(--ink)" }}>
        {children}
      </dd>
    </div>
  );
}

export function ApplicantAtAGlance({ rows, phone, email }: { rows: GlanceRow[]; phone: string | null; email: string | null }) {
  const id = useId();
  if (rows.length === 0 && !phone && !email) return null;
  return (
    <section aria-labelledby={id}>
      <PanelLabel id={id}>At a glance</PanelLabel>
      <dl className="flex flex-col">
        {rows.map((row) => {
          const values = row.values.map((v) => (
            <span
              key={v.text}
              className="break-words"
              style={v.flagged ? { color: "var(--amber-fg)", fontWeight: 600 } : undefined}
              title={v.flagged && row.flag ? row.flag : undefined}
            >
              {v.text}
              {v.flagged && <span className="sr-only"> (flagged{row.flag ? `: ${row.flag}` : ""})</span>}
            </span>
          ));
          return row.label.length > SHORT_LABEL_MAX || row.values.length > 1 ? (
            <StackedRow key={row.id} label={row.label}>
              {values}
            </StackedRow>
          ) : (
            <Row key={row.id} label={row.label}>
              {values}
            </Row>
          );
        })}
        {phone && (
          <Row label="Phone" wide>
            <span className="flex max-w-full flex-wrap items-baseline justify-end">
              <span className="whitespace-nowrap tabular-nums">{phone}</span>
              <CopyButton value={phone} what="phone number" />
            </span>
          </Row>
        )}
        {email && (
          <Row label="Email" wide>
            <span className="flex max-w-full flex-wrap items-baseline justify-end">
              <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
              <CopyButton value={email} what="email address" />
            </span>
          </Row>
        )}
      </dl>
    </section>
  );
}

export default ApplicantAtAGlance;
