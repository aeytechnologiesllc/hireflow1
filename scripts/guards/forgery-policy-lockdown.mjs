/**
 * C2: three INSERT policies let a client forge database records:
 *
 *   (a) blueprint_purchases — WITH CHECK (auth.uid() = user_id), no payment
 *       check, so any candidate could self-insert a "purchased" row and
 *       useImprovementBlueprint.ts unlocks the paid report on row existence.
 *   (b) document_audit_logs — "System can insert audit logs" WITH CHECK
 *       (true), no TO clause, so anon could forge a 'candidate_signed' row
 *       with any signer_name, which supabase/functions/verify-document reads
 *       as a real signing attestation on its public verification page.
 *   (c) messages — WITH CHECK (auth.uid() = sender_id) only, so any
 *       authenticated user could message any other user on any
 *       application_id and trigger a notification at them.
 *
 * Fixed by supabase/migrations/20260915121000_forgery_policy_lockdown.sql —
 * see its header comments for the full reasoning and a PGlite proof at
 * scripts/forgery_policy_lockdown.pglite.test.mjs (run it directly; it needs
 * a real Postgres engine, so it is not wired into these static guards).
 *
 * These guards are static text checks over the migration itself — cheap and
 * fast, but not a substitute for the PGlite proof. Run that separately:
 *   node scripts/forgery_policy_lockdown.pglite.test.mjs
 */

const MIGRATION = "supabase/migrations/20260915121000_forgery_policy_lockdown.sql";

export default [
  {
    id: "forgery-lockdown-migration-exists",
    why:
      `${MIGRATION} must exist and drop all three vulnerable INSERT policies — ` +
      "without it, blueprint_purchases/document_audit_logs/messages stay forgeable in production.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];
      const mustDrop = [
        [`DROP POLICY IF EXISTS "Users can insert their own blueprint purchases" ON public.blueprint_purchases;`, "blueprint_purchases (a)"],
        [`DROP POLICY IF EXISTS "System can insert audit logs" ON public.document_audit_logs;`, "document_audit_logs (b)"],
        [`DROP POLICY IF EXISTS "Users can send messages" ON public.messages;`, "messages (c)"],
      ];
      for (const [stmt, label] of mustDrop) {
        if (!sql.includes(stmt)) bad.push(`missing exact drop for ${label}: ${stmt}`);
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "blueprint-purchases-has-no-client-insert-policy",
    why:
      "blueprint_purchases must have ZERO client-facing INSERT policy after the fix — the only legitimate " +
      "writer (supabase/functions/verify-blueprint-purchase) runs on service_role, which bypasses RLS and " +
      "needs no policy at all. Any new CREATE POLICY ... FOR INSERT here would reopen a forgery path.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];
      // Look for any CREATE POLICY whose FOR INSERT is on blueprint_purchases,
      // anywhere in the file (blueprint_purchases has no other table this
      // could false-positive against).
      if (/CREATE POLICY[\s\S]*?ON public\.blueprint_purchases[\s\S]*?FOR INSERT/i.test(sql)) {
        bad.push("a new INSERT policy on blueprint_purchases was (re)introduced — it should stay service-role-only");
      }
      if (!/REVOKE INSERT ON public\.blueprint_purchases FROM authenticated, anon;/.test(sql)) {
        bad.push("missing the belt-and-braces REVOKE INSERT ON public.blueprint_purchases FROM authenticated, anon;");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "document-audit-logs-insert-is-scoped-and-non-signing",
    why:
      "The replacement document_audit_logs INSERT policy must (1) never use WITH CHECK (true), (2) apply " +
      "TO authenticated only (not PUBLIC/anon), (3) restrict `action` to a fixed allow-list of non-signing " +
      "activity, and (4) require the caller be a real party to the document — otherwise verify-document's " +
      "public signer list stays forgeable.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];

      const m = /CREATE POLICY "Related parties can log non-signing document activity"\s*\nON public\.document_audit_logs\s*\nFOR INSERT\s*\nTO authenticated\s*\nWITH CHECK \(([\s\S]*?)\);/.exec(sql);
      if (!m) {
        bad.push('expected CREATE POLICY "Related parties can log non-signing document activity" ON public.document_audit_logs FOR INSERT TO authenticated ... not found verbatim');
      } else {
        const body = m[1];
        if (!/action = ANY \(ARRAY\[/.test(body)) bad.push("policy body has no `action = ANY (ARRAY[...])` allow-list");
        for (const forbidden of ["candidate_signed", "employer_countersigned", "electronic_consent_confirmed", "document_completed"]) {
          if (body.includes(`'${forbidden}'`)) bad.push(`signing action '${forbidden}' must not be in the client allow-list`);
        }
        if (!/is_job_owner\(/.test(body)) bad.push("policy body no longer checks public.is_job_owner(...) for the employer party");
        if (!/is_active_team_member_for_job\(/.test(body)) bad.push("policy body no longer checks public.is_active_team_member_for_job(...) for the team-member party");
        if (!/user_id\s*=\s*auth\.uid\(\)/.test(body)) bad.push("policy body no longer pins user_id = auth.uid()");
      }

      // (the migration's own header comment quotes the OLD vulnerable
      // `WITH CHECK (true)` verbatim for the record — matching
      // lockdown_subscription_writes.sql / lockdown_notification_inserts.sql
      // — so this only checks the NEW policy body captured above, not the
      // whole file.)

      // The identity/hash-forcing trigger must exist and must special-case
      // service_role so the future real signing pipeline is not blocked.
      if (!/CREATE TRIGGER enforce_audit_log_identity/.test(sql)) {
        bad.push("missing the enforce_audit_log_identity BEFORE INSERT trigger");
      }
      if (!/auth\.role\(\)\s*=\s*'service_role'/.test(sql)) {
        bad.push("trigger function no longer special-cases auth.role() = 'service_role'");
      }
      for (const field of ["document_hash", "pre_signature_hash", "post_signature_hash", "signature_event_id", "signer_name", "signer_email", "signer_role"]) {
        if (!sql.includes(`NEW.${field}`)) bad.push(`trigger no longer touches NEW.${field}`);
      }

      if (!/REVOKE INSERT ON public\.document_audit_logs FROM anon;/.test(sql)) {
        bad.push("missing REVOKE INSERT ON public.document_audit_logs FROM anon;");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "messages-insert-checks-receiver-not-just-sender",
    why:
      "The replacement messages INSERT policy must check that sender AND receiver are real application " +
      "counterparties (candidate <-> job owner via public.is_job_owner), not just that the sender is who " +
      "they claim — otherwise any authenticated user can still DM any other user id.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];

      const m = /CREATE POLICY "Counterparties can send messages"\s*\nON public\.messages\s*\nFOR INSERT\s*\nTO authenticated\s*\nWITH CHECK \(([\s\S]*?)\);/.exec(sql);
      if (!m) {
        bad.push('expected CREATE POLICY "Counterparties can send messages" ON public.messages FOR INSERT TO authenticated ... not found verbatim');
      } else {
        const body = m[1];
        if (!/auth\.uid\(\)\s*=\s*sender_id/.test(body)) bad.push("policy body no longer pins auth.uid() = sender_id");
        if (!/messages\.receiver_id/.test(body)) bad.push("policy body never references messages.receiver_id — receiver is unchecked again");
        if (!/is_job_owner\(/.test(body)) bad.push("policy body no longer uses public.is_job_owner(...)");
        if (!/messages\.application_id IS NULL/.test(body)) {
          bad.push("policy body no longer tolerates a NULL application_id (6 of 7 live rows have one — see migration header)");
        }
      }

      // The untouched team-member sibling policy must survive this migration
      // (it is not supposed to be dropped or recreated here).
      if (/DROP POLICY[^\n]*"Team members can send messages if permitted"/.test(sql)) {
        bad.push('the untouched sibling policy "Team members can send messages if permitted" must not be dropped by this migration');
      }

      if (!/REVOKE INSERT ON public\.messages FROM anon;/.test(sql)) {
        bad.push("missing REVOKE INSERT ON public.messages FROM anon;");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
