/**
 * team_members INSERT policy "Users can join via invitation" checked only
 * `auth.uid() = user_id` -- nothing tied the row to a real invitation or to
 * the employer_id being claimed, so any signed-in user could insert
 * themselves into ANY employer's team. Separately, team_invitations SELECT
 * policy "Anyone can view invitations by code" was `USING (invite_code IS
 * NOT NULL)` -- a per-row filter, not an equality check -- so an unfiltered
 * `select *` returned every pending invitation (invite_code, invitee_email,
 * permissions) across every employer. A third policy, "Invitees can accept
 * their invitations", let any authenticated user flip any pending
 * invitation to accepted with no invitee-identity check at all.
 *
 * The fix moved acceptance behind two SECURITY DEFINER RPCs
 * (get_team_invitation_by_code, accept_team_invitation) and dropped all
 * three client-satisfiable policies. This guard checks the migration is
 * still in the tree with its DROP/REVOKE/GRANT lines intact, and that
 * JoinTeam.tsx calls the RPCs instead of touching the tables directly.
 */
export default [
  {
    id: "team-invitations-lockdown",
    why: "If the client-satisfiable team_members INSERT policy or the blanket team_invitations SELECT/UPDATE-by-code policies come back (directly, or because JoinTeam.tsx reverts to querying/writing the tables itself), any signed-in user can join any employer's team and read every pending invitation on the platform again.",
    run: async ({ read }) => {
      const detail = [];

      const migration = await read(
        "supabase/migrations/20260915120000_team_invitations_lockdown.sql",
      );
      if (migration == null) {
        detail.push("supabase/migrations/20260915120000_team_invitations_lockdown.sql is missing");
        return { ok: false, detail };
      }

      if (!/drop policy if exists "Anyone can view invitations by code" on public\.team_invitations/i.test(migration)) {
        detail.push('migration no longer drops "Anyone can view invitations by code" on team_invitations');
      }
      if (!/drop policy if exists "Invitees can accept their invitations" on public\.team_invitations/i.test(migration)) {
        detail.push('migration no longer drops "Invitees can accept their invitations" on team_invitations');
      }
      if (!/drop policy if exists "Users can join via invitation" on public\.team_members/i.test(migration)) {
        detail.push('migration no longer drops "Users can join via invitation" on team_members');
      }

      if (!/create or replace function public\.get_team_invitation_by_code/i.test(migration)) {
        detail.push("migration no longer defines get_team_invitation_by_code");
      }
      // Must be scoped to an exact code, still pending, still unexpired --
      // not a listing, not an already-used/expired invitation.
      if (!/ti\.invite_code\s*=\s*p_code/.test(migration)) {
        detail.push("get_team_invitation_by_code no longer matches invite_code by exact equality");
      }
      if (!/ti\.status\s*=\s*'pending'/.test(migration) || !/ti\.expires_at\s*>\s*now\(\)/.test(migration)) {
        detail.push("get_team_invitation_by_code no longer restricts to pending + unexpired rows");
      }

      if (!/create or replace function public\.accept_team_invitation/i.test(migration)) {
        detail.push("migration no longer defines accept_team_invitation");
      }
      if (!/lower\(trim\(v_invite\.invitee_email\)\)\s+is\s+distinct\s+from\s+lower\(trim\(v_user_email\)\)/i.test(migration)) {
        detail.push("accept_team_invitation no longer does a case-insensitive invitee-email check");
      }
      if (!/select\s+email\s+into\s+v_user_email\s+from\s+auth\.users/i.test(migration)) {
        detail.push("accept_team_invitation no longer reads the caller's email server-side from auth.users (a client-supplied email could bypass the match check)");
      }
      if (!/v_invite\.permission_level/.test(migration) || !/v_invite\.assigned_job_ids/.test(migration)) {
        detail.push("accept_team_invitation no longer copies permission_level/assigned_job_ids from the invitation row");
      }

      if (!/revoke execute on function public\.accept_team_invitation\(text\) from anon/i.test(migration)) {
        detail.push("migration no longer revokes EXECUTE on accept_team_invitation from anon");
      }
      if (!/grant execute on function public\.get_team_invitation_by_code\(text\) to anon, authenticated/i.test(migration)) {
        detail.push("migration no longer grants get_team_invitation_by_code to anon (JoinTeam must work signed-out)");
      }

      const joinTeam = await read("src/pages/JoinTeam.tsx");
      if (joinTeam == null) {
        detail.push("src/pages/JoinTeam.tsx is missing");
        return { ok: false, detail };
      }

      if (!/supabase\.rpc\(\s*["']get_team_invitation_by_code["']/.test(joinTeam)) {
        detail.push("JoinTeam.tsx no longer calls the get_team_invitation_by_code RPC");
      }
      if (!/supabase\.rpc\(\s*["']accept_team_invitation["']/.test(joinTeam)) {
        detail.push("JoinTeam.tsx no longer calls the accept_team_invitation RPC");
      }
      if (/\.from\(\s*["']team_invitations["']\s*\)\s*\.select/.test(joinTeam)) {
        detail.push("JoinTeam.tsx still selects directly from team_invitations instead of using the RPC");
      }
      if (/\.from\(\s*["']team_members["']\s*\)\s*\.insert/.test(joinTeam)) {
        detail.push("JoinTeam.tsx still inserts directly into team_members instead of using accept_team_invitation");
      }
      if (/\.from\(\s*["']team_invitations["']\s*\)\s*\.update/.test(joinTeam)) {
        detail.push("JoinTeam.tsx still updates team_invitations status directly instead of using accept_team_invitation");
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
