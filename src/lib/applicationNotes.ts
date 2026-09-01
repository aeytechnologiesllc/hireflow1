/**
 * applications.notes is a JSON blob every phase screen reads and writes —
 * uploads, saved answers, submission markers, per-step state.
 *
 * It was being read with a bare `JSON.parse` on the candidate screens, and in
 * ApplicationFormPhase that happened DURING RENDER:
 *
 *     const notes = application?.notes ? JSON.parse(application.notes) : {};
 *
 * A row whose notes are malformed — a partial write, a legacy value, anything
 * that is not valid JSON — throws inside the render pass, React unwinds the
 * tree, and the candidate is left staring at a blank screen in the middle of an
 * application they were part-way through. There is no error boundary that makes
 * that recoverable, and no message telling them what happened.
 *
 * The employer side already had the safe version (`parseApplicationNotes` in
 * cockpit/lib/mappers.ts). This is that function, moved somewhere neither side
 * has to reach across a layer to use; mappers re-exports it so existing
 * employer imports keep working.
 *
 * Reading notes must never be able to take a screen down. Failing to an empty
 * object is right: a screen with no saved state renders its empty state, which
 * is honest and recoverable, where a thrown error is neither.
 */
export function parseApplicationNotes(notes: string | null | undefined): Record<string, unknown> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    // A JSON scalar ("5", "true", a bare string) parses fine but is not a notes
    // object, and callers all index into it. Treat it as absent.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
