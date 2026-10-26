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
 *
 * The eleventh product review: the dialog's line said "No offer letter has
 * gone out" for a declined or voided one, and pointed to Documents for a new
 * letter where that no longer worked (after the hire) or for someone who
 * cannot send one. The line is hireOfferLine (src/lib/documentRequests.ts).
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
      const line = body(lib, "hireOfferLine");
      if (!/const offerUnsigned = offer\?\.kind === "unsigned";/.test(dialog) || !/hireOfferLine\(offer, first, canSendLetters,/.test(dialog) || !/case "expired":\s*return `The offer letter expired before it was signed, so the email doesn't ask for it\.\$\{again\}`;/.test(line)) bad.push("the Hire dialog must ask for a signature only for an unsigned letter, and say when one expired");
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "hire-dialog-says-what-happened-to-the-letter",
    why:
      "The eleventh product review: the Hire dialog said \"No offer letter has gone out\" for a letter that went out " +
      "and was declined, or was voided after the applicant signed (offerLetterState called both \"withdrawn\"), and " +
      "\"{First} signed the offer letter\" for one the team declined on its turn. Fails if offerLetterState folds " +
      "declined or voided back into withdrawn or signed, or if the line for a letter that went out says none did.",
    run: async ({ read }) => {
      const bad = [];
      const lib = await read("src/lib/documentRequests.ts");
      if (!lib) return { ok: false, detail: ["src/lib/documentRequests.ts is missing"] };
      const state = body(lib, "offerLetterState");
      if (!/if \(letter\.is_voided\) return letter\.candidate_signed_at \? \{ kind: "voided" \} : \{ kind: "withdrawn" \};/.test(state)) bad.push("offerLetterState must tell voided (after they signed) from withdrawn (before)");
      const declined = state.indexOf('if (letter.status === "declined") return { kind: "declined", by: letter.candidate_signed_at ? "team" : "applicant" };');
      const signed = state.indexOf("if (letter.candidate_signed_at) return { kind: \"signed\"");
      if (declined === -1 || signed === -1 || declined > signed) bad.push("offerLetterState must call a declined letter declined (and whose), before it reads a signature");
      const line = body(lib, "hireOfferLine");
      for (const kind of ["declined", "voided", "withdrawn"]) {
        const at = line.indexOf(`case "${kind}":`);
        const next = line.indexOf("case ", at + 6);
        const words = at === -1 ? "" : line.slice(at, next === -1 ? undefined : next);
        if (!words) bad.push(`hireOfferLine must have its own line for a ${kind} letter`);
        else if (/No offer letter has gone out/.test(words)) bad.push(`hireOfferLine says no letter went out for a ${kind} one`);
      }
      if ((line.match(/No offer letter has gone out/g) ?? []).length !== 1 || !/case "none":\s*return `No offer letter has gone out\./.test(line)) bad.push("only a missing letter may read \"No offer letter has gone out\"");
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "send-a-new-letter-only-where-it-works",
    why:
      "The eleventh product review: after Hire, the Hire dialog, the letter's sheet and the Documents line said a new " +
      "offer letter could be sent from Documents, but Offer letter listed only people at interview, offered or in " +
      "review, so nobody hired could be found; and the line was shown to a teammate without \"Send documents\", who " +
      "cannot send one. Fails if Offer letter stops listing hired people, if sending one moves them out of Hired, or " +
      "if the Hire dialog points to Documents without knowing the person can send.",
    run: async ({ read }) => {
      const bad = [];
      const hook = await read("src/cockpit/hooks/useOfferLetter.ts");
      const lib = await read("src/lib/documentRequests.ts");
      const dialog = await read("src/cockpit/components/HireDialog.tsx");
      if (!hook || !lib || !dialog) return { ok: false, detail: ["a file this guard reads is missing"] };
      const stages = /const OFFER_STAGES = \[([^\]]*)\]/.exec(hook)?.[1] ?? "";
      if (!/"hired"/.test(stages)) bad.push("Offer letter (useOfferPeople's OFFER_STAGES) must list people already hired");
      if (!/export function useOfferPeople\(enabled: boolean, stages: readonly string\[\] = OFFER_STAGES\)/.test(hook)) bad.push("Offer letter must read its people through OFFER_STAGES");
      if (!/if \(person\.status === "interview" \|\| person\.status === "reviewing"\) \{/.test(hook)) bad.push("sending a letter may move only someone at interview or in review to Offer");
      const line = body(lib, "hireOfferLine");
      if (!/const again = canSend \? " You can send a new one from Documents\." : "";/.test(line) || !/case "none":\s*return `No offer letter has gone out\.\$\{canSend \? " You can still send one from Documents\." : ""\}`;/.test(line)) bad.push("hireOfferLine may point to Documents only when canSend");
      if ((line.match(/from Documents/g) ?? []).length !== 2) bad.push("hireOfferLine must point to Documents only through `again` and the none line");
      if (!/const canSendLetters = !isTeamMember \|\| teamPermissions\?\.canSendDocuments === true;/.test(dialog)) bad.push("the Hire dialog must know a teammate may send documents before it points them to Documents");
      if (/You can (still )?send (a new )?one from Documents/.test(dialog)) bad.push("the Hire dialog writes its own \"send one from Documents\" line again");
      return { ok: bad.length === 0, detail: bad };
    },
  },
];
