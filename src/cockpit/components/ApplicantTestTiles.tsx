import { ChevronRight, Keyboard, RotateCcw } from "lucide-react";
import { EntryIcon, LiveDot } from "./AssessmentRecordList";
import { liveTone, toneColor, type AssessmentEntry } from "../lib/assessmentRecord";
import { notTakenGroups, SHORT_LABEL_MAX, type TestTile, type TestTileRow } from "../lib/applicantProfile";

/**
 * "Tests" on the desktop profile (docs/APPLICANT-PROFILE.md): one tile per
 * test on the record, in a grid that fits three across on a wide screen and
 * two on a laptop. A tile shows the figure, the verdict in its tone and up to
 * two rows, and opens the same record sheet the phone's "What they
 * submitted" rows open. A test not finished says where it stands, in the
 * record's own words; the ones not taken are said in one quiet line under
 * the tiles, in the rail's words ("Skipped", "Not reached yet").
 */

const TONE: Record<string, string> = {
  jade: "var(--jade)",
  amber: "var(--amber-fg)",
  ink: "var(--ink)",
  muted: "var(--ink-3)",
};

/** A row whose label is a question's own words goes on its own line, its
 *  answer under it at full width: side by side, both broke mid-phrase. A
 *  pick-several answer keeps each pick on a line of its own. */
function TileRow({ row }: { row: TestTileRow }) {
  const color = row.tone ? TONE[row.tone] : "var(--ink)";
  const values = row.values ?? [row.value];
  if (row.label.length > SHORT_LABEL_MAX) {
    return (
      <span className="flex flex-col text-[12.5px] leading-[1.4]">
        <span style={{ color: "var(--ink-3)" }}>{row.label}</span>
        {values.map((v) => (
          <span key={v} className="break-words" style={{ color }}>
            {v}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="flex items-start justify-between gap-3 text-[12.5px] leading-[1.4]">
      <span className="min-w-0 flex-1" style={{ color: "var(--ink-2)" }}>
        {row.label}
      </span>
      <span className="flex max-w-[62%] flex-none flex-col items-end break-words text-right" style={{ color }}>
        {values.map((v) => (
          <span key={v}>{v}</span>
        ))}
      </span>
    </span>
  );
}

function TileBody({ tile }: { tile: TestTile }) {
  const { entry } = tile;
  // Theirs to take now, but nothing of it on file yet: "Not started", as the
  // rail's gem says it, with no live dot (nobody is in it).
  const untouched = tile.state === "live" && !entry.session && !entry.retake && !entry.waiting && entry.kind !== "application";
  const live = tile.state === "live" && !untouched;
  const liveState = live ? entry.session?.live?.state ?? (entry.waiting ? "waiting" : null) : null;
  return (
    <>
      <span className="flex items-start gap-2 pr-[58px]">
        <span aria-hidden className="mt-[1px] shrink-0" style={{ color: tile.state === "none" ? "var(--ink-3)" : "var(--jade-soft-fg)" }}>
          <EntryIcon entry={entry} className="h-[14px] w-[14px]" />
        </span>
        <span className="min-w-0 break-words text-[11px] font-semibold uppercase leading-[1.35] tracking-[0.12em]" style={{ color: "var(--ink-3)" }}>
          {entry.title}
        </span>
      </span>

      {tile.state === "done" ? (
        <>
          {tile.big && (
            <span className="mt-2 block">
              <span className="ck-num text-[28px] leading-none" style={{ color: toneColor(entry.tone === "muted" ? "ink" : entry.tone) }}>
                {tile.big.value}
              </span>
              {tile.big.unit && (
                <span className="ml-[3px] text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {tile.big.unit}
                </span>
              )}
            </span>
          )}
          {tile.verdict && (
            <span className="mt-1.5 block text-[12.5px] leading-[1.4]" style={{ color: tile.verdict.tone === "ink" ? "var(--ink-2)" : TONE[tile.verdict.tone] }}>
              {tile.verdict.text}
            </span>
          )}
          {tile.flags > 0 && (
            <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--amber-fg)" }}>
              <span aria-hidden className="block h-[6px] w-[6px] rounded-full" style={{ background: "var(--amber-fg)" }} />
              {tile.flags} {tile.flags === 1 ? "flag" : "flags"}
            </span>
          )}
          {tile.notes.length > 0 && (
            <span className="mt-1.5 flex flex-col gap-[3px]">
              {tile.notes.map((note) => (
                <span key={note.text} className="flex items-start gap-1.5 text-[12px] leading-[1.4]" style={{ color: note.tone === "amber" ? "var(--amber-fg)" : "var(--ink-3)" }}>
                  {note.kind === "typing" ? (
                    <Keyboard aria-hidden className="mt-[2px] h-3 w-3 shrink-0" strokeWidth={2.2} />
                  ) : (
                    <span aria-hidden className="mt-[6px] block h-[4px] w-[4px] shrink-0 rounded-full" style={{ background: "currentColor" }} />
                  )}
                  <span className="min-w-0 break-words">{note.text}</span>
                </span>
              ))}
            </span>
          )}
          {tile.rows.length > 0 && (
            <>
              {/* The rows sit at the tile's foot, so tiles side by side line
                  their details up whatever is above them. */}
              <span aria-hidden className="block min-h-2.5 flex-1" />
              <span className="flex flex-col gap-[3px] border-t pt-2.5" style={{ borderColor: "var(--line-soft)" }}>
                {tile.rows.map((row) => (
                  <TileRow key={row.label} row={row} />
                ))}
              </span>
            </>
          )}
        </>
      ) : (
        <span
          className="mt-3 flex items-start gap-2 text-[12.5px] leading-[1.45]"
          style={{ color: live ? (liveState === "doing" || liveState === "checking" ? "var(--ink-2)" : liveTone(liveState)) : "var(--ink-3)" }}
        >
          {live &&
            (entry.retake === "open" ? (
              <RotateCcw aria-hidden className="mt-[2px] h-3.5 w-3.5 shrink-0" />
            ) : (
              <LiveDot state={liveState} className="mt-[5px]" />
            ))}
          {/* The record's own words for a test nothing is on file for yet. */}
          <span className="min-w-0 break-words">{untouched ? "Not started yet" : entry.statusLabel}</span>
        </span>
      )}
      {tile.state === "live" && tile.flags > 0 && (
        // A flag on the attempt in progress, as on the phone's row.
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--amber-fg)" }}>
          <span aria-hidden className="block h-[6px] w-[6px] rounded-full" style={{ background: "var(--amber-fg)" }} />
          {tile.flags} {tile.flags === 1 ? "flag" : "flags"}
        </span>
      )}

      {entry.openable && (
        <span aria-hidden className="absolute right-3.5 top-3.5 inline-flex items-center gap-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
          Open
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-[2px]" />
        </span>
      )}
    </>
  );
}

function tileLabel(tile: TestTile): string {
  const { entry } = tile;
  const parts =
    tile.state === "done"
      ? [tile.big ? `${tile.big.value}${tile.big.unit ? ` ${tile.big.unit}` : ""}` : null, tile.verdict?.text ?? null, ...tile.notes.map((n) => n.text), ...tile.rows.map((r) => `${r.label} ${r.value}`)]
      : [entry.statusLabel];
  return `${entry.title}: ${parts.filter(Boolean).join(", ")}. ${tile.state === "done" ? "Open what they submitted." : "Open what they have done so far."}`;
}

export function ApplicantTestTiles({ tiles, onOpen }: { tiles: TestTile[]; onOpen: (entry: AssessmentEntry) => void }) {
  if (tiles.length === 0) return null;
  // Not taken: one quiet line under the tiles, not a dashed box each.
  const shown = tiles.filter((t) => !(t.state === "none" && !t.entry.openable));
  const notTaken = notTakenGroups(tiles);
  return (
    <div className="ckp-tests">
      {shown.map((tile) =>
        tile.entry.openable ? (
          <button
            key={tile.key}
            type="button"
            className="ckp-tile ck-lift group text-left"
            data-state={tile.state}
            aria-label={tileLabel(tile)}
            onClick={() => onOpen(tile.entry)}
          >
            <TileBody tile={tile} />
          </button>
        ) : (
          <div key={tile.key} className="ckp-tile" data-state={tile.state}>
            <TileBody tile={tile} />
          </div>
        ),
      )}
      {notTaken.length > 0 && (
        <p className="ckp-tests-none text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
          {notTaken.map((g) => (
            <span key={g.words} className="block">
              <span className="font-semibold" style={{ color: "var(--ink-2)" }}>
                {g.words}:
              </span>{" "}
              {g.titles.map((t, j) => (j === 0 ? t : lowerFirst(t))).join(", ")}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** "Player chat practice" after a comma reads "player chat practice". */
function lowerFirst(title: string): string {
  return /^[A-Z][a-z]/.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title;
}

export default ApplicantTestTiles;
