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
 *
 * `summary` is the line under "Delete Account" in Settings' Danger Zone, in
 * the confirm's own words (the fourteenth Phase 5 review: that row still said
 * "Permanently delete your account and all data" after the confirm was fixed).
 */
export function deleteAccountWords(who: "applicant" | "business" | "team"): { summary: string; deleted: string; kept: string[] } {
  const summary =
    who === "business"
      ? "Permanently delete your account, your jobs and every application to them. The record of each signed document and a few technical records stay."
      : who === "team"
        ? "Permanently delete your account and your own files. Your chats with applicants and the documents you sent them stay with the business."
        : "Permanently delete your account, your applications and your files. The record of each document you signed and a few technical records stay.";
  const deleted =
    who === "business"
      ? "Your profile, your jobs and every application to them, your messages and your files are deleted."
      : who === "team"
        ? "Your profile and your own files are deleted. Your chats with applicants and the documents you sent them stay with the business, under its owner's name."
        : "Your profile, your applications, your messages, your test records and your files are deleted.";
  return {
    summary,
    deleted,
    kept: [
      "The record of each document you signed (your name, email address, the time, your IP address, browser, device and approximate place), kept as proof of the signature.",
      "A few technical records the Privacy Policy lists, such as a count of test attempts, block-list entries and error reports.",
    ],
  };
}
