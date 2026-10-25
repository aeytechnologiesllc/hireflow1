/**
 * No new migration adds a wide-open policy (2026-10-25; docs/LAUNCH-PLAN.md,
 * Phase 1, task 6).
 *
 * The early demo migrations created USING (true) / WITH CHECK (true)
 * policies on real tables and storage ("demo upload interview audio" let
 * anyone write any file to any bucket). 20261025050000_drop_leftover_open_policies.sql
 * drops every one left, except the two intended public reads. This guard
 * keeps a migration written after it from adding one back. A new intended
 * public read goes in ALLOWED with the reason.
 */

const AFTER = "20261025050000";
const ALLOWED = new Set([
  // "public.app_settings: app_settings readable by anyone" — billing flags and the AI ceiling.
  // "public.business_pages: Anyone reads a careers page" — a business's public careers page.
]);

function statements(sql) {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default [
  {
    id: "no-open-policies-in-new-migrations",
    why:
      "A migration after 20261025050000 creates a policy whose USING or WITH CHECK is just " +
      "(true): every row (or every storage object) open to whoever the policy names. Scope it " +
      "with auth.uid() / an ownership check, or, if it is a genuine public read, add it to " +
      "ALLOWED in this guard with the reason.",
    run: async ({ read, walk }) => {
      const detail = [];
      for (const rel of await walk("supabase/migrations", [".sql"])) {
        const name = rel.split("/").pop() ?? "";
        if (name.slice(0, 14) <= AFTER) continue;
        const sql = (await read(rel)) ?? "";
        for (const stmt of statements(sql)) {
          if (!/^create\s+policy/i.test(stmt)) continue;
          if (!/\b(using|with\s+check)\s*\(\s*true\s*\)/i.test(stmt)) continue;
          const m = /create\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)/i.exec(stmt);
          const key = m ? `${m[2]}: ${m[1]}` : stmt.slice(0, 80);
          if (!ALLOWED.has(key)) detail.push(`${name}: ${key}`);
        }
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
