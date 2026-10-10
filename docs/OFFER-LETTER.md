# The offer letter

Built 2026-10-09, after the owner's first interview. He asked: "do you think we
should send ... the offer letter through the portal or should we leave it?" and
chose the portal after a test run.

## What the test run found

The signing engine (`docs/DOCUMENT-SIGNING.md`) was sound: a rolled-back
rehearsal against the live database showed the owner may create a document,
it gets its code and a 14-day expiry, the applicant can see it and gets a note
in their bell, the `document_sent` email is his to set off, and the
`document-signing` function answers. Nothing had ever been sent for real (0
rows in `documents`).

The screens in front of the engine were wrong for him:

1. **An AI wrote the letter, as a United States office job.** The old screens
   (`DocumentWizard.tsx`) asked for an "annual salary" and produced "employment
   at-will" wording. His role is USD 500 a month, one fixed shift, remote, any
   country.
2. **A letter could fail to save at all.** The body was stored with
   `btoa(JSON.stringify(...))`. Base64 in a browser refuses every character
   outside Latin-1, so a curly apostrophe or a long dash (an AI writes both)
   threw and nothing was sent.
3. **Pay and start date could be left empty** and the letter still went on.
4. **The person was picked from everyone who had applied**, with no search.
5. **On a phone the applicant read the letter through a 390px window**,
   between a two-row header and four buttons squeezed into one row.

## What there is now

**One screen, no AI** (`src/cockpit/components/OfferLetterDialog.tsx`, opened
from Documents by "Offer letter", by "Write an offer letter" on an empty
drawer, and by the hire prompt's `/documents?action=create&applicant_id=`).

- Who: the people he has interviewed are listed first; anyone in review can be
  searched for.
- Pay is filled in from the job when the job states one figure. Hours and
  shift are remembered on the device per job, as a convenience only.
- The letter beside the boxes is the letter they will read, word for word
  (`offerLetterText` in `src/cockpit/lib/offerLetter.ts`). Every line comes
  from a box; an empty optional box leaves its line out. It promises nothing he
  did not type: no "at-will", no benefits, no contractor or employee wording.
  That belongs in "Anything else", in his own words.
- It cannot be sent without a person, pay, a start date and a day the offer
  ends; the start date cannot be in the past and the offer cannot end after it.
- Sending emails the applicant, so the button is pressed twice.

**Sending** (`src/cockpit/hooks/useOfferLetter.ts`) is the engine's own way in:
a `documents` row (`offer_letter`, `pending`, expiring at the end of the
reply-by day), the first audit line, a bell note, the `document_sent` email.
One thing is added: the applicant moves to Offer.

**Characters.** The engine draws the final PDF in Helvetica, which has Western
European letters only. `letterSafe` turns typographic quotes and dashes into
plain ones and takes an accent off a letter the font lacks; a name or a
currency sign it cannot print at all (`unprintable`) stops the send and says
what to type instead. `encodeDocumentBody` writes the stored JSON in plain
ASCII (`\u` escapes), so it always saves, and `JSON.parse` gives every reader
back the exact text. The old screens use it too now.

**The applicant's side on a phone** (`SignedDocumentViewer.tsx`): the letter
has the whole screen, the copies to download appear once the document is
finished, and a "Sign" button in the bar goes straight to the place to sign.

## Guided, and the parts a real offer has (2026-10-10)

The owner, with his first real letter on screen: "the offer letter feels
incomplete ... I can't put the company name there ... I don't know if I should
put hours because they can change ... Offer ends date, I don't know if I should
put it there. Basically be a guided ... so that somebody's just hiring for the
first time, they understand how to write this ... make it more legit ... don't
overcomplicate it ... we're not doing it like Google or Microsoft."

The screen is four numbered steps, each box with one line on what to write:

1. **The job**: their name, the job title (now editable), the **company name**
   (always shown; it was hidden behind "Change"), the start date, full or part
   time, hours and shift (optional; if hours can change, keep it general, and
   the letter says hours may change with notice).
2. **Pay**: amount, currency and "a month / a week / an hour" as three boxes,
   how often (twice a month by default: usual for remote workers in the
   Philippines) and how (optional: "Wise or bank transfer").
3. **Terms**, filled in with the usual choices for a remote support role and
   shown as one line until he presses Change: independent contractor (or
   employee), a 30-day trial (none, 2 weeks, 30, 60 or 90 days), 14 days'
   notice to end (7, 14 or 30), remote, their own computer and internet,
   keeping company and customer information private, and who they report to.
4. **Sending**: "Time to sign" as 3, 5 or 7 days (5 by default) instead of a
   date picker, with the day it ends spelled out; anything else; and who signs
   it (name, and a title such as Owner).

The letter now reads like an offer: a short welcome, then THE ROLE, PAY, TRIAL
PERIOD (when there is one), GOOD TO KNOW (the expectations chosen in Terms and
how either side can end it), anything else, TO ACCEPT, and "Sincerely, Zack,
Owner, Zulu Support Team". A name typed in small letters ("zack") signs with a
capital. Every word is still on the screen beside the boxes before it is sent,
and it is still not AI. The screen says it is a plain-language letter, not
legal advice. What stays the same for a job (hours, shift, how they are paid,
the terms, his title) is remembered on the device for the next offer.

The stored body says `writtenBy: "offer-letter-2"` and keeps the arrangement,
trial and notice beside the pay and start date.

## Not done

- The first real letter has still never been signed on the live site. Before
  the first real offer, send one to an account of his own and sign it.
- The final PDF step (countersign) has not been exercised with a name outside
  Western European letters; the letter itself is kept printable, a typed
  signature is not checked.
- "+ New document" still opens the old AI screens for every other kind of
  document.

## Looking at it offline

`/documents?__preview=1&__previewRole=employer&__previewScenario=zulu`: send a
letter; it is filed as a real one would be. `&__previewDocs=offer` starts with
one waiting on the applicant, `offer,signed` with it waiting on the owner,
`offer,done` with it finished. The applicant's side:
`/my-documents?__preview=1&__previewRole=candidate&__previewScenario=zulu&__previewDocs=offer`.

Tests: `scripts/offer_letter.test.mjs`.
