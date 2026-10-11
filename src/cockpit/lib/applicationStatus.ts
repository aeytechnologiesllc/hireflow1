/**
 * Still filling in the application form (status "in_progress"): nothing has
 * been sent yet. Its own small module (2026-10-11, the performance check) so
 * the staff shell can ask without loading the whole record builder
 * (assessmentRecord.ts, which re-exports it).
 */
export function isFillingInForm(status: string | null | undefined): boolean {
  return status === "in_progress";
}
