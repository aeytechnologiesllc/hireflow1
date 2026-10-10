import { Fragment } from "react";

/**
 * A letter written as plain text (the offer letter, src/cockpit/lib/offerLetter.ts):
 * paragraphs split by a blank line; a short all-caps first line is a heading
 * ("PAY", "TRIAL PERIOD"); a line starting "- " is a bullet. Used by the
 * offer letter's preview (the team's side) and the applicant's signing
 * screen, so both read the same letter.
 */
export function LetterText({ text }: { text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <>
      {paragraphs.map((paragraph, i) => {
        const lines = paragraph.split("\n");
        const heading = /^[A-Z][A-Z ]{2,24}$/.test(lines[0]) ? lines[0] : null;
        const body = heading ? lines.slice(1) : lines;
        return (
          <div key={i} className={i > 0 ? "mt-3.5" : ""}>
            {heading && (
              <div className="mb-1 text-[11px] font-semibold tracking-[0.1em]" style={{ color: "var(--ink-3, hsl(var(--muted-foreground)))" }}>
                {heading}
              </div>
            )}
            {body.map((line, j) =>
              line.startsWith("- ") ? (
                <div key={j} className="relative pl-4">
                  <span className="absolute left-0" aria-hidden>
                    &bull;
                  </span>
                  {line.slice(2)}
                </div>
              ) : (
                <Fragment key={j}>
                  {line}
                  {j < body.length - 1 && <br />}
                </Fragment>
              ),
            )}
          </div>
        );
      })}
    </>
  );
}

export default LetterText;
