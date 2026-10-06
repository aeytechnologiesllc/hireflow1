import { useId, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { PanelLabel } from "./ProfileSection";

/**
 * "Your decision" on the desktop profile (docs/APPLICANT-PROFILE.md): one
 * filled card. The primary action for this applicant's state on top (the
 * page's own logic decides which: Move to interview, Set up interview,
 * Hire…), then the next two side by side (Set up interview and Message),
 * then anything else the state allows (Let them take the next test), then
 * Pass as a quiet text button in the danger tone.
 *
 * The buttons are the page's own actions, the same objects its phone bar
 * draws: every dialog, confirmation and pulse is the page's, so the card and
 * the bar can never do different things.
 */

/** One decision the page offers (CandidateDetail builds them). */
export interface DecisionAction {
  key: "continue" | "advance" | "setup" | "pass" | "message" | "hire" | "takeBack";
  text: string;
  /** The card's own words, when they differ from the bar's ("Pass on Maria"). */
  cardText?: string;
  icon?: ReactNode;
  variant: "primary" | "outline" | "danger";
  onClick: () => void;
  disabled?: boolean;
  pulse?: boolean;
}

export interface DecisionCardActions {
  /** The one to press. Filled only when it is "primary": Ava recommending a
   *  decline leaves it outlined. */
  primary: DecisionAction | null;
  /** Side by side under it. */
  pair: DecisionAction[];
  /** Full width, under the pair. */
  extra: DecisionAction[];
  /** The quiet danger-toned text button at the foot. */
  quiet: DecisionAction | null;
}

/** A decision already made, said as a status line in its tone: not a box in
 *  a button's shape, which would read as a control that does nothing. */
function Outcome({ outcome, className = "" }: { outcome: "hired" | "rejected"; className?: string }) {
  const hired = outcome === "hired";
  return (
    <p
      className={`flex items-center gap-2 text-[14px] font-semibold leading-[1.3] ${className}`}
      style={{ color: hired ? "var(--jade-soft-fg)" : "var(--crit)" }}
    >
      {hired ? <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" /> : <XCircle aria-hidden className="h-4 w-4 shrink-0" />}
      {hired ? "Hired" : "Not moving forward"}
    </p>
  );
}

function ActionButton({ action, filled, className = "", nowrap = false }: { action: DecisionAction; filled: boolean; className?: string; nowrap?: boolean }) {
  return (
    <button
      type="button"
      className={[
        "ck-btn min-h-[44px] !text-[14px] !leading-[1.25] text-center",
        nowrap ? "!whitespace-nowrap" : "!whitespace-normal",
        filled ? "ck-btn-primary" : "ckp-btn-soft",
        action.pulse ? "ck-node-pulse" : "",
        className,
      ].join(" ")}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {/* Words only, as the approved mockup draws them: an icon on one of a
          pair and not the other made the two read as different kinds of
          button. The phone's bar keeps its icons. */}
      {action.cardText ?? action.text}
    </button>
  );
}

function QuietButton({ action, className = "" }: { action: DecisionAction; className?: string }) {
  return (
    <button
      type="button"
      className={`ck-btn ck-btn-ghost min-h-[40px] !text-[14px] !font-medium hover:underline ${className}`}
      style={{ color: "var(--crit)" }}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.cardText ?? action.text}
    </button>
  );
}

export function ApplicantDecisionCard({
  actions,
  outcome,
  layout = "stack",
}: {
  actions: DecisionCardActions;
  /** A decision already made: said in place of the primary. */
  outcome: "hired" | "rejected" | null;
  /** "stack": the desktop's right column (and a narrow column). "row": one
   *  line across the column layout, right after the header. "bar": the same
   *  line with no card, for the column's sticky foot. */
  layout?: "stack" | "row" | "bar";
}) {
  const id = useId();
  const { primary, pair, extra, quiet } = actions;

  if (layout === "row" || layout === "bar") {
    const line = (
      <div className="flex flex-wrap items-center gap-2">
        {outcome && <Outcome outcome={outcome} className="mr-auto min-h-[44px] pr-2" />}
        {/* Each button at least as wide as its words (one line, never "Set
            up / interview"), the room left shared out, the primary's share
            the larger; a button that does not fit moves to the next line. */}
        {primary && <ActionButton action={primary} filled={primary.variant === "primary"} nowrap className="flex-[1.4_1_auto] !px-5" />}
        {pair.map((a) => (
          <ActionButton key={a.key} action={a} filled={false} nowrap className="flex-[1_1_auto] !px-4" />
        ))}
        {extra.map((a) => (
          <ActionButton key={a.key} action={a} filled={false} nowrap className="flex-[1_1_auto] !px-4" />
        ))}
        {/* At the line's far end; when the line wraps it keeps to the right
            rather than sitting alone under the primary. */}
        {quiet && <QuietButton action={quiet} className="ml-auto" />}
      </div>
    );
    if (layout === "bar") return line;
    return (
      <section aria-labelledby={id} className="ckp-decide">
        <PanelLabel id={id}>Your decision</PanelLabel>
        {line}
      </section>
    );
  }

  return (
    <section aria-labelledby={id} className="ckp-decide">
      <PanelLabel id={id}>Your decision</PanelLabel>
      {outcome && <Outcome outcome={outcome} className="mb-3" />}
      {primary && <ActionButton action={primary} filled={primary.variant === "primary"} className="w-full !min-h-[46px]" />}
      {pair.length > 0 && (
        <div className={`mt-2 grid gap-2 ${pair.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {pair.map((a) => (
            <ActionButton key={a.key} action={a} filled={false} className="w-full !px-2.5" />
          ))}
        </div>
      )}
      {extra.map((a) => (
        <ActionButton key={a.key} action={a} filled={false} className="mt-2 w-full" />
      ))}
      {quiet && (
        <div className="mt-1.5 flex justify-center">
          <QuietButton action={quiet} />
        </div>
      )}
    </section>
  );
}

export default ApplicantDecisionCard;
