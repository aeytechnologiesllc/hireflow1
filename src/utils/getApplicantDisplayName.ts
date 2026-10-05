/**
 * Extracts the applicant's display name from application notes (prioritizing
 * the full name from their application form), falling back to profile data.
 */
export function getApplicantDisplayName(
  applicationNotes: string | null | undefined,
  profileFullName: string | null | undefined,
  profileEmail?: string | null | undefined
): string {
  // Try to get name from application answers first
  if (applicationNotes) {
    try {
      const parsed = JSON.parse(applicationNotes);
      const fullNameAnswer = parsed.applicationAnswers?.find(
        (a: { question: string; answer: string }) =>
          a.question.toLowerCase().includes("full name") ||
          a.question.toLowerCase() === "name"
      );
      if (fullNameAnswer?.answer) {
        return fullNameAnswer.answer;
      }
    } catch {
      // Failed to parse, fall through
    }
  }
  // Fall back to profile full_name, then email
  return profileFullName || profileEmail || "Unknown Candidate";
}

/**
 * Gets initials from a display name: the first letter or digit of the first two
 * words that have one, so "Maria (Mia) del Carmen" is "MM", never "M(" — a
 * bracket or a dash is not an initial, and a third letter spills out of the
 * round avatar.
 */
export function getInitialsFromName(name: string): string {
  return (name || "")
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}
