#!/usr/bin/env node
/**
 * "Email me the link" on the Continue on your computer screen
 * (docs/COMPUTER-ONLY-TESTS.md): the email's words and who may have it
 * (supabase/functions/_shared/continueOnComputerEmail.ts), how the page reads
 * the answer (src/lib/continueLinkEmail.ts), and the wiring between them.
 *
 * The owner, 2026-10-06, about applicants who reach that screen on a phone
 * and stop there: "make it a little bit easy if there is a way."
 *
 * What must stay true, because this is the one email an applicant can ask
 * the system to send:
 *  - it goes to whoever is signed in, for an application that is theirs and
 *    open. Nothing in the request can point it at anyone else, and nothing in
 *    the request reaches the email's words;
 *  - it is limited per person and for everyone together, and a limiter that
 *    cannot be asked sends nothing (the mail quota carries every other email);
 *  - the page only ever says "sent" when the function said so;
 *  - the screen still starts no test, no timer and no attempt.
 *
 * Run with: node scripts/continue_link_email.test.mjs
 */
import { readFile } from "node:fs/promises";
import * as S from "../supabase/functions/_shared/continueOnComputerEmail.ts";
import * as P from "../src/lib/continueLinkEmail.ts";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
const src = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const show = (v) => JSON.stringify(v);
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (text) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";
const APP = "44444444-4444-4444-8444-444444444444";
const JOB = "Chat Support Team Leader (Zulu Royal & Zulu Rush)";

/* ── 1. The email ──────────────────────────────────────────────────────── */

console.log("\nThe email:\n");
{
  const words = S.continueOnComputerEmail({ firstName: "Maria Santos", jobTitle: JOB, siteHost: "hireflownow.com" });
  const text = words.lines.join(" ");
  check("the subject says what it is for", words.subject === "Continue your application on your computer");
  check("it opens by name, and says they asked for it", words.lines[0] === "Hi Maria, here is the link you asked for.", words.lines[0]);
  check("it says the next part is done on the computer they'd use for the job, by the job's name", words.lines[1] === `The next part of your application for the ${JOB} role is done on the computer you'd use for this job.`, words.lines[1]);
  check("it gives both ways in: the button, or the address typed by hand with the same email", /press the button below/.test(words.lines[2]) && /go to hireflownow\.com\/applications there and sign in with this email address/.test(words.lines[2]), words.lines[2]);
  check("it says they land where they left off, and that nothing is lost", /taken straight to where you left off/.test(words.lines[2]) && words.lines[3] === "Everything you've done so far is saved.");
  check("the button says what it does", words.button === "Continue my application" && words.title === "Continue on your computer");
  check("four short paragraphs", words.lines.length === 4 && text.split(/\s+/).length <= 90, `${text.split(/\s+/).length} words`);
  const all = [words.subject, words.title, words.button, ...words.lines].join(" ");
  check("it never names what does the checking behind the tests", !/\b(ava|a\.?i\.?|artificial intelligence|bot|automated|algorithm|machine|robot|model)\b/i.test(all));
  check("no dashes standing in for punctuation", !/[—–]/.test(all));

  const bare = S.continueOnComputerEmail({});
  check("with no name and no job it still reads", bare.lines[0] === "Hi, here is the link you asked for." && bare.lines[1] === "The next part of your application is done on the computer you'd use for this job.", show(bare.lines.slice(0, 2)));
  check("…and names the real site when none is given", /hireflownow\.com\/applications/.test(bare.lines[2]) && S.continueOnComputerEmail().lines.length === 4);
  check("a site given with its scheme or a trailing slash is read as its name", /go to careers\.example\.com\/applications there/.test(S.continueOnComputerEmail({ siteHost: "https://careers.example.com/" }).lines[2]));
  check("stray spaces in a name or a title are tidied", S.continueOnComputerEmail({ firstName: "  Ana   Maria ", jobTitle: "  Host \n " }).lines.slice(0, 2).join("|") === "Hi Ana, here is the link you asked for.|The next part of your application for the Host role is done on the computer you'd use for this job.");
}

/* ── 2. Who may ask ────────────────────────────────────────────────────── */

console.log("\nWho may have it:\n");
{
  const mine = { id: APP, candidate_id: ME, status: "reviewing" };
  check("nobody signed in: refused (401)", S.continueLinkApplicationRefusal(null, mine)?.status === 401 && S.continueLinkApplicationRefusal(undefined, mine)?.code === "not_signed_in" && S.continueLinkApplicationRefusal("", mine)?.status === 401);
  const theirs = S.continueLinkApplicationRefusal(ME, { id: APP, candidate_id: OTHER, status: "reviewing" });
  const missing = S.continueLinkApplicationRefusal(ME, null);
  check("someone else's application: refused (404)", theirs?.status === 404 && theirs.code === "not_found");
  check("…in exactly the words of one that does not exist", show(theirs) === show(missing));
  check("an application with no applicant on it is nobody's", S.continueLinkApplicationRefusal(ME, { id: APP, candidate_id: null, status: "reviewing" })?.status === 404);
  for (const status of ["rejected", "hired"]) {
    check(`a ${status} application: refused, there is nothing to continue (409)`, S.continueLinkApplicationRefusal(ME, { ...mine, status })?.code === "closed");
  }
  for (const status of ["in_progress", "pending", "reviewing", "interview", "offered"]) {
    if (S.continueLinkApplicationRefusal(ME, { ...mine, status }) !== null) check(`their own ${status} application may have it`, false);
  }
  check("their own open application may have it, whatever stage it is at", ["in_progress", "pending", "reviewing", "interview", "offered"].every((status) => S.continueLinkApplicationRefusal(ME, { ...mine, status }) === null));
}

/* ── 3. How often ──────────────────────────────────────────────────────── */

console.log("\nHow often:\n");
{
  const L = S.CONTINUE_LINK_LIMITS;
  check("one every three minutes, four an hour, for one person", L.person.limit === 1 && L.person.windowSecs === 180 && L.personHour.limit === 4 && L.personHour.windowSecs === 3600);
  check("and a ceiling for everyone together", L.everyone.limit > 0 && L.everyone.limit <= 300 && L.everyone.windowSecs === 3600);
  check("three separate counters", new Set([L.person.bucket, L.personHour.bucket, L.everyone.bucket]).size === 3);

  const recorder = (answers) => {
    const calls = [];
    const fn = async (bucket, identifier, limit, windowSecs) => {
      calls.push({ bucket, identifier, limit, windowSecs });
      const a = answers[bucket];
      if (a instanceof Error) throw a;
      return a ?? { allowed: true, hits: 1, retryAfter: 60 };
    };
    return { fn, calls };
  };

  let r = recorder({});
  check("under every limit: it may go", (await S.continueLinkLimitRefusal(ME, r.fn)) === null);
  check("…having asked the person's own counters by their id, then everyone's", show(r.calls.map((c) => [c.bucket, c.identifier])) === show([[L.person.bucket, `user:${ME}`], [L.personHour.bucket, `user:${ME}`], [L.everyone.bucket, "everyone"]]), show(r.calls));

  r = recorder({ [L.person.bucket]: { allowed: false, hits: 2, retryAfter: 95 } });
  let refusal = await S.continueLinkLimitRefusal(ME, r.fn);
  check("a second press inside three minutes: too soon (429), with how long to wait", refusal?.status === 429 && refusal.code === "too_soon" && refusal.retryAfter === 95, show(refusal));
  check("…and the other counters are not touched", r.calls.length === 1);

  r = recorder({ [L.personHour.bucket]: { allowed: false, hits: 5, retryAfter: 1800 } });
  refusal = await S.continueLinkLimitRefusal(ME, r.fn);
  check("a fifth in an hour: too soon", refusal?.code === "too_soon" && refusal.retryAfter === 1800 && r.calls.length === 2);

  refusal = await S.continueLinkLimitRefusal(ME, recorder({ [L.person.bucket]: { allowed: false, hits: 2, retryAfter: 99999 } }).fn);
  check("the wait it names is never longer than the window it counts", refusal?.retryAfter === 180, show(refusal));

  refusal = await S.continueLinkLimitRefusal(ME, recorder({ [L.everyone.bucket]: { allowed: false, hits: 151, retryAfter: 600 } }).fn);
  check("the ceiling for everyone: not sent, and never 'you just asked' (it is not their doing)", refusal?.status === 503 && refusal.code === "try_later" && refusal.retryAfter === undefined, show(refusal));

  // The shared limiter fails OPEN with no count (allowed: true, hits: 0). Here that must be a refusal.
  refusal = await S.continueLinkLimitRefusal(ME, recorder({ [L.person.bucket]: { allowed: true, hits: 0, retryAfter: 0 } }).fn);
  check("a limiter that could not be asked (allowed, but no count): nothing is sent", refusal?.status === 503 && refusal.code === "try_later", show(refusal));
  refusal = await S.continueLinkLimitRefusal(ME, recorder({ [L.personHour.bucket]: new Error("down") }).fn);
  check("a limiter that throws: nothing is sent", refusal?.status === 503 && refusal.code === "try_later");
  refusal = await S.continueLinkLimitRefusal(ME, async () => null);
  check("a limiter that answers nothing: nothing is sent", refusal?.code === "try_later");
}

/* ── 4. One request, start to finish ───────────────────────────────────── */

console.log("\nOne request, decided:\n");
{
  const world = (over = {}) => {
    const seen = { application: [], fullName: [], companyName: [], limits: 0 };
    const lookups = {
      callerId: async () => ME,
      application: async (id) => {
        seen.application.push(id);
        return { id: APP, candidate_id: ME, status: "reviewing", job_title: JOB, employer_id: TEAM };
      },
      fullName: async (id) => {
        seen.fullName.push(id);
        return "Maria Santos";
      },
      companyName: async (id) => {
        seen.companyName.push(id);
        return "Zulu Support Team";
      },
      checkLimit: async () => {
        seen.limits += 1;
        return { allowed: true, hits: 1, retryAfter: 60 };
      },
      ...over,
    };
    return { lookups, seen };
  };

  // Everything a hostile page could put in the request.
  const hostile = {
    application_id: APP,
    recipient_user_id: OTHER,
    user_id: OTHER,
    email: "someone.else@example.com",
    candidate_name: "<b>Free money</b>",
    job_title: "Chief Executive",
    company_name: "Some Other Company",
    message_preview: "click here",
  };
  let w = world();
  let d = await S.decideContinueLinkEmail(hostile, w.lookups);
  check("it goes to whoever is signed in", d.ok === true && d.recipientUserId === ME, show(d));
  check("…with the name, the job and the team as looked up", d.ok && show(d.data) === show({ candidate_name: "Maria Santos", job_title: JOB, company_name: "Zulu Support Team" }), show(d.ok && d.data));
  check("…and nothing the request said about who or what survives", d.ok && !/Free money|Chief Executive|Some Other Company|someone\.else|click here/.test(show(d)) && !show(d).includes(OTHER));
  check("the names are looked up for the caller and the job's own team", show(w.seen.fullName) === show([ME]) && show(w.seen.companyName) === show([TEAM]) && show(w.seen.application) === show([APP]));

  w = world({ callerId: async () => null });
  d = await S.decideContinueLinkEmail({ application_id: APP }, w.lookups);
  check("signed out: refused, and nothing is looked up or counted", d.ok === false && d.refusal.status === 401 && w.seen.application.length === 0 && w.seen.limits === 0, show(d));

  w = world({ application: async () => ({ id: APP, candidate_id: OTHER, status: "reviewing", job_title: JOB, employer_id: TEAM }) });
  d = await S.decideContinueLinkEmail({ application_id: APP }, w.lookups);
  check("someone else's application: refused, and their limit is not spent on it", d.ok === false && d.refusal.status === 404 && w.seen.limits === 0 && w.seen.fullName.length === 0, show(d));

  for (const bad of [undefined, null, "", "not-a-uuid", 42, "44444444-4444-4444-8444-44444444444", `${APP}' or '1'='1`]) {
    w = world();
    d = await S.decideContinueLinkEmail(bad === undefined ? {} : { application_id: bad }, w.lookups);
    if (!(d.ok === false && d.refusal.status === 404 && w.seen.application.length === 0)) check(`an id that is not one (${show(bad)}) is refused without a lookup`, false, show(d));
  }
  check("an id that is not one is refused without touching the database", true);
  for (const junk of [null, undefined, "string", 7, []]) {
    d = await S.decideContinueLinkEmail(junk, world().lookups);
    if (d.ok !== false) check(`a request with no data (${show(junk)}) is refused`, false);
  }
  check("a request with no data at all is refused, not a crash", true);

  w = world({ application: async () => ({ id: APP, candidate_id: ME, status: "rejected", job_title: JOB, employer_id: TEAM }) });
  d = await S.decideContinueLinkEmail({ application_id: APP }, w.lookups);
  check("a closed application: refused before anything is counted", d.ok === false && d.refusal.code === "closed" && w.seen.limits === 0);

  w = world({ checkLimit: async () => ({ allowed: false, hits: 2, retryAfter: 120 }) });
  d = await S.decideContinueLinkEmail({ application_id: APP }, w.lookups);
  check("too soon: refused, and no names are read for an email that will not go", d.ok === false && d.refusal.status === 429 && w.seen.fullName.length === 0, show(d));

  w = world({ fullName: async () => { throw new Error("no profile"); }, companyName: async () => null });
  d = await S.decideContinueLinkEmail({ application_id: APP }, w.lookups);
  check("a name that cannot be read does not stop the email: it just greets nobody by name", d.ok === true && d.recipientUserId === ME && show(d.data) === show({ job_title: JOB }), show(d));
}

/* ── 5. What the page says ─────────────────────────────────────────────── */

console.log("\nThe page reads the answer:\n");
{
  const sent = P.continueLinkEmailOutcome(200, { success: true, recipient: "maria@example.com" });
  check("an explicit success is 'sent', to the address the server named", show(sent) === show({ kind: "sent", to: "maria@example.com" }));
  check("…and with no address named it is still sent", show(P.continueLinkEmailOutcome(200, { success: true })) === show({ kind: "sent", to: null }) && P.continueLinkEmailOutcome(200, { success: true, recipient: "not an address" }).to === null);
  check("200 with emails turned off is NOT 'sent'", P.continueLinkEmailOutcome(200, { message: "Email notifications disabled", email: "maria@example.com" }).kind === "off" && P.continueLinkEmailOutcome(200, { message: "continue_on_computer notifications disabled" }).kind === "off");
  check("200 with the mailer not set up is a failure on our side, not their setting", P.continueLinkEmailOutcome(200, { success: false, skipped: true, reason: "Email service not configured" }).kind === "failed");
  check("200 with nothing in it is not 'sent' either", P.continueLinkEmailOutcome(200, null).kind === "off" && P.continueLinkEmailOutcome(200, { success: "true" }).kind === "off");
  check("429 is 'one went a moment ago', with the server's wait", show(P.continueLinkEmailOutcome(429, { code: "too_soon", retryAfter: 95 })) === show({ kind: "wait", seconds: 95 }));
  check("…a wait that is missing or silly is brought into a sane range", P.continueLinkEmailOutcome(429, {}).seconds === P.CONTINUE_LINK_COOLDOWN_SECONDS && P.continueLinkEmailOutcome(429, { retryAfter: 2 }).seconds === 30 && P.continueLinkEmailOutcome(429, { retryAfter: 999999 }).seconds === 3600 && P.continueLinkEmailOutcome(429, { retryAfter: "soon" }).seconds === P.CONTINUE_LINK_COOLDOWN_SECONDS);
  check("everything else is a plain failure", [401, 404, 409, 500, 503, null, undefined, 0].every((status) => P.continueLinkEmailOutcome(status, { success: true }).kind === "failed"));

  check("after one is sent the button rests as long as the server would refuse another", P.continueLinkRestSeconds(sent) === 180 && P.CONTINUE_LINK_COOLDOWN_SECONDS === S.CONTINUE_LINK_LIMITS.person.windowSecs);
  check("…after 'a moment ago', for the wait it was given; after a failure, not at all", P.continueLinkRestSeconds({ kind: "wait", seconds: 95 }) === 95 && P.continueLinkRestSeconds({ kind: "failed" }) === 0 && P.continueLinkRestSeconds({ kind: "off" }) === 0);

  check("sent: where it went and what to do", P.continueLinkEmailWords(sent) === "Sent to maria@example.com. Open it on your computer.");
  check("…falling back to the address they are signed in with, then to none", P.continueLinkEmailWords({ kind: "sent", to: null }, "me@example.com") === "Sent to me@example.com. Open it on your computer." && P.continueLinkEmailWords({ kind: "sent", to: null }, null) === "Sent. Open it on your computer.");
  check("a moment ago: inbox, spam, and when to try again", P.continueLinkEmailWords({ kind: "wait", seconds: 95 }) === "We sent it a moment ago. Check your inbox and your spam folder, or try again in 2 minutes." && /in a minute\.$/.test(P.continueLinkEmailWords({ kind: "wait", seconds: 30 })));
  check("turned off: nothing was sent, copy instead", P.continueLinkEmailWords({ kind: "off" }) === "Emails are turned off for your account, so nothing was sent. Copy the link instead.");
  check("failed: copy instead, or try again", P.continueLinkEmailWords({ kind: "failed" }) === "Couldn't send it just now. Copy the link instead, or try again in a few minutes.");
  check("only 'sent' ever says an email went", ["wait", "off", "failed"].every((kind) => !/^Sent\b/.test(P.continueLinkEmailWords({ kind, seconds: 60 }))));
  check("before anything is pressed: where it will go, and that copying still works", P.continueLinkHint("me@example.com") === "We'll email the link to me@example.com. Or copy it and send it to yourself.");
  check("the button's words", P.EMAIL_LINK_LABEL === "Email me the link" && P.EMAIL_LINK_SENT_LABEL === "Email sent" && P.EMAIL_LINK_SENDING_LABEL === "Sending…");
  const said = [P.EMAIL_LINK_LABEL, P.EMAIL_LINK_SENT_LABEL, P.continueLinkHint("a@b.co"), ...["sent", "wait", "off", "failed"].map((kind) => P.continueLinkEmailWords({ kind, seconds: 60, to: null }, "a@b.co"))].join(" ");
  check("none of it names a machine, and no dashes", !/\b(ava|a\.?i\.?|bot|automated|algorithm|machine|robot)\b/i.test(said) && !/[—–]/.test(said));
}

/* ── 6. The wiring ─────────────────────────────────────────────────────── */

console.log("\nThe wiring:\n");
{
  check("the page and the function call the email by one name", P.CONTINUE_LINK_EMAIL_TYPE === S.CONTINUE_ON_COMPUTER_TYPE && S.CONTINUE_ON_COMPUTER_TYPE === "continue_on_computer");

  const fn = code(await src("supabase/functions/send-notification-email/index.ts"));
  check("the function knows the type, as a candidate's email under their phase-updates setting", /\| "continue_on_computer";/.test(fn) && /continue_on_computer: "email_phase_updates",/.test(fn));
  const employerFacing = /const EMPLOYER_FACING[\s\S]*?\]\);/.exec(fn)?.[0] ?? "";
  check("…signed by the hiring team, not sent as a team alert", employerFacing.length > 0 && !/continue_on_computer/.test(employerFacing));
  const gateAt = fn.indexOf("if (type === CONTINUE_ON_COMPUTER_TYPE) {");
  const profileAt = fn.indexOf('.from("profiles")\n      .select("email, email_notifications_enabled');
  const sendAt = fn.indexOf("resend.emails.send(");
  check("it is decided BEFORE the recipient is read and long before anything is sent", gateAt > 0 && profileAt > gateAt && sendAt > profileAt, `${gateAt} ${profileAt} ${sendAt}`);
  const gate = fn.slice(gateAt, profileAt);
  check("who is asking comes from their own sign-in, not from the request", /supabase\.auth\.getUser\(token\)/.test(gate) && /req\.headers\.get\("Authorization"\)/.test(gate));
  check("the application is read with its applicant, its status and its job's own team", /\.from\("applications"\)\s*\.select\("id, candidate_id, status, jobs\(title, employer_id\)"\)\s*\.eq\("id", applicationId\)/.test(gate));
  check("the limiter is the shared one", /checkLimit: checkRateLimit,/.test(gate) && /import \{ checkRateLimit \} from "\.\.\/_shared\/rateLimit\.ts";/.test(fn));
  check("a refusal answers there and then: nothing below it runs", /if \(!decision\.ok\) \{[\s\S]*?return new Response\(/.test(gate));
  check("then the recipient and the data are REPLACED by what was decided", /recipient_user_id = decision\.recipientUserId;\s*data = decision\.data;/.test(gate));
  const template = /continue_on_computer: \(\(\) => \{[\s\S]*?\}\)\(\),/.exec(fn)?.[0] ?? "";
  check("the email is built from the shared words, every line escaped", /continueOnComputerEmail\(\{/.test(template) && /words\.lines\.map\(\(line\) => `<p>\$\{esc\(line\)\}<\/p>`\)/.test(template) && /esc\(words\.button\)/.test(template));
  check("its button goes to their applications through candidate sign-in", /candidateLink\("\/applications"\)/.test(template));

  // The mail client answers { data: null, error } when the provider refuses a
  // message; it does not throw. That used to be logged and reported as sent.
  const refusedAt = fn.indexOf("if (emailResponse?.error) {");
  const successAt = fn.indexOf("JSON.stringify({ success: true, emailResponse, recipient: profile.email })");
  check(
    "a message the mail provider refuses is never reported as sent (so 'Sent to …' is only ever true)",
    refusedAt > sendAt && successAt > refusedAt && /if \(emailResponse\?\.error\) \{[\s\S]*?success: false[\s\S]*?status: 502/.test(fn.slice(refusedAt, successAt)),
    `${sendAt} ${refusedAt} ${successAt}`,
  );

  const call = code(await src("src/lib/sendContinueLinkEmail.ts"));
  check("the page sends the application's id and nothing else: no address, no user id", /body: \{ type: CONTINUE_LINK_EMAIL_TYPE, data: \{ application_id: applicationId \} \},/.test(call) && !/recipient_user_id|email:|user\.id|to:/.test(call));
  check("…and reads a refusal's status rather than guessing", /response\.status, body/.test(call) && /continueLinkEmailOutcome\(200, data\)/.test(call));

  const screen = code(await src("src/components/candidate/ContinueOnComputer.tsx"));
  check("the button shows only when there is an address to send to", /\{email && \(\s*<Button onClick=\{emailLink\}/.test(screen));
  check("…cannot be pressed while one is being sent or just went", /disabled=\{emailing \|\| emailResting\}/.test(screen) && /if \(emailing \|\| emailResting\) return;/.test(screen));
  check("…and only says 'Email sent' when one was", /const emailSent = emailResting && emailOutcome\?\.kind === "sent";/.test(screen));
  check("Copy link stays, and is the main action when there is no address", /"Link copied" : "Copy link"/.test(screen) && /variant=\{email \? "outline" : "default"\}/.test(screen));
  check("what happened is said in a line a screen reader announces", /aria-live="polite" data-testid="continue-link-status"/.test(screen));
  check("the screen still starts nothing: no test, timer, attempt or integrity hook is imported", !/useTestIntegrity|useAssessment|assessmentSession|start_assessment_session|record_integrity|useTimer|IntegrityMonitor/.test(screen + call));

  const preview = code(await src("src/dev-preview/install.ts"));
  check("the offline preview answers the button without sending anything", /previewContinueLinkEmail\(ROLE_USERS\[role\], params\.get\("__previewEmail"\)\)/.test(preview) && /body\.type !== "continue_on_computer"/.test(preview));

  const doc = await src("docs/COMPUTER-ONLY-TESTS.md");
  check("the doc no longer says there is no mailer, and describes the button", !/there is no\s+mailer/.test(doc) && /Email me the link/.test(doc) && /continueOnComputerEmail\.ts/.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
