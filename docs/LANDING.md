# HireFlow's front page: "The Desk" (2026-10-30)

hireflownow.com/ is HireFlow's own landing page: `public/landing.html`, one
static file with its own look, not the app's: a sage desk (`--desk` #C6CFBE)
lit by a warm wash from the top right, deep green ink (`--ink` #1D3329), the
jade (`--action` #0F6B4F) for the words and the button that matter, Ava's
green wax seal, and three faces from Google Fonts (Besley for headings,
Schibsted Grotesk for text, Courier Prime for the typed letters). The owner
approved this design on 2026-10-30 (the mock-up was "landing-polish"). It
replaced "one night on a turning Earth" (2026-10-09 to 2026-10-29): there is
no globe, no night or morning, no "Watch one night" button, no dark glass,
and none of them come back. Proof: `scripts/landing_page.test.mjs` and the
guards in `scripts/guards/phase-3-launch-locks.mjs`.

## How it is served

`middleware.js` (Vercel Routing Middleware, matcher `/` only) rewrites
hireflownow.com/ to `/landing.html`. A rewrite in `vercel.json` cannot do it:
Vercel serves a file that exists before applying rewrites, and `/` is the
app's own `index.html` (a try in June 2026 fell back to an iframe).
staff.hireflownow.com/ is left alone, so the hiring team still goes straight
to sign-in or the dashboard. No dependency: `@vercel/functions`' `rewrite()`
and `next()` are the two response headers the file sets itself.

## What did not move (the applicants' side)

- Job pages and short links (`/candidate/job/<id>`, `/team-lead`), sign-in
  (`/candidate/auth`), `/applications` and every step: unchanged.
- The careers page (open roles) moved from `/` to `/careers`
  (`CAREERS_PATH`, `src/lib/hosts.ts`). "/" inside the app goes to
  `/careers` on the applicants' site; "See open roles" goes to the business
  the applicant last looked at, else to `/open-jobs` (every business's live
  jobs; `src/lib/openRoles.ts`).
- The landing has "Looking for a job?" in its bar (just "Jobs" on a phone)
  and "Open jobs" in its footer, both to `/open-jobs`. Someone already signed
  in on the site (an applicant) sees "My applications" ("Applications" on a
  phone), to `/applications`, instead.
- A shared job link shows a plain "Now hiring. Apply online." picture
  (`public/share/careers.jpg`) for any business, and the owner's own business
  keeps its careers picture (`public/share/zulu-careers.jpg`): the shell's
  `og:image`, and the job and careers pages' server renders
  (`api/job-prerender.mjs`, `api/careers-prerender.mjs`). It never says
  "remote" or "work from home" (guard
  `share-image-neutral-for-other-businesses`).
- The landing's own picture is `public/share/hireflow.jpg` (also the blog's,
  Open jobs' and the sign-up link's, `public/share-signup.html`). Both are
  made by `node scripts/make-share-images.mjs`, in the Desk's look since
  2026-10-30: the sage desk and its warm wash, Besley headline, the jade for
  "on your desk." / "Apply online." with the page's own underline, the green
  mark, and for HireFlow's picture letters on the desk, three sealed by Ava,
  with "First job free" as a postage stamp. The near-black and gold card
  before it is retired (the owner: no harsh black and white). After a
  change, check the card in Facebook's Sharing Debugger once it is deployed.

## The page

### The bar

Pinned for the whole page (`.bar { position: fixed; ... }`): the logo, Guides
(`/blog`; hidden under 900 px), Looking for a job?, Sign in (the hiring team's
sign-in, staff.hireflownow.com/auth) and **Post a job**, a small postage
stamp (id `startFree`) to the sign-up tab (`/auth?mode=signup`). Over the
hero's first screen it is the nav as drawn; once the page moves (`scrollY >
4`, class `pinned`) it tightens to `--barh` and takes the desk's own sage
with a blur and a hairline, no shadow. The story's words always start under
it, on a phone and on a short screen.

### The hero

"Hundreds apply. Three land **on your desk.**" (the last line in the jade,
with a hand-drawn underline that stays drawn through every replay), what
HireFlow does in one sentence, and the big stamp, **Post your first job,
free** (id `heroStart`), with a postmark that reads "No card.". The headline
is in the page from the first paint, never hidden to rise in.

Beside it (under it on a phone, under 900 px) the desk plays once, about five
seconds, and comes to rest: application letters land on the sage desk while a
card for the job ("Customer Support Agent") counts to 153 applied and says
what Ava is doing ("Ava gives each one the chat test", "Ava read every
reply", "71 finished · Ava seals the best", "71 finished · 3 to call"); Ava's
note "Three worth a call. I read all 71 replies." comes in; her green wax
seal stamps three slips (Carla Villanueva 89, Mika Lim 86, Maria Santos 92,
"Call first"); the rest are squared into a stack with a paper band, "150 set
aside". A slip turns over to show her reply; the stack fans out to show
Ava's reason on a few; "Watch again" sweeps the desk and plays it once more.

### The story: four chapters, scrubbed by scroll

Below the hero the same desk keeps going in `#story`: a pinned stage, one
scroll unit is 0.7 of a screen, 5.68 units long. The desk follows the scroll
with a critically damped follower (it eases in and out, never surges, and a
long jump replays only its last stretch). The seals, stamps and rings are
"beats": passing a point decides one happens, and it then plays in its own
time, so a fast scroll never skips a press. The rail ("How it works": Post,
Share, Ava reads, Call) jumps to each chapter.

1. **Post the job. Ava writes the test.** An index card ("About your
   business") is typed; Ava writes three jobs with their customer tests: an
   online store's (Chat), a software company's (Email) and a dental office's
   (Chat and email).
2. **Share the link anywhere.** The link goes out to job boards, groups and
   your own site, and letters come back. The ledger card "Our own job ·
   October 2026" shows 153 applied in the first four days.
3. **Ava reads every reply.** Maria's envelope turns over and opens: Rosa, a
   patient charged twice, and Maria's reply ("I'm so sorry, Rosa ... I'll call
   you by 3 pm today"). Ava marks "Uses her name", "Fixes it", "Gives a
   time", rings 92, seals it and writes "Call first".
4. **Three worth a call.** Carla and Mika come back beside Maria; others
   leave the stack with Ava's reason ("Promised a wrong refund", "Missed the
   real question"), and the band "150 set aside" goes round the rest. The
   ledger adds 71 who finished the written interview and the ringed 3: "We
   hired from those three."

### The ending

**Your first job is free.** Your own envelope lands ("From: your business";
"Job: Customer service agent"; Medical and dental · Online stores ·
Software · Home services · Gaming), the big stamp goes on it as its postage,
and the postmark strikes. That stamp is the page's third sign-up link, **id
`endStart`**: it is written in the page (in a hidden `.ysrc` holder) and the
story script **moves that same element** into the envelope
(`ylink = document.getElementById("endStart"); ydrop.appendChild(ylink);`).
It is never cloned or rebuilt from a string, so whichever runs first,
`carry-source.js` (which adds the visitor's campaign tags to every sign-up
link once, when the page has been read) or the story, the one link keeps the
visitor's tags. The test counts three sign-up links as written in the page
and fails on one made by a script. A keyboard user who tabs to it is taken to
the end, where it can be seen.

So the page has one button, everywhere: **Post a job** in the bar, the big
stamp **Post your first job, free** in the hero and again at the end (guard
`landing-single-cta-pinned`: exactly those three links, `startFree`,
`heroStart`, `endStart`).

### Sizes

The hero and the story were designed at a laptop (1280x760, 1440x900) and a phone (390x844, 375x667,
360x640); those renders are the approved ones. Everything in between is an added size class that
CSS and the scripts both read through the same `matchMedia` queries, so the approved sizes do not move:

- **Narrow or short laptop** (the wide layout under 1280 wide, or under 680 tall): the desk shrinks to
  fit beside the words, starts clear of the "No card." postmark, and "Watch again" moves clear of
  Maria's slip.
- **Upright tablet** (700 to 1099 wide, portrait; and portrait phones from 480 wide): the phone's
  order (headline, desk, button) with the desk as one column a desktop slip wide, scaled as a whole,
  never stretched to the screen's width.
- **Sideways** (560 to 899 wide and wider than tall, or 900+ wide and under 580 tall): headline,
  button and the desk's key moment share the first screen; the story's captions run down the left.

The story re-lays out when the size class changes, even on a height-only change.

### Motion: plays and stops

- **Animation runs only while something moves.** The hero's frame loop runs
  for the first play (and a replay, a fan or a slip moving), only while the
  hero is on the screen (an IntersectionObserver), then stops. The story's
  runs only while the desk is catching up with the scroll or a beat is
  playing. Nothing loops: the typed card's caret blinks six times, then holds.
- **No light or glow follows the mouse** (the owner); the page has no
  `pointermove` or `mousemove` listener.
- **Reduced motion** (`prefers-reduced-motion: reduce`): the hero shows its
  finished desk at once; the story shows each chapter's finished state,
  crossed with a short fade and nothing moving, and the rail jumps without
  smooth scrolling; transitions are off.
- **The fonts.** The faces' stylesheet (`id="hfFontCss"`) loads with
  `media="print"` and switches to `all` when it arrives, so it never blocks
  the first paint (a `<noscript>` link covers no-script). The desk waits for
  that stylesheet and then the four faces it draws with (Besley 650, Besley
  italic 500, Schibsted Grotesk 500, Courier Prime), **a second at most**
  (`window.__hfFonts`, shared by both scripts); if a face arrives later, the
  desk lays itself out again on `loadingdone`.

### The words and the numbers

- Customer service agents, chat and email, for any business that answers
  customers (docs/LAUNCH-PLAN.md, Phase 3, task 3; chat and email only since
  2026-10-29). The story's test is everyday: a patient charged twice.
- **The three numbers are real**, from the owner's own role, October 2026:
  153 applied in its first four days, 71 finished the written interview, 3
  were worth a call ("We hired from those three."). Every other claim on the
  page agrees with them: Ava "read all 71 replies" and the band says "150 set
  aside", never "150 read" (until 2026-10-30 the page said "I read all 153
  replies" and "150 read · set aside", though the 82 who never finished sent
  no reply to read). What the 71 finished has one name, "the written
  interview". The footer says the businesses, Maria, Carla, Mika, Rosa and
  the other names on the desk are examples, not real people.
- No prices while billing is off ("Your first job is free" and "No card."
  only). No night, morning or time-of-day story (the owner, 2026-10-30). No
  sweepstakes, casino, payout or player wording (the one allowed line is
  "Gaming: Players, payments and account checks.").
- One logo: the jade rising line on the deep green tile (BRANDING.md), in
  the bar and every icon; the same line is pressed into Ava's seal and drawn
  on the stamps.
- Structured data: the organisation (with its legal name, Southern Digital
  Technologies LLC) and the app. An About line and the legal links in the
  footer. Screen readers get the desk in words (`.sr` paragraphs for the
  hero and the story); the moving desk itself is `aria-hidden`.

## Editing it

Edit `public/landing.html` directly. Its inline scripts are hashed into the
Content-Security-Policy, so after changing one run
`node scripts/csp.mjs --write`, then `node scripts/landing_page.test.mjs`
and `node scripts/guardrails.mjs`. Copy that the owner approved (the
headline, the chapters, the ending) changes only with the owner's OK.
