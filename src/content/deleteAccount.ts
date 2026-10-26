/**
 * deleteAccount.ts: what Settings' Delete Account confirm says goes and
 * what stays. The same as the Privacy Policy's "How long we keep it"
 * (src/content/legal.ts; the twelfth Phase 5 review: the confirm said "All
 * your data ... will be permanently deleted", while the record of each
 * signature, with its IP address and place, stays as proof
 * (prevent_audit_delete), a few technical records stay, and a team member's
 * chats and sent documents go to the business). scripts/legal_pages.test.mjs
 * holds the two together. Its own small module so Settings does not carry
 * the whole policy.
 */
export function deleteAccountWords(who: "applicant" | "business" | "team"): { deleted: string; kept: string[] } {
  const deleted =
    who === "business"
      ? "Your profile, your jobs and every application to them, your messages and your files are deleted."
      : who === "team"
        ? "Your profile and your own files are deleted. Your chats with applicants and the documents you sent them stay with the business, under its owner's name."
        : "Your profile, your applications, your messages, your test records and your files are deleted.";
  return {
    deleted,
    kept: [
      "The record of each document you signed (your name, email address, the time, your IP address, browser, device and approximate place), kept as proof of the signature.",
      "A few technical records the Privacy Policy lists, such as a count of test attempts, block-list entries and error reports.",
    ],
  };
}
