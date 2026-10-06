/**
 * jobLabels.ts — a job's type and level in words, for the careers page and the
 * job page alike. Both used to print the stored value: the job page showed a
 * raw "full-time" and "lead" in lowercase badges, and the careers page its own
 * copy of the level names. One map, one rule, here.
 *
 * Import-free, so plain Node can load it.
 */

/** experience_level → the words a badge shows. */
export const JOB_LEVELS: Readonly<Record<string, string>> = Object.freeze({
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead",
});

/** "lead" → "Lead"; an unknown level is shown with a capital, never dropped. */
export function jobLevelLabel(level: string | null | undefined): string | null {
  const raw = String(level ?? "").trim();
  if (!raw) return null;
  return JOB_LEVELS[raw.toLowerCase()] ?? capitalise(raw.replace(/[-_]+/g, " "));
}

/** "full-time" → "Full time", "part_time" → "Part time", "contract" → "Contract". */
export function jobTypeLabel(type: string | null | undefined): string | null {
  const raw = String(type ?? "").trim();
  if (!raw) return null;
  return capitalise(raw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").toLowerCase());
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
