import { ChevronRight } from "lucide-react";
import { clip } from "../lib/avaProse";
import type { InTheirWords } from "../lib/applicantProfile";
import { ProfileSection } from "./ProfileSection";

/**
 * "In their words" on the desktop profile (docs/APPLICANT-PROFILE.md): the
 * two written answers that matter most for the job (inTheirWords in
 * ../lib/applicantProfile.ts), quoted as they wrote them, and "All N
 * answers ›", which opens the application's record sheet. Left out when
 * the form had nothing written out.
 */

/** A quote this long is cut at a sentence; the record sheet holds it whole. */
const QUOTE_MAX = 600;

/** Their words, cut only past QUOTE_MAX, and then always marked as cut: a
 *  quote that stops at a full stop must not read as the whole answer. */
function quoted(answer: string): string {
  const shown = clip(answer, QUOTE_MAX);
  return shown.length < answer.length && !shown.endsWith("…") ? `${shown} …` : shown;
}

export function ApplicantInTheirWords({ words, onAll }: { words: InTheirWords; onAll: (() => void) | null }) {
  if (words.picks.length === 0) return null;
  const sub = words.forLead
    ? "The two answers that matter most for a lead"
    : words.picks.length === 1
      ? "The one answer they wrote out"
      : "The first two answers they wrote out";
  return (
    <ProfileSection
      title="In their words"
      sub={sub}
      more={
        onAll && words.total > 0 ? (
          <button type="button" className="inline-flex items-center gap-0.5 text-[13px] font-medium hover:underline" style={{ color: "var(--jade-soft-fg)" }} onClick={onAll}>
            All {words.total} {words.total === 1 ? "answer" : "answers"}
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : null
      }
    >
      <div className={words.picks.length > 1 ? "grid grid-cols-1 gap-[22px] min-[900px]:grid-cols-2" : "max-w-[720px]"}>
        {words.picks.map((pick) => (
          <figure key={pick.id} className="min-w-0">
            <figcaption className="mb-1.5 text-[12.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
              {pick.question}
            </figcaption>
            <blockquote className="break-words border-l-2 pl-3 text-[14px] leading-[1.6]" style={{ color: "var(--ink)", borderColor: "var(--brass-line)" }}>
              &ldquo;{quoted(pick.answer)}&rdquo;
            </blockquote>
          </figure>
        ))}
      </div>
    </ProfileSection>
  );
}

export default ApplicantInTheirWords;
