/**
 * Phone pushes were silently skipped forever (2026-09-16): the trigger called
 * extensions.http_post (not on this project; pg_net is net.http_post), and the
 * function demanded a secret header the trigger never sent. The rebuilt
 * contract: the trigger posts only { notification_id }; send-push-notification
 * trusts only the row it loads, claims push_sent_at once, and only ever opens a
 * hireflownow.com path. Proven in scripts/push_notifications.test.mjs.
 */
export default [
  {
    id: "push-notifications-actually-send",
    why:
      "The push trigger must use net.http_post with only the notification id, and send-push-notification " +
      "must load the row itself, claim push_sent_at, run links through pushUrlForLink, and not demand a " +
      "header the trigger cannot send (verify_jwt stays off for it).",
    async run({ read, walk }) {
      const bad = [];
      // Any later rewrite of the trigger (including one from a branch cut before
      // this fix, whose filename may sort earlier) must keep the new contract.
      const HISTORIC = new Set([
        "20260312192158_10503616-a026-4354-8bc3-8f69e2d1b036.sql",
        "20260329145000_fail_open_push_trigger.sql",
        "20260826221000_fix_push_notification_wrong_project_url.sql",
      ]);
      for (const f of (await walk("supabase/migrations", [".sql"])).sort()) {
        if (HISTORIC.has(f.split("/").pop())) continue;
        const sql = ((await read(f)) ?? "").replace(/^\s*--.*$/gm, "");
        const defs = sql.match(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.trigger_push_notification\s*\([\s\S]*?\$\$[\s\S]*?\$\$/gi) ?? [];
        for (const def of defs) {
          if (/extensions\.http_post/i.test(def) || !/net\.http_post/i.test(def) || /'user_id'|'title'|'message'/.test(def)) {
            bad.push(`${f}: trigger_push_notification must call net.http_post with only { notification_id }`);
          }
        }
      }
      const mig = (await read("supabase/migrations/20260916220000_push_notifications_actually_send.sql")) ?? "";
      if (!/net\.http_post\(/.test(mig)) bad.push("the trigger no longer calls net.http_post");
      if (/extensions\.http_post/.test(mig.replace(/^\s*--.*$/gm, ""))) bad.push("the trigger calls extensions.http_post again (does not exist)");
      if (!/jsonb_build_object\('notification_id', NEW\.id\)\s*,/.test(mig)) bad.push("the trigger body is no longer just { notification_id }");
      const fn = (await read("supabase/functions/send-push-notification/index.ts")) ?? "";
      if (!/\.is\("push_sent_at", null\)/.test(fn)) bad.push("send-push-notification no longer claims push_sent_at before sending");
      if (!/pushUrlForLink\(note\.link\)/.test(fn)) bad.push("send-push-notification no longer restricts the push link to hireflownow.com");
      if (/await req\.json\(\)[\s\S]{0,80}user_id/.test(fn)) bad.push("send-push-notification reads user_id from the request body again");
      if (/INTERNAL_FUNCTION_SECRET/.test(fn.replace(/^\s*\*.*$/gm, ""))) bad.push("send-push-notification requires a secret header the trigger never sends");
      const config = (await read("supabase/config.toml")) ?? "";
      if (!/\[functions\.send-push-notification\][^[]*verify_jwt = false/.test(config)) bad.push("verify_jwt is back on for send-push-notification (pg_net sends no JWT)");
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
