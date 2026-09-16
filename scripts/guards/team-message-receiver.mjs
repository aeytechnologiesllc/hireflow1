/**
 * A team member's message must go to the candidate on the application it is
 * attached to (2026-09-16). The team-member INSERT policy on public.messages
 * never checked receiver_id, so a team member could message any HireFlow user.
 * Proven in scripts/team_message_receiver.pglite.test.mjs.
 *
 * Every migration that (re)creates the policy must keep the receiver
 * condition, except the historic file below. Not just the newest by name: a
 * branch cut before the fix (e.g. a policy consolidation built from an older
 * snapshot of live policies) sorts earlier but would be applied later.
 */
const POLICY = "Team members can send messages if permitted";
// Already applied, and superseded by 20260916213000. Never add a new file here.
const HISTORIC = new Set(["20251215060535_ff04f7dd-ee9c-4df4-925b-3b490f1ba9d3.sql"]);

export default [
  {
    id: "team-message-receiver-is-the-candidate",
    why:
      `The newest migration creating "${POLICY}" must require messages.receiver_id = a.candidate_id, ` +
      "or a team member can put a message in any user's inbox by attaching an application from an assigned job.",
    async run({ read, walk }) {
      const files = (await walk("supabase/migrations", [".sql"])).sort();
      const bad = [];
      let fixed = false;
      for (const f of files) {
        const name = f.split("/").pop();
        const sql = (await read(f)) ?? "";
        // Judge by content, not by name: a policy consolidation can drop this
        // policy and fold its team-member branch into a differently named one.
        const creates = sql.match(/CREATE POLICY[\s\S]*?;/gi) ?? [];
        for (const stmt of creates) {
          const onMessages = /\bON\s+(public\.)?"?messages"?\s/i.test(stmt);
          const forInsert = /FOR\s+(INSERT|ALL)\b/i.test(stmt);
          if (!onMessages || !forInsert || !/team_members/i.test(stmt)) continue;
          if (/messages\.receiver_id\s*=\s*a\.candidate_id/i.test(stmt)) fixed = true;
          else if (!HISTORIC.has(name)) {
            const label = (stmt.match(/CREATE POLICY\s+"([^"]+)"/i) ?? [])[1] ?? "(unnamed)";
            bad.push(`${f}: messages INSERT policy "${label}" has a team-member branch without receiver_id = the application's candidate`);
          }
        }
      }
      if (!fixed) bad.push(`no migration creates a team-member messages INSERT policy with the receiver condition`);
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
