/**
 * The seventeenth Phase 5 review and the sixteenth security review
 * (2026-10-26), locked (20261025700000_decline_names_the_job_as_applied.sql).
 *
 * A decline is not contact (it is the email a business sends most, to people
 * it turned down, so counting it would let three of them pause a real
 * business by reporting). Both reviews showed what that cost: the decline,
 * and the server's own decision and step cards, carried text the business
 * can change after the person applied, the job's title (a closed job can be
 * renamed to anything, and nobody else sees it) and its own name.
 *
 *   - team-moves-are-contact: the hiring team's browser moving an application
 *     to an interview, an offer, a hire or another step is a "message"
 *     contact for the job's business (business_contacts_remember_move), never
 *     a move to rejected, the applicant's own or the server's. The review's
 *     probe po: closed, renamed "Chat support agent. To accept, pay the 1,500
 *     PHP onboarding kit fee by GCash ...", three moved to an offer, renamed
 *     back; their three reports left it open.
 *   - decline-names-the-job-as-applied: an application keeps the job's title
 *     and the business's name as they were when it was made (set by the
 *     database, kept from every browser), and the decline email and the
 *     server's decision and step cards name them, never the job's or the
 *     business's live words.
 *   - decline-once-for-a-real-decline: send-notification-email sends a
 *     decline only for an application the team has turned down, once
 *     (decline_email_claim, the service role's only, before it sends), and
 *     sends nothing when that mark cannot be written. The security review's
 *     P1: three declines each, from a business renamed "Zulu: pay 1,500 PHP
 *     to GCash ...", to people still under review.
 *
 * Proved by behaviour too: launch_locks_behaviour section 26 and
 * scripts/notification_access.test.mjs (sections 3c and C).
 */

import { grantsToBrowser, latestDefinition, triggerProblems } from "./phase-7-launch-locks.mjs";

/** SQL or code without comments, spaces collapsed. */
const plain = (text) => (text ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
const code = (text) => (text ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\s+/g, " ");

/** A server-only function: its own rights when asked, revoked from every browser role, granted to none. */
async function serverOnly(ctx, fn, { definer = true } = {}) {
  const detail = [];
  const def = await latestDefinition(ctx, fn);
  if (!def) return { def: null, detail: [`no migration defines ${fn}`] };
  if (definer && !def.securityDefiner) detail.push(`${def.alteredIn ?? def.rel}: ${fn} must run with its own rights`);
  const file = plain((await ctx.read(def.rel)) ?? "");
  if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`, "i").test(file)) detail.push(`${def.rel}: ${fn} must be revoked from PUBLIC, anon and authenticated`);
  for (const rel of await grantsToBrowser(ctx, fn)) detail.push(`${rel}: grants ${fn} to a browser role`);
  return { def, detail };
}

export default [
  {
    id: "team-moves-are-contact",
    why:
      "The hiring team moved applicants to an offer and a hire from a browser after renaming its closed job to fee " +
      "instructions; the server's cards carried that title to their bells and phones, and nothing recorded it, so their " +
      "three reports left the business open (the seventeenth Phase 5 review, finding 1, probe po). Such a move is a " +
      "message from the business; a move to rejected is not.",
    run: async (ctx) => {
      const detail = await triggerProblems(ctx, {
        name: "business_contacts_remember_move",
        table: "applications",
        timing: "AFTER",
        event: "UPDATE",
        fn: "business_contacts_remember_move",
        when: "current_user = 'authenticated' AND NEW.status IS DISTINCT FROM 'rejected' AND ((NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('interview', 'offered', 'hired')) OR NEW.phase IS DISTINCT FROM OLD.phase)",
      });
      const fn = await serverOnly(ctx, "business_contacts_remember_move");
      detail.push(...fn.detail);
      if (fn.def) {
        const body = plain(fn.def.body);
        if (
          !/IF auth\.uid\(\) IS NULL OR auth\.uid\(\) = NEW\.candidate_id THEN RETURN NULL; END IF; IF NOT \(public\.is_job_owner\(NEW\.job_id, auth\.uid\(\)\) OR public\.is_active_team_member_for_job\(NEW\.job_id, auth\.uid\(\)\)\) THEN RETURN NULL; END IF; INSERT INTO private\.business_contacts AS c \(employer_id, person_id, kind\) SELECT j\.employer_id, NEW\.candidate_id, 'message' FROM public\.jobs j WHERE j\.id = NEW\.job_id AND NEW\.candidate_id IS NOT NULL AND j\.employer_id IS DISTINCT FROM NEW\.candidate_id ON CONFLICT \(employer_id, person_id, kind\) DO UPDATE SET last_at = greatest\(c\.last_at, EXCLUDED\.last_at\); RETURN NULL;/i.test(body)
        )
          detail.push(`${fn.def.rel}: business_contacts_remember_move must record a message for the job's business only when the writer is the job's owner or an active teammate on it, never the applicant, keeping the first time (as written)`);
      }
      // The trigger watches the two columns a move writes.
      const file = plain((await ctx.read("supabase/migrations/20261025700000_decline_names_the_job_as_applied.sql")) ?? "");
      if (!/CREATE TRIGGER business_contacts_remember_move AFTER UPDATE OF status, phase ON public\.applications/i.test(file))
        detail.push("supabase/migrations/20261025700000_decline_names_the_job_as_applied.sql: business_contacts_remember_move must fire AFTER UPDATE OF status, phase on applications");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "decline-names-the-job-as-applied",
    why:
      "A decline is no contact, and it carried the job's title and the business's name, both of which the business can " +
      "change after the person applied (a closed job renamed \"CSR (reconsideration: send 500 PHP to GCash ...)\", a " +
      "business renamed \"Zulu: pay 1,500 PHP to GCash ...\"; the seventeenth Phase 5 review's pd, the sixteenth security " +
      "review's P1 and P1b). The decline and the server's decision and step cards name them as they were then.",
    run: async (ctx) => {
      const detail = [];
      // The application keeps them: set on every insert, kept from every browser.
      detail.push(...(await triggerProblems(ctx, { name: "applications_as_applied", table: "applications", timing: "BEFORE", event: "INSERT", fn: "applications_as_applied" })));
      detail.push(...(await triggerProblems(ctx, { name: "applications_as_applied_kept", table: "applications", timing: "BEFORE", event: "UPDATE", fn: "applications_as_applied", when: "current_user IN ('anon', 'authenticated')" })));
      const keep = await serverOnly(ctx, "applications_as_applied");
      detail.push(...keep.detail);
      if (keep.def) {
        const body = plain(keep.def.body);
        if (!/IF TG_OP = 'INSERT' THEN NEW\.applied_job_title := NULL; NEW\.applied_company_name := NULL; SELECT j\.title, p\.company_name INTO NEW\.applied_job_title, NEW\.applied_company_name FROM public\.jobs j LEFT JOIN public\.profiles p ON p\.user_id = j\.employer_id WHERE j\.id = NEW\.job_id; RETURN NEW; END IF; NEW\.applied_job_title := OLD\.applied_job_title; NEW\.applied_company_name := OLD\.applied_company_name; RETURN NEW;/i.test(body))
          detail.push(`${keep.def.rel}: applications_as_applied must set the job's title and its business's name from the database on every insert, whatever was sent, and keep them on a browser's update (as written)`);
      }
      // The server's cards read them, never the job or the profile.
      const status = await latestDefinition(ctx, "notify_application_status_change");
      const sbody = plain(status?.body);
      if (!/job_title := NEW\.applied_job_title; company_name := NEW\.applied_company_name;/i.test(sbody) || /FROM\s+(?:public\.)?jobs\b|FROM\s+(?:public\.)?profiles\b/i.test(sbody))
        detail.push(`${status?.rel ?? "supabase/migrations"}: notify_application_status_change must name the job and the business as they were when the person applied (NEW.applied_job_title, NEW.applied_company_name), never the job's or the profile's live words`);
      const step = await latestDefinition(ctx, "notify_application_phase_advanced");
      const pbody = plain(step?.body);
      if (!/v_job_title := NEW\.applied_job_title;/i.test(pbody) || /FROM\s+(?:public\.)?jobs\b/i.test(pbody))
        detail.push(`${step?.rel ?? "supabase/migrations"}: notify_application_phase_advanced must name the job as it was when the person applied (NEW.applied_job_title)`);
      // The decline email reads them too, and only for an application turned down.
      const access = code(await ctx.read("supabase/functions/_shared/notificationAccess.ts"));
      if (
        !access.includes('const turnedDown = links.filter((l) => l.status === "rejected");') ||
        !access.includes('if (type === "status_rejected" && !declined) return { ok: false, refusal: NOT_ALLOWED };') ||
        !access.includes("job_title: declined ? plainLine(declined.applied_job_title, 200) :") ||
        !access.includes("company_name: declined ? plainLine(declined.applied_company_name, 120) :") ||
        !access.includes("declineOf: declined?.id,")
      )
        detail.push("supabase/functions/_shared/notificationAccess.ts: a decline must be for an application of theirs the team turned down, and name its job and business as they were when they applied (applied_job_title, applied_company_name), never the live ones");
      const fn = code(await ctx.read("supabase/functions/send-notification-email/index.ts"));
      if (!fn.includes('.select("id, job_id, status, created_at, applied_job_title, applied_company_name, jobs(title, employer_id)")'))
        detail.push("supabase/functions/send-notification-email/index.ts: the applications a decision reads must carry their status and what they were when made");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "decline-once-for-a-real-decline",
    why:
      "A business could send the decline to anyone who applied, as often as it liked: the security review's P1 sent three " +
      "each, from a business renamed with a fee, to people still under review (the sixteenth security review, finding 1). " +
      "It goes only for an application the team turned down, once, marked by the server before it is sent.",
    run: async (ctx) => {
      const detail = [];
      const claim = await serverOnly(ctx, "decline_email_claim");
      detail.push(...claim.detail);
      if (claim.def && !/IF p_application IS NULL THEN RETURN false; END IF; INSERT INTO private\.decline_emails \(application_id\) SELECT a\.id FROM public\.applications a WHERE a\.id = p_application AND a\.status = 'rejected' ON CONFLICT \(application_id\) DO NOTHING; RETURN FOUND;/i.test(plain(claim.def.body)))
        detail.push(`${claim.def.rel}: decline_email_claim must mark an application only when it is turned down, and answer true only the first time (as written)`);
      const release = await serverOnly(ctx, "decline_email_release");
      detail.push(...release.detail);
      const file = plain((await ctx.read("supabase/migrations/20261025700000_decline_names_the_job_as_applied.sql")) ?? "");
      if (!/CREATE TABLE IF NOT EXISTS private\.decline_emails \( application_id uuid PRIMARY KEY REFERENCES public\.applications\(id\) ON DELETE CASCADE,/i.test(file) || !/REVOKE ALL ON TABLE private\.decline_emails FROM PUBLIC, anon, authenticated, service_role;/i.test(file))
        detail.push("supabase/migrations/20261025700000_decline_names_the_job_as_applied.sql: private.decline_emails must keep one row per application, go with it, and be no API role's");
      // The function marks it after the recipient's settings and before it sends.
      const fn = code(await ctx.read("supabase/functions/send-notification-email/index.ts"));
      const main = fn.indexOf("if (type !== CONTINUE_ON_COMPUTER_TYPE) {");
      const settings = fn.indexOf("if (preferenceValue === false) {", main);
      const mark = fn.indexOf('const { data: first, error: claimError } = await supabase.rpc("decline_email_claim", { p_application: declineOf });', main);
      const send = fn.indexOf("const emailResponse = await resend.emails.send(", main);
      if (!(main > 0 && settings > main && mark > settings && send > mark))
        detail.push("supabase/functions/send-notification-email/index.ts: a decline must be marked (decline_email_claim) after the recipient's settings and before it is sent");
      const between = fn.slice(mark, send);
      if (!/if \(claimError\) \{ console\.error\([^;]*\); return refuse\(503, /.test(between) || !/if \(first !== true\) \{[\s\S]{0,300}?return new Response\(/.test(between))
        detail.push("supabase/functions/send-notification-email/index.ts: a decline that cannot be marked, or was already sent, must not be sent");
      if ((fn.match(/declineOf = /g) ?? []).length !== 1 || !/declineOf = access\.declineOf \?\? null;/.test(fn))
        detail.push("supabase/functions/send-notification-email/index.ts: only the decision (notificationAccess) may name the application a decline is for");
      // A decline the mail provider refused went nowhere: its mark is taken back.
      if (!/if \(emailResponse\?\.error\) \{[^]{0,400}?if \(declineOf\) \{ const \{ error: releaseError \} = await supabase\.rpc\("decline_email_release", \{ p_application: declineOf \}\);/.test(fn.slice(send)))
        detail.push("supabase/functions/send-notification-email/index.ts: a decline the mail provider refused must be unmarked (decline_email_release), so that it can still go");
      // The application the screens name, when it is one of theirs turned down.
      const access = code(await ctx.read("supabase/functions/_shared/notificationAccess.ts"));
      if (!access.includes('? (typeof asked.application_id === "string" ? turnedDown.find((l) => l.id === asked.application_id) : undefined) ?? turnedDown[0]'))
        detail.push("supabase/functions/_shared/notificationAccess.ts: a decline must be for the application the request names when that one is turned down (the Pass screens name it), else the newest turned down");
      return { ok: detail.length === 0, detail };
    },
  },
];
