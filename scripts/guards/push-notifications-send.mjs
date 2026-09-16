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
    async run({ read }) {
      const bad = [];
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
