/**
 * The welcome email asks the applicant to sign their offer letter only while
 * it is theirs to sign (docs/DOCUMENT-REQUESTS.md, "Hiring").
 *
 * The tenth product review: hiring someone whose offer letter had passed its
 * date unsigned put "Sign your offer letter" in the welcome email, and the
 * Hire dialog said "{First} hasn't signed the offer letter yet, so the email
 * asks for that too.", though My Documents shows the letter as "Expired" with
 * only "View" and document-signing refuses a signature after the date. The
 * email function and the dialog now answer by one rule, offerLetterWaiting
 * (supabase/functions/_shared/welcomeTodo.ts and src/lib/documentRequests.ts,
 * held together by scripts/document_requests.test.mjs; the real function is
 * run both ways in scripts/notification_access.test.mjs).
 */

/** The body of `export function <name>(...) {...}`, or "". */
function body(src, name) {
  return new RegExp(`export function ${name}\\([\\s\\S]*?\\n}`).exec(src ?? "")?.[0] ?? "";
}

export default [
  {
    id: "hire-email-leaves-out-an-expired-offer-letter",
    why:
      "The tenth product review: the welcome email and the Hire dialog asked the applicant to sign an offer letter " +
      "whose date had passed, a task nobody can do. Fails if the email function stops reading the letter's date or " +
      "deciding through offerLetterWaiting, if either copy of that rule stops refusing a letter past its date, or if " +
      "the dialog's state calls an expired letter unsigned.",
    run: async ({ read }) => {
      const bad = [];
      const fn = await read("supabase/functions/send-notification-email/index.ts");
      const shared = await read("supabase/functions/_shared/welcomeTodo.ts");
      const lib = await read("src/lib/documentRequests.ts");
      const hook = await read("src/cockpit/hooks/useHire.ts");
      const dialog = await read("src/cockpit/components/HireDialog.tsx");
      if (!fn || !shared || !lib || !hook || !dialog) return { ok: false, detail: ["a file this guard reads is missing"] };

      if (!/\.select\("candidate_signed_at, is_voided, status, expires_at"\)/.test(fn)) bad.push("the hire email must read the offer letter's expires_at");
      if (!/const offerUnsigned = offerLetterWaiting\(letter\);/.test(fn)) bad.push("the hire email must decide the offer line through offerLetterWaiting");
      if (/const offerUnsigned = !!letter && /.test(fn)) bad.push("the hire email decides the offer line by hand again, without the date");

      for (const [where, src] of [["_shared/welcomeTodo.ts", shared], ["src/lib/documentRequests.ts", lib]]) {
        const rule = body(src, "offerLetterWaiting");
        if (!/if \(!letter \|\| letter\.candidate_signed_at \|\| letter\.is_voided \|\| letter\.status !== "pending"\) return false;/.test(rule)) bad.push(`${where}: offerLetterWaiting must refuse a letter signed, withdrawn or not pending`);
        if (!/return !\(letter\.expires_at && new Date\(letter\.expires_at\)\.getTime\(\) <= now\.getTime\(\)\);/.test(rule)) bad.push(`${where}: offerLetterWaiting must refuse a letter past its date`);
      }

      const state = body(lib, "offerLetterState");
      if (!/if \(offerLetterWaiting\(letter, now\)\) return \{ kind: "unsigned"/.test(state) || !/if \(letter\.status === "pending"\) return \{ kind: "expired" \};/.test(state)) bad.push("offerLetterState must call a letter past its date \"expired\", not \"unsigned\"");
      if (!/\.select\("status, candidate_signed_at, is_voided, expires_at, created_at"\)/.test(hook) || !/return offerLetterState\(/.test(hook)) bad.push("useOfferLetterState must read the letter's date and answer through offerLetterState");
      if (!/const offerUnsigned = offer\?\.kind === "unsigned";/.test(dialog) || !/offer\.kind === "expired"/.test(dialog)) bad.push("the Hire dialog must ask for a signature only for an unsigned letter, and say when one expired");
      return { ok: bad.length === 0, detail: bad };
    },
  },
];
