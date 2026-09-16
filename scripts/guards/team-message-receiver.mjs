/**
 * A team member's message must go to the candidate on the application it is
 * attached to (2026-09-16). The team-member INSERT policy on public.messages
 * never checked receiver_id, so a team member could message any HireFlow user.
 * Proven in scripts/team_message_receiver.pglite.test.mjs.
 *
 * Checks the NEWEST migration that (re)creates the policy, so a later rewrite
 * that drops the receiver condition fails the build.
 */
const POLICY = "Team members can send messages if permitted";

export default [
  {
    id: "team-message-receiver-is-the-candidate",
    why:
      `The newest migration creating "${POLICY}" must require messages.receiver_id = a.candidate_id, ` +
      "or a team member can put a message in any user's inbox by attaching an application from an assigned job.",
    async run({ read, walk }) {
      const files = (await walk("supabase/migrations", [".sql"])).sort((a, b) => a.split("/").pop().localeCompare(b.split("/").pop()));
      let newest = null;
      let body = "";
      for (const f of files) {
        const sql = (await read(f)) ?? "";
        const at = sql.search(new RegExp(`CREATE POLICY\\s+"${POLICY}"`, "i"));
        if (at === -1) continue;
        newest = f;
        body = sql.slice(at, sql.indexOf(";", at));
      }
      if (!newest) return { ok: false, detail: [`no migration creates "${POLICY}"`] };
      return /messages\.receiver_id\s*=\s*a\.candidate_id/i.test(body)
        ? { ok: true }
        : { ok: false, detail: [`${newest}: "${POLICY}" no longer requires receiver_id = the application's candidate`] };
    },
  },
];
