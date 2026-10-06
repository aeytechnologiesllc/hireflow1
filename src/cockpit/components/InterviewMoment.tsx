import AvaSeal from "@/components/ava/AvaSeal";
import { firstName } from "../lib/avaProse";

/**
 * The guided next step after a move to Interview: "want to propose times
 * now?", in Ava's voice. "Propose times" opens the scheduling wizard; "Later"
 * dismisses it, and the page answers with a brief pulse on its own
 * "Set up interview" button, so the owner sees where scheduling lives
 * without the wizard being forced on him.
 */
export function InterviewMoment({
  name,
  onPropose,
  onLater,
  className = "",
}: {
  name: string;
  onPropose: () => void;
  onLater: () => void;
  className?: string;
}) {
  return (
    <div
      className={`ck-reveal flex flex-wrap items-center gap-3 rounded-[10px] border px-4 py-3 ${className}`}
      style={{ borderColor: "var(--jade-soft-fg)", background: "var(--jade-soft)" }}
    >
      <span className="ck-seal ck-seal-press shrink-0">
        <AvaSeal size={22} />
      </span>
      {/* At least 12rem for the words: on a phone the buttons drop to their
          own line rather than squeezing the question into a column. */}
      <p className="min-w-[12rem] flex-1 text-[13px] leading-[1.5]" style={{ color: "var(--jade-soft-fg)" }}>
        Moved to interviews. Want to propose times to {firstName(name)} now?
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" className="ck-btn ck-btn-primary !py-1.5 !text-[12px]" onClick={onPropose}>
          Propose times
        </button>
        <button type="button" className="ck-btn ck-btn-ghost !py-1.5 !text-[12px]" onClick={onLater}>
          Later
        </button>
      </div>
    </div>
  );
}

export default InterviewMoment;
