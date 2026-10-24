import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { GuideStep } from "../../lib/firstHireStage";

/**
 * The steps of "Your first hire". On a wide card: one line of numbered dots,
 * the current one lit, a done one ticked in jade (the content of the current
 * step is drawn by the caller under the line). On a narrow card (a phone): the
 * same steps stacked, the current one open with its content right under it.
 *
 * Colour: jade only where it means something (a tick, the current ring, the
 * line up to it). Never a large fill: the dots are 24px.
 */

export interface StepView extends GuideStep {
  label: string;
  /** A shorter label, for a card that is wide enough for a line of steps but not for the full words. */
  short: string;
  /** A done step can point at the thing it made (the job's own page). */
  href?: string;
  /** Narrow card only: what sits beside an open step (the alerts button). */
  aside?: ReactNode;
  /** Narrow card only: what an open step says under its label. */
  note?: ReactNode;
}

const UNLIT = "color-mix(in srgb, var(--ink-3) 75%, transparent)";

function Dot({ n, state }: { n: number; state: StepView["state"] }) {
  const common = "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold leading-none";
  if (state === "done") {
    return (
      <span className={common} style={{ background: "var(--jade)", color: "var(--btn-fg)" }} aria-hidden>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className={`ck-num ${common}`}
        style={{ border: "2px solid var(--jade)", color: "var(--jade)", background: "var(--surface)", boxShadow: "0 0 0 3px var(--jade-soft)" }}
        aria-hidden
      >
        {n}
      </span>
    );
  }
  return (
    <span className={`ck-num ${common}`} style={{ border: `1.5px solid ${UNLIT}`, color: "var(--ink-3)" }} aria-hidden>
      {n}
    </span>
  );
}

function labelColor(state: StepView["state"]): string {
  return state === "active" ? "var(--ink)" : state === "done" ? "var(--ink-2)" : state === "open" ? "var(--ink-2)" : "var(--ink-3)";
}

function StateWords({ state }: { state: StepView["state"] }) {
  const words = state === "done" ? "Done" : state === "active" ? "Current step" : state === "open" ? "Optional" : "Not yet";
  return <span className="sr-only">{`. ${words}.`}</span>;
}

/** One line of steps. */
export function StepStrip({ steps, compact = false }: { steps: StepView[]; compact?: boolean }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Your first hire, step by step">
      {steps.map((s, i) => {
        const lit = s.state === "done" || s.state === "active";
        const label = (
          <span className="min-w-0 truncate text-[13px] leading-none" style={{ color: labelColor(s.state), fontWeight: s.state === "active" ? 600 : 500 }}>
            {compact ? s.short : s.label}
          </span>
        );
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <li
                aria-hidden
                role="presentation"
                className="h-px min-w-[10px] flex-1"
                style={{ background: steps[i - 1].state === "done" && lit ? "var(--jade)" : "var(--line)" }}
              />
            )}
            <li
              className="flex min-w-0 shrink items-center gap-2 rounded-full py-1 pr-3"
              style={
                s.state === "active"
                  ? { background: "var(--jade-soft)", border: "1px solid color-mix(in srgb, var(--jade) 40%, transparent)", paddingLeft: 3 }
                  : { border: "1px solid transparent", paddingLeft: 3 }
              }
              aria-current={s.state === "active" ? "step" : undefined}
            >
              <Dot n={i + 1} state={s.state} />
              {s.href ? (
                <Link to={s.href} className="min-w-0 truncate transition-opacity hover:opacity-75" style={{ maxWidth: 170 }}>
                  {label}
                </Link>
              ) : (
                label
              )}
              <StateWords state={s.state} />
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** The same steps stacked (a phone): the current one open, `active` under its label. */
export function StepColumn({ steps, active }: { steps: StepView[]; active: ReactNode }) {
  return (
    <ol className="flex flex-col" aria-label="Your first hire, step by step">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const label = (
          <span className="block min-w-0 truncate text-[14px] leading-[1.3]" style={{ color: labelColor(s.state), fontWeight: s.state === "active" ? 600 : 500 }}>
            {s.label}
          </span>
        );
        return (
          <li key={s.key} className="flex gap-3" aria-current={s.state === "active" ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <Dot n={i + 1} state={s.state} />
              {!last && (
                <span
                  aria-hidden
                  className="my-0.5 w-px flex-1"
                  style={{ background: s.state === "done" && steps[i + 1].state !== "todo" && steps[i + 1].state !== "open" ? "var(--jade)" : "var(--line)", minHeight: 8 }}
                />
              )}
            </div>
            <div className={`min-w-0 flex-1 ${last ? "" : "pb-2"}`}>
              <div className="flex min-h-6 items-center justify-between gap-3">
                {s.href ? (
                  <Link to={s.href} className="min-w-0 flex-1 transition-opacity hover:opacity-75">
                    {label}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1">{label}</span>
                )}
                <StateWords state={s.state} />
                {s.aside}
              </div>
              {s.note}
              {s.state === "active" && <div className="mt-3">{active}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
